"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatNaira, formatNigerianPhone, type Role } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";

const ROLE_LABEL: Record<Role, string> = { customer: "Customer", shopper: "Shopper", ops: "Ops" };
const ROLE_TONE = { customer: "muted", shopper: "brand", ops: "accent" } as const;
const FILTERS: (Role | "all")[] = ["all", "customer", "shopper", "ops"];

type Row = FunctionReturnType<typeof api.ops.users.list>[number];

export default function UsersPage() {
  const [filter, setFilter] = useState<Role | "all">("all");
  const users = useQuery(api.ops.users.list, filter === "all" ? {} : { role: filter });
  const [editing, setEditing] = useState<Row | null>(null);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="People"
        description="Everyone signs up as a customer. Give shopper or ops access here — each change is logged with a reason."
      />

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter by role">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-chip px-3.5 text-small font-medium transition-colors ${
              filter === f ? "bg-brand-tint text-ink ring-1 ring-brand" : "bg-surface text-ink-muted ring-1 ring-line-strong hover:text-ink"
            }`}
          >
            {f === "all" ? "Everyone" : `${ROLE_LABEL[f]}s`}
          </button>
        ))}
      </div>

      {users === undefined ? (
        <div className="h-40 animate-pulse rounded-card bg-surface-sunken" aria-busy="true" />
      ) : users.length === 0 ? (
        <EmptyState title="No one here yet" body="People appear after they sign in on the app for the first time." />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-left text-small">
            <thead className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 text-right font-medium">Wallet</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-surface-sunken/60">
                  <td className="px-4 py-3">
                    <span className="font-medium">{u.name ?? "No name yet"}</span>
                    {u.status !== "active" ? (
                      <span className="ml-2">
                        <Pill tone="error">{u.status}</Pill>
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular px-4 py-3 text-ink-muted">{u.phone ? formatNigerianPhone(u.phone) : "—"}</td>
                  <td className="px-4 py-3">
                    <Pill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Pill>
                  </td>
                  <td className="tabular px-4 py-3 text-right">{formatNaira(u.walletBalance)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                      Change role
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? <RoleDrawer user={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RoleDrawer({ user, onClose }: { user: Row; onClose: () => void }) {
  const setRole = useMutation(api.ops.users.setRole);
  const [role, setRoleValue] = useState<Role>(user.role);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setRole({ userId: user._id, role, reason });
      onClose();
    } catch (e) {
      setError(e instanceof ConvexError ? String((e.data as { message?: string }).message ?? "Couldn't save.") : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change role for ${user.name ?? formatNigerianPhone(user.phone)}`}
      description="Shoppers see assigned batches and can pay traders. Ops can change anything here."
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={role === user.role || reason.trim().length < 3}>
            Save role
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-medium text-ink-muted">Role</legend>
        {(["customer", "shopper", "ops"] as const).map((r) => (
          <label
            key={r}
            className={`flex cursor-pointer items-center gap-3 rounded-card px-4 py-3 ring-1 transition-colors ${
              role === r ? "bg-brand-tint ring-brand" : "bg-surface ring-line-strong hover:bg-surface-sunken"
            }`}
          >
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRoleValue(r)} className="accent-[rgb(var(--color-brand))]" />
            <span className="font-medium">{ROLE_LABEL[r]}</span>
          </label>
        ))}
      </fieldset>
      <label className="mt-5 flex flex-col gap-2">
        <span className="text-small font-medium text-ink-muted">Reason (saved to the audit log)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Hired as shopper for Oja Oba, starting Monday"
          className="rounded-input bg-surface px-4 py-3 text-body ring-1 ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-3 text-small text-error">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
