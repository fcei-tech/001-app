"use client";

// Selettore colonne per la tabella "Lotti nel batch" (2026-09-29).
//
// La tabella e' renderizzata lato server (page.tsx) con celle editabili e
// azioni: qui NON la si ricostruisce. Ogni colonna selezionabile porta un
// attributo data-col nella tabella, e questo componente nasconde le colonne
// deselezionate con una regola CSS mirata (display:none) dentro il contenitore
// [data-lotti-tabella]. I dati e le azioni per riga non cambiano.
//
// Preferenza salvata in localStorage per TIPO di canale (statico / asta_online
// / asta_fisica): le colonne disponibili cambiano col tipo, quindi una
// preferenza unica per tutti i canali non avrebbe senso. Stesso schema di
// useSyncExternalStore gia' in uso in selettore-lotti.tsx e
// vista-magazzino.tsx. Sku e Azioni non sono selezionabili (sempre visibili).
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Columns3, RotateCcw } from "lucide-react";

export type ColonnaLottiBatch = {
  id: string;
  etichetta: string;
  defaultVisibile: boolean;
};

type Preferenza = Record<string, boolean>;

const cachePerChiave = new Map<string, Preferenza>();
const listeners = new Set<() => void>();

function sottoscrivi(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function chiaveStorage(tipoCanale: string) {
  return `posterclub.pubblicazione.lottiBatch.colonneVisibili.${tipoCanale}.v1`;
}

function leggiSalvate(chiave: string, defaults: Preferenza): Preferenza {
  const inCache = cachePerChiave.get(chiave);
  if (inCache) return inCache;
  let risultato = defaults;
  try {
    const salvate = window.localStorage.getItem(chiave);
    if (salvate) {
      const parsed = JSON.parse(salvate) as Preferenza;
      // Solo le colonne che esistono ancora; le nuove prendono il default.
      const unita: Preferenza = { ...defaults };
      for (const id of Object.keys(defaults)) {
        if (typeof parsed[id] === "boolean") unita[id] = parsed[id];
      }
      risultato = unita;
    }
  } catch {
    risultato = defaults;
  }
  cachePerChiave.set(chiave, risultato);
  return risultato;
}

function scrivi(chiave: string, next: Preferenza) {
  cachePerChiave.set(chiave, next);
  try {
    window.localStorage.setItem(chiave, JSON.stringify(next));
  } catch {
    // preferenza non salvata (storage pieno/bloccato): non blocca l'uso
  }
  listeners.forEach((l) => l());
}

export function SelettoreColonneLotti({
  tipoCanale,
  colonne,
}: {
  tipoCanale: string;
  colonne: ColonnaLottiBatch[];
}) {
  const chiave = chiaveStorage(tipoCanale);
  // Riferimento stabile fra render (richiesto da useSyncExternalStore).
  const defaults = useMemo<Preferenza>(
    () => Object.fromEntries(colonne.map((c) => [c.id, c.defaultVisibile])),
    [colonne]
  );
  const visibili = useSyncExternalStore(
    sottoscrivi,
    () => leggiSalvate(chiave, defaults),
    () => defaults
  );

  const css = colonne
    .filter((c) => visibili[c.id] === false)
    .map((c) => `[data-lotti-tabella] [data-col="${c.id}"]{display:none}`)
    .join("\n");

  return (
    <>
      {css && <style>{css}</style>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Columns3 /> Colonne
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
          <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {colonne.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={visibili[c.id] !== false}
              onCheckedChange={(v) => scrivi(chiave, { ...visibili, [c.id]: v === true })}
              onSelect={(e) => e.preventDefault()}
            >
              {c.etichetta}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              scrivi(chiave, defaults);
            }}
          >
            <RotateCcw /> Ripristina colonne predefinite
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
