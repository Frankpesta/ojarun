"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-pressed",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-sunken",
  ghost: "bg-transparent text-brand hover:bg-brand-tint",
  danger: "bg-error text-on-error hover:opacity-90",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-button font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 ${
        size === "sm" ? "h-9 px-3 text-small" : "h-11 px-5 text-body"
      } ${VARIANT[variant]} ${className}`}
    >
      {loading ? "Working…" : children}
    </button>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        <h1 className="text-title font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "brand" | "muted" | "accent" | "error" }) {
  const tones = {
    brand: "bg-brand-tint text-ink",
    muted: "bg-surface-sunken text-ink-muted",
    accent: "bg-accent-tint text-ink",
    error: "bg-error-tint text-ink",
  } as const;
  const dot = { brand: "bg-brand", muted: "bg-ink-faint", accent: "bg-accent", error: "bg-error" } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium ${tones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-6 py-10">
      <p className="text-heading font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-prose text-body text-ink-muted">{body}</p> : null}
    </div>
  );
}
