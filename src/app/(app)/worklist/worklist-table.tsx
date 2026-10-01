import Link from "next/link";
import type { WorklistItem } from "@/modules/studies";
import { MODALITY_LABELS, ageSexLabel } from "@/modules/studies";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClaimButton, ReleaseButton } from "./claim-release-button";
import { relativeTime } from "./relative-time";

const PRIORITY_VARIANT = {
  stat: "destructive",
  urgent: "secondary",
  routine: "outline",
} as const;

const PRIORITY_LABEL = {
  stat: "STAT",
  urgent: "Urgent",
  routine: "Routine",
} as const;

const STATUS_LABEL: Record<WorklistItem["status"], string> = {
  unread: "Unread",
  in_progress: "In progress",
  preliminary: "Preliminary",
  final: "Final",
};

export function WorklistTable({
  items,
  currentUserId,
  assignees,
}: {
  items: WorklistItem[];
  currentUserId: string;
  assignees: Map<string, string>;
}) {
  if (items.length === 0) {
    return <p className="p-8 text-center text-muted-foreground">No studies match the current filters.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Priority</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Age/Sex</TableHead>
          <TableHead>Accession</TableHead>
          <TableHead>Modality</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Indication</TableHead>
          <TableHead>Study time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isMine = item.assignedTo === currentUserId;
          const assigneeName = item.assignedTo
            ? (assignees.get(item.assignedTo) ?? (isMine ? "You" : "Assigned"))
            : null;

          return (
            <TableRow key={item.id} className="relative cursor-pointer">
              <TableCell>
                <Link
                  href={`/studies/${item.id}`}
                  className="absolute inset-0"
                  aria-label={`Open study ${item.accession}`}
                />
                <Badge variant={PRIORITY_VARIANT[item.priority]} className="relative">
                  {PRIORITY_LABEL[item.priority]}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">{item.patient.fullName}</TableCell>
              <TableCell>{ageSexLabel(item.patient)}</TableCell>
              <TableCell>{item.accession}</TableCell>
              <TableCell>{MODALITY_LABELS[item.modality]}</TableCell>
              <TableCell className="max-w-64 truncate">{item.description}</TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground">{item.indication}</TableCell>
              <TableCell className="text-muted-foreground" title={item.studyDate}>
                {relativeTime(item.studyDate)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
              </TableCell>
              <TableCell>{isMine ? <span className="font-medium">You</span> : (assigneeName ?? "Unassigned")}</TableCell>
              <TableCell className="relative text-right">
                {item.assignedTo === null ? (
                  <ClaimButton studyId={item.id} />
                ) : isMine ? (
                  <ReleaseButton studyId={item.id} />
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
