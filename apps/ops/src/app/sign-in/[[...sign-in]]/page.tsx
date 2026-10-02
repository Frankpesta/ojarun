import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <p className="text-title font-bold tracking-tight">
          <span className="text-brand">Oja</span>
          <span className="text-accent-strong">Run</span>
          <span className="ml-2 text-body font-medium text-ink-muted">Ops</span>
        </p>
        <SignIn />
      </div>
    </main>
  );
}
