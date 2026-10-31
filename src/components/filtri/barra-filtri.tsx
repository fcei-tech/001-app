"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Barra filtri unica, usata uguale in Magazzino, nei selettori dei portali e
// nelle tabelle dei portali statici (Release 6, 2026-10-31). Schema copiato dai
// gestionali professionali (Shopify admin, Airtable, Linear): una sola riga
// con ricerca + "Filtri" + strumenti; i filtri accesi compaiono sotto come
// etichette con la ✕; i filtri si applicano subito, senza bottone "Applica".
export type ChipFiltro = {
  id: string;
  etichetta: string;
  valore: string;
  rimuovi: () => void;
};

export function CampoFiltro({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{etichetta}</span>
      {children}
    </div>
  );
}

// Scorciatoia: filtro rapido a un clic (acceso/spento).
export function Scorciatoia({
  attiva,
  onClick,
  children,
  titolo,
}: {
  attiva: boolean;
  onClick: () => void;
  children: ReactNode;
  titolo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      title={titolo}
      className={`inline-flex h-7 items-center rounded-full border px-3 text-xs transition-colors ${
        attiva ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function BarraFiltri({
  ricerca,
  onRicerca,
  onInvio,
  segnaposto,
  chips,
  onAzzera,
  strumenti,
  veloci,
  children,
  className = "mb-4",
}: {
  ricerca: string;
  onRicerca: (v: string) => void;
  onInvio?: () => void;
  segnaposto: string;
  chips: ChipFiltro[];
  onAzzera?: () => void;
  // Bottoni a destra del bottone Filtri: Ordina, Viste, Colonne.
  strumenti?: ReactNode;
  // Filtri rapidi (a un clic) sulla riga delle etichette.
  veloci?: ReactNode;
  // Contenuto del pannello "Filtri": una serie di <CampoFiltro>.
  children?: ReactNode;
  className?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const n = chips.length;
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 basis-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={ricerca}
            onChange={(e) => onRicerca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onInvio?.();
              }
            }}
            placeholder={segnaposto}
            aria-label="Cerca"
            className="pl-8"
          />
        </div>
        {children && (
          <Button
            type="button"
            variant={aperto || n > 0 ? "secondary" : "outline"}
            onClick={() => setAperto((v) => !v)}
            aria-expanded={aperto}
            title="Mostra o nascondi i filtri"
          >
            <SlidersHorizontal /> Filtri
            {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{n}</span>}
          </Button>
        )}
        {strumenti}
      </div>

      {aperto && children && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
          {children}
        </div>
      )}

      {(n > 0 || veloci) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 pl-3 pr-1 text-xs">
              <span className="text-muted-foreground">{c.etichetta}:</span>
              <span className="font-medium">{c.valore}</span>
              <button
                type="button"
                onClick={c.rimuovi}
                aria-label={`Togli il filtro ${c.etichetta}: ${c.valore}`}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {n > 0 && onAzzera && (
            <button type="button" onClick={onAzzera} className="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Azzera tutto
            </button>
          )}
          {veloci && <span className="ml-auto flex flex-wrap items-center gap-2">{veloci}</span>}
        </div>
      )}
    </div>
  );
}
