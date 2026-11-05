"use client";

import * as React from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação que apaga ou desfaz algo: botão vermelho e ícone de alerta. */
  destructive?: boolean;
  /** Miniatura ou resumo do que será afetado (ex.: a foto que sai). */
  preview?: React.ReactNode;
};

type Pedido = ConfirmOptions & { resolver: (ok: boolean) => void };

const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Popup de confirmação do sistema, no lugar do `window.confirm` do navegador. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = React.useState<Pedido | null>(null);

  const confirmar = React.useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolver) => setPedido({ ...o, resolver })),
    [],
  );

  function fechar(ok: boolean) {
    pedido?.resolver(ok);
    setPedido(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Dialog open={Boolean(pedido)} onOpenChange={(o) => !o && fechar(false)}>
        <DialogContent className="sm:max-w-md">
          {pedido ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      pedido.destructive ? "bg-red-50 text-red-600" : "bg-brand-mist text-brand-deep",
                    )}
                  >
                    {pedido.destructive ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
                  </span>
                  <div className="min-w-0 space-y-1 pt-0.5">
                    <DialogTitle>{pedido.title}</DialogTitle>
                    {pedido.description ? <DialogDescription>{pedido.description}</DialogDescription> : null}
                  </div>
                </div>
              </DialogHeader>
              {pedido.preview ? <div className="rounded-xl border border-border/70 bg-muted/20 p-2">{pedido.preview}</div> : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => fechar(false)} autoFocus>
                  {pedido.cancelLabel ?? "Cancelar"}
                </Button>
                <Button
                  onClick={() => fechar(true)}
                  className={cn(pedido.destructive && "bg-red-600 text-white hover:bg-red-700")}
                >
                  {pedido.confirmLabel ?? (pedido.destructive ? "Remover" : "Confirmar")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** `const confirmar = useConfirm(); if (await confirmar({ title: "…" })) …` */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa do <ConfirmProvider> no layout.");
  return ctx;
}
