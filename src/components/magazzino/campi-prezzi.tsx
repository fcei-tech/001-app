"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PerPubblicare } from "@/components/magazzino/per-pubblicare";
import { righeSpiegazionePrezzi } from "@/lib/regole-prezzi";
import { REGOLE_PREZZI_STANDARD, type RegolePrezzi } from "@/lib/regole-prezzi-config";

type Iniziali = {
  valoreCarico?: string | null;
  prezzoEbay?: string | null;
  prezzoCatawiki?: string | null;
  riservaCatawiki?: string | null;
  prezzoShopify?: string | null;
  prezzoSubito?: string | null;
  prezzoBidspirit?: string | null;
  riservaBidspirit?: string | null;
};

// I campi "dati commerciali" con, sotto ogni prezzo, la spiegazione di cosa ne
// deriva (valori calcolati mentre scrivi). Usato dalla scheda sku e dal form
// di nuovo sku; i campi restano normali input del form (stessi name).
//
// Release 9 (2026-11-10): i portali che di norma derivano il prezzo da un
// altro (Shopify, Subito, Bidspirit) hanno un campo proprio. Compilato = vale
// quello; vuoto = vale la regola di sempre (la riga sotto il campo dice quale).
export function CampiPrezzi({
  iniziali,
  placeholderPrezzo = "€",
  regole = REGOLE_PREZZI_STANDARD,
  evidenziaPubblicazione = false,
}: {
  // Nel form "Nuovo sku": segna prezzo eBay e prezzo Catawiki come necessari
  // per pubblicare (verde quando compilati correttamente).
  evidenziaPubblicazione?: boolean;
  iniziali?: Iniziali;
  placeholderPrezzo?: string;
  regole?: RegolePrezzi;
}) {
  const [v, setV] = useState({
    prezzoEbay: iniziali?.prezzoEbay ?? "",
    prezzoCatawiki: iniziali?.prezzoCatawiki ?? "",
    riservaCatawiki: iniziali?.riservaCatawiki ?? "",
    prezzoShopify: iniziali?.prezzoShopify ?? "",
    prezzoSubito: iniziali?.prezzoSubito ?? "",
    prezzoBidspirit: iniziali?.prezzoBidspirit ?? "",
    riservaBidspirit: iniziali?.riservaBidspirit ?? "",
  });
  const imposta = (campo: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [campo]: e.target.value }));
  const righe = righeSpiegazionePrezzi(v, regole);

  const pe = Number(v.prezzoEbay.trim().replace(",", "."));
  const pc = Number(v.prezzoCatawiki.trim().replace(",", "."));
  const okPerPubblicare: Partial<Record<keyof typeof v, boolean>> = {
    prezzoEbay: v.prezzoEbay.trim() !== "" && Number.isFinite(pe) && pe > 0,
    prezzoCatawiki: v.prezzoCatawiki.trim() !== "" && Number.isFinite(pc) && pc >= regole.sogliaMinimaCatawiki,
  };

  const campo = (name: keyof typeof v, etichetta: string, spiegazione: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {etichetta}
        {evidenziaPubblicazione && okPerPubblicare[name] !== undefined && <PerPubblicare ok={okPerPubblicare[name] === true} />}
      </Label>
      <Input id={name} name={name} inputMode="decimal" value={v[name]} onChange={imposta(name)} placeholder={placeholderPrezzo} />
      <p className="text-xs text-muted-foreground">{spiegazione}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="valoreCarico">Valore di carico</Label>
          <Input
            id="valoreCarico"
            name="valoreCarico"
            inputMode="decimal"
            defaultValue={iniziali?.valoreCarico ?? ""}
            placeholder="€ (facoltativo)"
          />
          <p className="text-xs text-muted-foreground">Solo costo interno: non va su nessun portale.</p>
        </div>
        {campo("prezzoEbay", "Prezzo eBay", righe.ebay)}
        {campo("prezzoCatawiki", "Prezzo Catawiki", righe.catawiki)}
        {campo("riservaCatawiki", "Riserva Catawiki", righe.riserva)}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Prezzi propri per portale</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Facoltativi: se compili un campo, quel portale usa questo prezzo; se lo lasci vuoto vale la regola indicata sotto il campo.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {campo("prezzoShopify", "Prezzo Shopify", righe.shopify)}
          {campo("prezzoSubito", "Prezzo Subito", righe.subito)}
          {campo("prezzoBidspirit", "Prezzo Bidspirit", righe.bidspirit)}
          {campo("riservaBidspirit", "Riserva Bidspirit", righe.riservaBidspirit)}
        </div>
      </div>
    </div>
  );
}
