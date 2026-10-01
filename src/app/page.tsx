import { redirect } from "next/navigation";

// `/` has no content of its own: signed-in users go to the worklist,
// signed-out users are already sent to /login by src/proxy.ts before they
// reach here (kept as a fallback for direct hits that bypass the proxy).
export default function Home() {
  redirect("/worklist");
}
