"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Imperative confirm: `const confirm = useConfirm(); if (await confirm({...})) doIt();`
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

// App-wide confirmation modal. Every destructive action (delete/reset) routes
// through this so the user always gets a "tem certeza?" before anything is gone.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o = {}) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Confirmar exclusão"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {opts.description ?? "Tem certeza? Esta ação não pode ser desfeita."}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => settle(false)}>
              {opts.cancelLabel ?? "Cancelar"}
            </Button>
            <Button variant="destructive" onClick={() => settle(true)}>
              {opts.confirmLabel ?? "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
