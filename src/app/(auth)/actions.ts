"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginFormState {
  error?: string;
}

/** Signs in with email/password. On success, redirects to the worklist (or `redirectTo`). */
export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectTo = formData.get("redirectTo");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  const destination = typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/worklist";
  redirect(destination);
}

/** Signs out the current user and redirects to /login. */
export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
