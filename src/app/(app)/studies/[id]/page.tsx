import Link from "next/link";
import { Button } from "@/components/ui/button";

// Stub: the reading room (viewer + editor + copilot) is built in Session 5,
// after Tracks A-D merge. This placeholder just confirms the worklist's row
// link target exists and shows which study was opened.
export default async function StudyPage({ params }: PageProps<"/studies/[id]">) {
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Study {id}</h1>
      <p className="max-w-md text-muted-foreground">
        The reading room (viewer, editor and copilot) is not built yet. Coming in a later session.
      </p>
      <Button asChild variant="outline">
        <Link href="/worklist">Back to worklist</Link>
      </Button>
    </div>
  );
}
