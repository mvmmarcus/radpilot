// UI entry point: React components of this module.
//
// DicomViewer touches window/canvas/WebGL (Cornerstone3D) and must be loaded
// as a client-only dynamic import from the consuming page:
//
//   const DicomViewer = dynamic(
//     () => import("@/modules/viewer/ui").then((m) => m.DicomViewer),
//     { ssr: false },
//   );
export { DicomViewer, type DicomViewerProps } from "./DicomViewer";
