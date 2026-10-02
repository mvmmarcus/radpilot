"use client";

import { UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logout } from "../(auth)/actions";
import { resetDemoDataAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ email, fullName, role }: { email: string; fullName: string; role: string }) {
  const label = fullName || email;
  const router = useRouter();

  async function resetDemoData() {
    if (!window.confirm("Restore the demo data? Every report and change made since the last restore is discarded.")) return;
    const result = await resetDemoDataAction();
    if (result.error) {
      toast.error("Could not restore the demo data", { description: result.error });
      return;
    }
    toast.success("Demo data restored");
    router.push("/worklist");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserIcon />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {email} &middot; {role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role === "admin" && <DropdownMenuItem onSelect={resetDemoData}>Restore demo data</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
