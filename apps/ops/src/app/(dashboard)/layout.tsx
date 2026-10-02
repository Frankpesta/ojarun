"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { GearSix, UsersThree } from "@phosphor-icons/react";
import { api } from "@ojarun/convex/api";
import { EmptyState } from "@/components/ui";

const NAV = [
  { href: "/users", label: "People", icon: UsersThree },
  { href: "/settings", label: "Settings", icon: GearSix },
] as const;

function OpsGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const started = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !started.current) {
      started.current = true;
      void ensureUser();
    }
  }, [isAuthenticated, ensureUser]);

  if (isLoading || me === undefined || me === null) {
    return <div className="p-8" aria-busy="true" />;
  }
  if (me.role !== "ops" || me.status !== "active") {
    return (
      <div className="mx-auto max-w-lg p-8">
        <EmptyState
          title="You don't have ops access"
          body="Ask an OjaRun admin to give your account the ops role. Customer and shopper accounts use the mobile app."
        />
      </div>
    );
  }
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5">
        <p className="px-3 text-heading font-bold tracking-tight">
          <span className="text-brand">Oja</span>
          <span className="text-accent-strong">Run</span>
          <span className="ml-1.5 text-small font-medium text-ink-muted">Ops</span>
        </p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-input px-3 text-small font-medium transition-colors ${
                  active ? "bg-brand-tint text-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                }`}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-brand" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3">
          <UserButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <OpsGate>{children}</OpsGate>
      </main>
    </div>
  );
}
