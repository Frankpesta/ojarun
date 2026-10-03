"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { ConvexError } from "convex/values";

/** Plain-language message from a Convex call failure. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const msg = (e.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
  }
  return "Couldn't save. Check your connection and try again.";
}

const control =
  "w-full rounded-input bg-surface px-3.5 text-body ring-1 ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-small font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} h-11 ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} py-3 ${props.className ?? ""}`} />;
}

/** Every ops change asks why; the answer goes to the audit log. */
export function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label="Reason (saved to the audit log)">
      <TextArea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "What changed and why"} />
    </Field>
  );
}

export const reasonOk = (reason: string) => reason.trim().length >= 3;

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-small text-error">
      {message}
    </p>
  );
}

/** Seven-day toggle row. 0 = Sunday, matching the server. */
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  // Monday-first, as people in Nigeria read a week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={`h-9 w-12 rounded-chip text-small font-medium transition-colors ${
              on ? "bg-brand-tint text-ink ring-1 ring-brand" : "bg-surface text-ink-muted ring-1 ring-line-strong hover:text-ink"
            }`}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className = "h-40" }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-surface-sunken ${className}`} aria-busy="true" />;
}
