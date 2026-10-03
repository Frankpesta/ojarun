"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "@ojarun/convex/api";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { errorMessage, FormError, ReasonField, reasonOk, Skeleton } from "@/components/form";
import { CSV_TEMPLATE, parseCatalogCsv, type ParseResult } from "./csv";

type Item = FunctionReturnType<typeof api.ops.catalog.list>[number];

export default function CatalogPage() {
  const items = useQuery(api.ops.catalog.list);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [toggling, setToggling] = useState<Item | null>(null);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Item[]>();
    for (const item of items ?? []) {
      if (q && !item.searchText.includes(q) && !item.category.toLowerCase().includes(q)) continue;
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()];
  }, [items, search]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Catalogue"
        description="Suggestions customers see while typing an item. They can always type anything; this adds presets and unit hints."
        actions={<Button onClick={() => setImporting(true)}>Import CSV</Button>}
      />

      <label className="relative mb-5 block max-w-sm">
        <span className="sr-only">Search the catalogue</span>
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items or aliases"
          className="h-11 w-full rounded-input bg-surface pl-10 pr-3.5 text-body ring-1 ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      {items === undefined ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <EmptyState title="The catalogue is empty" body="Import a CSV, or run the seed for a starter list of Akure market items." />
      ) : groups.length === 0 ? (
        <EmptyState title={`Nothing matches "${search}"`} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([category, rows]) => (
            <section key={category}>
              <h2 className="mb-2 text-small font-semibold text-ink-muted">
                {category} <span className="tabular font-normal text-ink-faint">· {rows.length}</span>
              </h2>
              <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {rows.map((item) => (
                  <div key={item._id} className="flex items-start gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${item.active ? "" : "text-ink-muted line-through decoration-ink-faint"}`}>{item.name}</p>
                      <p className="mt-0.5 truncate text-caption text-ink-muted">
                        {[item.unitHint && `Sold by ${item.unitHint}`, item.aliases.length > 0 && `Also: ${item.aliases.join(", ")}`]
                          .filter(Boolean)
                          .join(" · ") || "No unit hint or aliases"}
                      </p>
                      {item.presetPreferences.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.presetPreferences.map((p) => (
                            <span key={p.group} className="rounded-chip bg-surface-sunken px-2 py-0.5 text-caption text-ink-muted">
                              {p.group}: {p.options.join(" / ")}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {item.active ? null : <Pill tone="muted">Hidden</Pill>}
                      <Button size="sm" variant="secondary" onClick={() => setToggling(item)}>
                        {item.active ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {importing ? <ImportDrawer onClose={() => setImporting(false)} /> : null}
      {toggling ? <ToggleDrawer item={toggling} onClose={() => setToggling(null)} /> : null}
    </div>
  );
}

function ToggleDrawer({ item, onClose }: { item: Item; onClose: () => void }) {
  const setActive = useMutation(api.ops.catalog.setActive);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const next = !item.active;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setActive({ id: item._id, active: next, reason });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={next ? `Show ${item.name}` : `Hide ${item.name}`}
      description={
        next ? "Customers will see it as a suggestion again." : "Customers stop seeing it as a suggestion. They can still type it in."
      }
      footer={
        <>
          <Button onClick={save} loading={saving} disabled={!reasonOk(reason)}>
            {next ? "Show item" : "Hide item"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ReasonField value={reason} onChange={setReason} placeholder={next ? "e.g. Back in season" : "e.g. Out of season"} />
        <FormError message={error} />
      </div>
    </Drawer>
  );
}

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const importItems = useMutation(api.ops.catalog.importItems);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [reason, setReason] = useState("Catalogue update");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const onFile = async (file: File | undefined) => {
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    setParsed(parseCatalogCsv(await file.text()));
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ojarun-catalogue-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    if (!parsed) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await importItems({ rows: parsed.rows, reason }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const canImport = !!parsed && parsed.rows.length > 0 && parsed.errors.length === 0 && reasonOk(reason) && !result;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import catalogue"
      description="Items are matched by name. Matches are updated, new names are added, and nothing is deleted."
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={save} loading={saving} disabled={!canImport}>
              {parsed?.rows.length ? `Import ${parsed.rows.length} items` : "Import"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-card bg-surface-sunken px-4 py-3 text-small text-ink-muted">
          <p>
            Columns: <code className="text-ink">name, category, aliases, unit_hint, preferences</code>. Separate aliases and options with{" "}
            <code className="text-ink">|</code> and preference groups with <code className="text-ink">;</code>.
          </p>
          <button type="button" onClick={downloadTemplate} className="mt-2 font-semibold text-brand hover:underline">
            Download a template
          </button>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong px-6 py-8 text-center hover:bg-surface-sunken/60">
          <span className="font-semibold">{fileName ?? "Choose a CSV file"}</span>
          <span className="text-caption text-ink-muted">{fileName ? "Choose another to replace it" : "Exported from Excel or Google Sheets"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>

        {parsed ? (
          parsed.errors.length ? (
            <div role="alert" className="rounded-card bg-error-tint px-4 py-3 text-small">
              <p className="font-semibold">Fix these rows, then choose the file again</p>
              <ul className="mt-1 list-disc pl-5 text-ink-muted">
                {parsed.errors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-small text-ink-muted">
              <span className="tabular font-semibold text-ink">{parsed.rows.length}</span> items ready to import.
            </p>
          )
        ) : null}

        {result ? (
          <p role="status" className="rounded-card bg-brand-tint px-4 py-3 text-small">
            Imported. <span className="tabular font-semibold">{result.created}</span> added,{" "}
            <span className="tabular font-semibold">{result.updated}</span> updated.
          </p>
        ) : (
          <ReasonField value={reason} onChange={setReason} />
        )}
        <FormError message={error} />
      </div>
    </Drawer>
  );
}
