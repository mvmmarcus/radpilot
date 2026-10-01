"use client";

import { useActionState } from "react";
import { claimStudyAction, releaseStudyAction, type WorklistActionState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: WorklistActionState = {};

export function ClaimButton({ studyId }: { studyId: string }) {
  const [state, formAction, pending] = useActionState(claimStudyAction, initialState);

  return (
    <form
      action={formAction}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex flex-col items-end gap-0.5"
    >
      <input type="hidden" name="studyId" value={studyId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Claiming..." : "Claim"}
      </Button>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}

export function ReleaseButton({ studyId }: { studyId: string }) {
  const [state, formAction, pending] = useActionState(releaseStudyAction, initialState);

  return (
    <form
      action={formAction}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex flex-col items-end gap-0.5"
    >
      <input type="hidden" name="studyId" value={studyId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "Releasing..." : "Release"}
      </Button>
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
