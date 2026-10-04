"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Basket, CalendarDots, GearSix, MapTrifold, SignOut, Storefront, UsersThree } from "@phosphor-icons/react";
import { api } from "@ojarun/convex/api";
import { EmptyState } from "@/components/ui";

const NAV = [
  { href: "/markets", label: "Markets", icon: Storefront },
  { href: "/slots", label: "Delivery slots", icon: CalendarDots },
  { href: "/catalog", label: "Catalogue", icon: Basket },
  { href: "/delivery-area", label: "Delivery area", icon: MapTrifold },
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

const WAT = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Live Lagos time. Rendered after mount so server and client markup match. */
function WatClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="tabular-nums" dateTime={now?.toISOString()}>
      {now ? `${WAT.format(now)} WAT` : " "}
    </time>
  );
}

function TopBar({ section }: { section?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-6 border-b border-line bg-bg/85 px-8 backdrop-blur">
      <p className="flex items-center gap-2 text-small">
        <span className="text-ink-faint">Ops</span>
        {section ? (
          <>
            <span className="text-line-strong" aria-hidden>
              /
            </span>
            <span className="font-medium text-ink">{section}</span>
          </>
        ) : null}
      </p>
      <div className="flex items-center gap-5">
        <span className="hidden text-small text-ink-muted sm:inline">
          <WatClock />
        </span>
        <span className="h-6 w-px bg-line" aria-hidden />
        <div className="flex items-center gap-3">
          {me ? (
            <div className="hidden text-right leading-tight md:block">
              <p className="text-small font-medium">{me.name ?? "Signed in"}</p>
              <p className="text-caption capitalize text-ink-faint">{me.role}</p>
            </div>
          ) : null}
          <UserButton />
        </div>
      </div>
    </header>
  );
}

/** Deployment name from the Convex URL, so it's obvious which backend this dashboard writes to. */
const DEPLOYMENT = process.env.NEXT_PUBLIC_CONVEX_URL?.match(/^https:\/\/([^.]+)\.convex\.cloud/)?.[1] ?? "local";

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-8 py-4 text-caption text-ink-faint">
      <p>© {new Date().getFullYear()} OjaRun · Akure</p>
      <p className="flex items-center gap-4">
        <span>All times in WAT (UTC+1)</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
          Backend <span className="font-mono text-ink-muted">{DEPLOYMENT}</span>
        </span>
      </p>
    </footer>
  );
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
        <div className="mt-auto border-t border-line pt-3">
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="flex h-10 w-full items-center gap-3 rounded-input px-3 text-small font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              <SignOut size={18} />
              Log out
            </button>
          </SignOutButton>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar section={NAV.find(({ href }) => pathname.startsWith(href))?.label} />
        <main className="flex-1 px-8 py-8">
          <OpsGate>{children}</OpsGate>
        </main>
        <Footer />
      </div>
    </div>
  );
}
