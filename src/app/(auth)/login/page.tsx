import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const redirectToParam = params.redirectTo;
  const redirectTo = Array.isArray(redirectToParam) ? redirectToParam[0] : redirectToParam;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Sign in to RadPilot</CardTitle>
        <CardDescription>AI-assisted radiology reporting, demo build.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm redirectTo={redirectTo} />
        <Badge variant="outline" className="self-start">
          Synthetic data, not for clinical use
        </Badge>
      </CardContent>
    </Card>
  );
}
