// Placeholder landing page. Track A replaces this with the auth redirect and app shell.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">RadPilot</h1>
      <p className="max-w-md text-muted-foreground">
        AI-assisted radiology reporting. Demo build with synthetic data only. Not for clinical use.
      </p>
    </main>
  );
}
