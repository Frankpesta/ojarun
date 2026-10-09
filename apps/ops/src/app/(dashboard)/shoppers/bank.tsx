"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { isNuban } from "@ojarun/shared";
import { Drawer } from "@/components/Drawer";
import { Button } from "@/components/ui";
import { errorMessage, Field, FormError, ReasonField, reasonOk, TextInput } from "@/components/form";

type Row = FunctionReturnType<typeof api.ops.shoppers.list>[number];

/**
 * The shopper's own bank accounts (05 §9 M4). Any transfer to one of these is blocked, and each
 * account's name is added to the names trader transfers are matched against.
 */
export function BankAccountsDrawer({ shopper, onClose }: { shopper: Row; onClose: () => void }) {
  const banks = useQuery(api.traders.banks);
  const ensureBanks = useAction(api.traders.ensureBanks);
  const add = useAction(api.ops.shoppers.addBankAccount);
  const remove = useMutation(api.ops.shoppers.removeBankAccount);
  const [bankCode, setBankCode] = useState("");
  const [number, setNumber] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const name = shopper.legalName ?? shopper.name ?? "this shopper";

  useEffect(() => {
    if (banks && banks.banks.length === 0) void ensureBanks().catch(() => setError("Couldn't load the bank list. Try again."));
  }, [banks, ensureBanks]);

  const digits = number.replace(/\D/g, "");
  const canAdd = !!bankCode && isNuban(digits) && reasonOk(reason);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${name}'s bank accounts`}
      description="Transfers to these accounts are always blocked, and their names are matched against every trader a shopper pays. Add every account the shopper uses."
      footer={
        <>
          <Button
            disabled={!canAdd}
            loading={busy === "add"}
            onClick={() =>
              void run("add", async () => {
                const res = await add({ userId: shopper._id, bankCode, accountNumber: digits, reason });
                setSaved(`Saved ${res.accountName} · ${res.bankName}`);
                setNumber("");
                setReason("");
              })
            }
          >
            Look up and save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {shopper.bankAccounts.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-card ring-1 ring-line">
            {shopper.bankAccounts.map((a) => (
              <li key={`${a.bankCode}:${a.accountNumber}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="text-small">
                  <p className="font-semibold">{a.resolvedName}</p>
                  <p className="tabular text-caption text-ink-muted">
                    {a.bankName} · {a.accountNumber}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!reasonOk(reason)}
                  title={reasonOk(reason) ? undefined : "Write a reason below first"}
                  loading={busy === a.accountNumber}
                  onClick={() =>
                    void run(a.accountNumber, () =>
                      remove({ userId: shopper._id, accountNumber: a.accountNumber, bankCode: a.bankCode, reason }),
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card bg-accent-tint px-4 py-3 text-small">
            No accounts saved yet. Until you add one, only the legal name protects against {name} paying themselves.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank">
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="h-11 rounded-input bg-surface px-3 text-body ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">{banks?.banks.length ? "Choose a bank" : "Loading banks…"}</option>
              {banks?.banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account number">
            <TextInput inputMode="numeric" maxLength={13} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10 digits" className="tabular" />
          </Field>
        </div>
        <ReasonField value={reason} onChange={setReason} placeholder="e.g. Shopper's salary account, from onboarding form" />
        {saved ? (
          <p role="status" className="text-small font-medium text-brand">
            {saved}
          </p>
        ) : null}
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
