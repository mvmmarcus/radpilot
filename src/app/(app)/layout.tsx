import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt and suspenders: src/proxy.ts already redirects signed-out users, but
  // this layout is also reached directly in tests/dev, so check again here.
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">RadPilot</span>
          <Badge variant="outline">Synthetic data, not for clinical use</Badge>
        </div>
        <UserMenu email={user.email ?? ""} fullName={profile?.full_name ?? ""} role={profile?.role ?? "radiologist"} />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
