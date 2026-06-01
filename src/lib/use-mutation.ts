"use client";

import { useTransition } from "react";
import { toast } from "sonner";

export type MutationResult = { ok: true } | { ok: false; error: string };

type RunOpts = {
  /** Runs after the write lands OK — used to silently reconcile temp rows / audit. */
  onSuccess?: () => void;
  /** Toast message on failure (defaults to the action's error). */
  errorMessage?: string;
  /** Success toast shown when the write lands OK. Omit for silent writes. */
  successMessage?: string;
};

/**
 * Optimistic mutation runner. `apply` mutates local state synchronously and returns
 * a rollback closure; the write then runs in the background (non-blocking). On
 * failure the optimistic change is rolled back and a toast is shown — so the UI is
 * instant regardless of how long the database takes.
 */
export function useMutation() {
  const [pending, start] = useTransition();

  function run(
    apply: () => () => void,
    action: () => Promise<MutationResult>,
    opts: RunOpts = {},
  ) {
    const rollback = apply();
    start(async () => {
      try {
        const r = await action();
        if (!r.ok) {
          rollback();
          toast.error(opts.errorMessage ?? r.error);
        } else {
          opts.onSuccess?.();
          if (opts.successMessage) toast.success(opts.successMessage);
        }
      } catch {
        rollback();
        toast.error(opts.errorMessage ?? "Falha ao salvar. Alteração desfeita.");
      }
    });
  }

  return { run, pending };
}
