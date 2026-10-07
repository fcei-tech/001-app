"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { impostaBloccoPortaleAction } from "@/app/pubblicazione/esposizione-actions";
import type { StatoPortaleSku } from "@/db/esposizione-queries";

// Situazione dello sku sui portali statici: quanti pezzi risultano caricati
// e l'interruttore "Non pubblicare qui" (blocco).
export function PortaliSku({ skuId, stato }: { skuId: number; stato: StatoPortaleSku[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  if (stato.length === 0) return <p className="text-sm text-muted-foreground">Nessun portale statico attivo.</p>;

  return (
    <div className="flex flex-col gap-2">
      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {stato.map((s) => (
        <div key={s.canaleId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{s.portale}</span>
            {s.bloccato ? (
              <Badge variant="destructive">Non pubblicare qui</Badge>
            ) : s.quantitaCaricata > 0 ? (
              <Badge variant="success">Caricato: {s.quantitaCaricata}</Badge>
            ) : (
              <Badge variant="secondary">Non caricato</Badge>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErrore(null);
                const r = await impostaBloccoPortaleAction([skuId], s.canaleId, !s.bloccato);
                if (!r.ok) setErrore(r.errore ?? "Non riuscito");
                router.refresh();
              })
            }
          >
            {s.bloccato ? "Sblocca" : "Non pubblicare qui"}
          </Button>
        </div>
      ))}
    </div>
  );
}
