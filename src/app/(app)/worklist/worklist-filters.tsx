"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MODALITIES, MODALITY_LABELS, STUDY_STATUSES } from "@/modules/studies";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  unread: "Unread",
  in_progress: "In progress",
  preliminary: "Preliminary",
  final: "Final",
};

const ALL = "all";

export function WorklistFiltersBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? ALL;
  const modality = searchParams.get("modality") ?? ALL;
  const assignedToMe = searchParams.get("assignedToMe") === "1";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/worklist?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-b bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="status-filter" className="text-muted-foreground">
          Status
        </Label>
        <Select value={status} onValueChange={(value) => updateParam("status", value)}>
          <SelectTrigger id="status-filter" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STUDY_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="modality-filter" className="text-muted-foreground">
          Modality
        </Label>
        <Select value={modality} onValueChange={(value) => updateParam("modality", value)}>
          <SelectTrigger id="modality-filter" size="sm">
            <SelectValue placeholder="All modalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All modalities</SelectItem>
            {MODALITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {value} &ndash; {MODALITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={assignedToMe}
          onCheckedChange={(checked) => updateParam("assignedToMe", checked ? "1" : null)}
        />
        Assigned to me
      </label>
    </div>
  );
}
