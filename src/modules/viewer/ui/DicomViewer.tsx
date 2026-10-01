"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LoadedSeries } from "../server";
import { WINDOW_LEVEL_PRESETS, toMeasurementEvent, type MeasurementEvent, type WindowLevelPresetId } from "../domain/manifest";

/**
 * Client-only Cornerstone3D stack viewer. Always load with:
 *
 *   const DicomViewer = dynamic(
 *     () => import("@/modules/viewer/ui/DicomViewer").then((m) => m.DicomViewer),
 *     { ssr: false },
 *   );
 *
 * Cornerstone touches `window`/canvas/WebGL, so it cannot run on the server
 * (see AGENTS.md / Next.js lazy-loading guide: "ssr: false" must be set from
 * inside a Client Component, which this file is).
 */

const RENDERING_ENGINE_ID = "radpilot-viewer";
const VIEWPORT_ID = "radpilot-stack-viewport";
const TOOL_GROUP_PREFIX = "radpilot-tool-group";

type CoreModule = typeof import("@cornerstonejs/core");
type ToolsModule = typeof import("@cornerstonejs/tools");
type DicomImageLoaderModule = typeof import("@cornerstonejs/dicom-image-loader").default;

interface CornerstoneModules {
  core: CoreModule;
  tools: ToolsModule;
  dicomImageLoader: DicomImageLoaderModule;
}

let cornerstoneInitPromise: Promise<CornerstoneModules> | null = null;

/** Initialize Cornerstone3D + the DICOM image loader exactly once per page. */
function initCornerstone(): Promise<CornerstoneModules> {
  if (!cornerstoneInitPromise) {
    cornerstoneInitPromise = (async () => {
      const [core, tools, dicomImageLoaderModule] = await Promise.all([
        import("@cornerstonejs/core"),
        import("@cornerstonejs/tools"),
        import("@cornerstonejs/dicom-image-loader"),
      ]);
      const dicomImageLoader = dicomImageLoaderModule.default;

      core.init();
      tools.init();

      dicomImageLoader.init({ maxWebWorkers: Math.min(2, navigator.hardwareConcurrency || 1) });

      core.imageLoader.registerImageLoader("wadouri", dicomImageLoader.wadouri.loadImage);
      core.metaData.addProvider(dicomImageLoader.wadouri.metaData.metaDataProvider, 10000);

      return { core, tools, dicomImageLoader };
    })();
  }
  return cornerstoneInitPromise;
}

export interface DicomViewerProps {
  series: LoadedSeries;
  /** Used only to render "series N image M" in the measurement text. */
  seriesNumber?: number;
  onInsertMeasurement?: (event: MeasurementEvent) => void;
}

export function DicomViewer({ series, seriesNumber = 1, onInsertMeasurement }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<InstanceType<CornerstoneModules["core"]["StackViewport"]> | null>(null);
  const modulesRef = useRef<CornerstoneModules | null>(null);
  const toolGroupId = `${TOOL_GROUP_PREFIX}-${useId()}`;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [activePreset, setActivePreset] = useState<WindowLevelPresetId | null>(null);
  const [activeTool, setActiveTool] = useState<"pan" | "zoom" | "length">("zoom");
  const [pendingMeasurement, setPendingMeasurement] = useState<MeasurementEvent | null>(null);

  const imageIds = useMemo(
    () => series.instances.map((instance) => `wadouri:${instance.signedUrl}`),
    [series.instances],
  );

  // Set up the rendering engine, stack viewport and tool group once.
  useEffect(() => {
    let destroyed = false;
    const element = elementRef.current;
    if (!element) return;

    (async () => {
      try {
        const modules = await initCornerstone();
        if (destroyed) return;
        modulesRef.current = modules;
        const { core, tools } = modules;

        const renderingEngine = new core.RenderingEngine(RENDERING_ENGINE_ID);
        renderingEngine.enableElement({
          viewportId: VIEWPORT_ID,
          type: core.Enums.ViewportType.STACK,
          element,
        });
        const viewport = renderingEngine.getViewport(VIEWPORT_ID) as InstanceType<
          CornerstoneModules["core"]["StackViewport"]
        >;
        viewportRef.current = viewport;

        await viewport.setStack(imageIds, 0);
        viewport.render();

        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error("Failed to create Cornerstone tool group");
        toolGroup.addTool(tools.PanTool.toolName);
        toolGroup.addTool(tools.ZoomTool.toolName);
        toolGroup.addTool(tools.StackScrollTool.toolName);
        toolGroup.addTool(tools.WindowLevelTool.toolName);
        toolGroup.addTool(tools.LengthTool.toolName);
        toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

        toolGroup.setToolActive(tools.StackScrollTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
        });
        toolGroup.setToolActive(tools.ZoomTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }],
        });
        toolGroup.setToolPassive(tools.PanTool.toolName);
        toolGroup.setToolPassive(tools.WindowLevelTool.toolName);
        toolGroup.setToolPassive(tools.LengthTool.toolName);

        if (destroyed) return;
        setReady(true);
      } catch (e) {
        if (!destroyed) setError(e instanceof Error ? e.message : "Failed to initialize the DICOM viewer.");
      }
    })();

    return () => {
      destroyed = true;
      const modules = modulesRef.current;
      try {
        modules?.tools.ToolGroupManager.destroyToolGroup(toolGroupId);
      } catch {
        // Tool group may not have been created if init failed early.
      }
      try {
        modules?.core.getRenderingEngine(RENDERING_ENGINE_ID)?.destroy();
      } catch {
        // Rendering engine may not exist if init failed early.
      }
    };
  }, [imageIds, toolGroupId]);

  // Keep the active mouse tool in sync with the toolbar selection.
  useEffect(() => {
    const modules = modulesRef.current;
    if (!ready || !modules) return;
    const toolGroup = modules.tools.ToolGroupManager.getToolGroup(toolGroupId);
    if (!toolGroup) return;
    const { tools } = modules;
    const primaryBinding = { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] };

    toolGroup.setToolPassive(tools.PanTool.toolName);
    toolGroup.setToolPassive(tools.WindowLevelTool.toolName);
    toolGroup.setToolPassive(tools.LengthTool.toolName);

    if (activeTool === "pan") toolGroup.setToolActive(tools.PanTool.toolName, primaryBinding);
    else if (activeTool === "zoom") toolGroup.setToolActive(tools.WindowLevelTool.toolName, primaryBinding);
    else if (activeTool === "length") toolGroup.setToolActive(tools.LengthTool.toolName, primaryBinding);
  }, [activeTool, ready, toolGroupId]);

  // Listen for completed Length annotations to populate "Insert into Findings".
  useEffect(() => {
    const modules = modulesRef.current;
    const element = elementRef.current;
    if (!ready || !modules || !element) return;

    const { tools } = modules;

    function handleAnnotationCompleted(evt: Event) {
      const detail = (evt as CustomEvent).detail as {
        annotation: { metadata?: { toolName?: string }; data?: { cachedStats?: Record<string, { length?: number }> } };
      };
      if (detail.annotation?.metadata?.toolName !== tools.LengthTool.toolName) return;
      const stats = detail.annotation.data?.cachedStats ?? {};
      const lengthMm = Object.values(stats)[0]?.length;
      if (typeof lengthMm !== "number") return;

      const viewport = viewportRef.current;
      const instanceIndex = viewport?.getCurrentImageIdIndex() ?? 0;
      const instanceNumber = series.instances[instanceIndex]?.manifest.instanceNumber ?? instanceIndex + 1;

      setPendingMeasurement(
        toMeasurementEvent({
          lengthMm,
          instanceNumber,
          seriesDescription: series.manifest.description,
          seriesNumber,
        }),
      );
    }

    element.addEventListener(tools.Enums.Events.ANNOTATION_COMPLETED, handleAnnotationCompleted as EventListener);
    return () => {
      element.removeEventListener(tools.Enums.Events.ANNOTATION_COMPLETED, handleAnnotationCompleted as EventListener);
    };
  }, [ready, series, seriesNumber]);

  const applyPreset = useCallback((presetId: WindowLevelPresetId) => {
    const modules = modulesRef.current;
    const viewport = viewportRef.current;
    if (!modules || !viewport) return;
    const preset = WINDOW_LEVEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    viewport.setProperties({
      voiRange: {
        lower: preset.windowCenter - preset.windowWidth / 2,
        upper: preset.windowCenter + preset.windowWidth / 2,
      },
    });
    viewport.render();
    setActivePreset(presetId);
  }, []);

  const stepImage = useCallback(
    async (delta: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const current = viewport.getCurrentImageIdIndex();
      const next = Math.min(Math.max(current + delta, 0), imageIds.length - 1);
      if (next === current) return;
      await viewport.setImageIdIndex(next);
      viewport.render();
      setImageIndex(next);
    },
    [imageIds.length],
  );

  const insertMeasurement = useCallback(() => {
    if (!pendingMeasurement || !onInsertMeasurement) return;
    onInsertMeasurement(pendingMeasurement);
    setPendingMeasurement(null);
  }, [pendingMeasurement, onInsertMeasurement]);

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <div className="flex gap-1" role="group" aria-label="Window/level presets">
          {WINDOW_LEVEL_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant={activePreset === preset.id ? "default" : "outline"}
              onClick={() => applyPreset(preset.id)}
              disabled={!ready}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Tools">
          <Button size="sm" variant={activeTool === "zoom" ? "default" : "outline"} onClick={() => setActiveTool("zoom")} disabled={!ready}>
            Window/level
          </Button>
          <Button size="sm" variant={activeTool === "pan" ? "default" : "outline"} onClick={() => setActiveTool("pan")} disabled={!ready}>
            Pan
          </Button>
          <Button size="sm" variant={activeTool === "length" ? "default" : "outline"} onClick={() => setActiveTool("length")} disabled={!ready}>
            Length
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 bg-black">
        <div ref={elementRef} className="h-full w-full" />
        {!ready && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Loading viewer…
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => stepImage(-1)} disabled={!ready || imageIndex === 0}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Image {imageIndex + 1} of {imageIds.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stepImage(1)}
            disabled={!ready || imageIndex === imageIds.length - 1}
          >
            Next
          </Button>
        </div>
        {pendingMeasurement ? (
          <Button size="sm" onClick={insertMeasurement}>
            Insert into Findings: {pendingMeasurement.text}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
