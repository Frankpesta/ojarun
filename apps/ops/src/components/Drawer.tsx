"use client";

import type { ReactNode } from "react";
import { Drawer as Vaul } from "vaul";

/**
 * Ops dialogs rise from the bottom too (05 §7.1), with the same anatomy as the app's sheets:
 * grabber, left-aligned title, content, sticky footer. `critical` disables outside-click dismiss.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  critical,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  critical?: boolean;
}) {
  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange} dismissible={!critical}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-scrim/40" />
        <Vaul.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-sheet bg-surface-raised shadow-[0_-4px_24px_rgba(12,26,18,0.12)] outline-none"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-ink-muted/40" aria-hidden />
          <div className="px-6 pb-4 pt-3">
            <Vaul.Title className="text-heading font-semibold">{title}</Vaul.Title>
            {description ? (
              <Vaul.Description className="mt-1 text-small text-ink-muted">{description}</Vaul.Description>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-6">{children}</div>
          {footer ? <div className="flex flex-col gap-2 px-6 pb-6 pt-5">{footer}</div> : <div className="pb-6" />}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
