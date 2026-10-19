"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { righeSpiegazionePrezzi } from "@/lib/regole-prezzi";

// I quattro campi "dati commerciali" con, sotto ogni prezzo, la spiegazione di
// cosa ne deriva (valori calcolati mentre scrivi). Usato dalla scheda sku e
// dal form di nuovo sku; i campi restano normali input del form (stessi name).
export function CampiPrezzi({
  iniziali,
  placeholderPrezzo = "€",
}: {
  iniziali?: { valoreCarico?: string | null; prezzoEbay?: string | null; prezzoCatawiki?: string | null; riservaCatawiki?: string | null };
  placeholderPrezzo?: string;
}) {
  const [prezzoEbay, setPrezzoEbay] = useState(iniziali?.prezzoEbay ?? "");
  const [prezzoCatawiki, setPrezzoCatawiki] = useState(iniziali?.prezzoCatawiki ?? "");
  const [riservaCatawiki, setRiservaCatawiki] = useState(iniziali?.riservaCatawiki ?? "");
  const righe = righeSpiegazionePrezzi({ prezzoEbay, prezzoCatawiki, riservaCatawiki });

  return (
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prezzoEbay">Prezzo eBay</Label>
        <Input
          id="prezzoEbay"
          name="prezzoEbay"
          inputMode="decimal"
          value={prezzoEbay}
          onChange={(e) => setPrezzoEbay(e.target.value)}
          placeholder={placeholderPrezzo}
        />
        <p className="text-xs text-muted-foreground">{righe.ebay}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prezzoCatawiki">Prezzo Catawiki</Label>
        <Input
          id="prezzoCatawiki"
          name="prezzoCatawiki"
          inputMode="decimal"
          value={prezzoCatawiki}
          onChange={(e) => setPrezzoCatawiki(e.target.value)}
          placeholder={placeholderPrezzo}
        />
        <p className="text-xs text-muted-foreground">{righe.catawiki}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="riservaCatawiki">Riserva Catawiki</Label>
        <Input
          id="riservaCatawiki"
          name="riservaCatawiki"
          inputMode="decimal"
          value={riservaCatawiki}
          onChange={(e) => setRiservaCatawiki(e.target.value)}
          placeholder={placeholderPrezzo}
        />
        <p className="text-xs text-muted-foreground">{righe.riserva}</p>
      </div>
    </div>
  );
}
