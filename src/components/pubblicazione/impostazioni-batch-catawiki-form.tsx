"use client";

// Form "Impostazioni batch" (livello 2 del modello a 3 livelli, SOLO
// Catawiki - vedi ImpostazioniBatchCatawiki in src/lib/catawiki-resolver.ts):
// profilo di spedizione, riserva attiva si/no per tutto il batch, i due
// modificatori (%prezzo/€riserva) e il messaggio esperto. Un solo bottone
// Salva per l'intero form (a differenza delle celle Prezzo/Riserva/
// Condizione per lotto, che salvano da sole) - queste impostazioni si
// applicano insieme a TUTTO il batch, ha senso rivederle come blocco prima
// di salvare, non campo per campo.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aggiornaImpostazioniBatchCatawikiAction } from "@/app/pubblicazione/actions";
import { CATAWIKI_PROFILI_SPEDIZIONE, type ProfiloSpedizioneCatawiki } from "@/lib/catawiki-config";
import type { ImpostazioniBatchCatawiki } from "@/lib/catawiki-resolver";

export function ImpostazioniBatchCatawikiForm({
  batchId,
  canaleId,
  valoreIniziale,
  disabilitato,
  variante = "catawiki",
}: {
  batchId: number;
  canaleId: number;
  valoreIniziale: ImpostazioniBatchCatawiki;
  disabilitato: boolean;
  // Bidspirit: niente profilo di spedizione, riserva sempre attiva, niente messaggio a Expert.
  variante?: "catawiki" | "bidspirit";
}) {
  const bidspirit = variante === "bidspirit";
  const [profiloSpedizione, setProfiloSpedizione] = useState<ProfiloSpedizioneCatawiki>(valoreIniziale.profiloSpedizione);
  const [riservaAttiva, setRiservaAttiva] = useState(valoreIniziale.riservaAttiva);
  const [modPrezzo, setModPrezzo] = useState(String(valoreIniziale.modificatorePrezzoPercentuale));
  const [modRiserva, setModRiserva] = useState(String(valoreIniziale.modificatoreRiservaEur));
  const [modRiservaPerc, setModRiservaPerc] = useState(String(valoreIniziale.modificatoreRiservaPercentuale ?? 0));
  const [unita, setUnita] = useState<"eur" | "percento">(valoreIniziale.modificatoreRiservaUnita ?? "eur");
  const [messaggio, setMessaggio] = useState(valoreIniziale.messaggioEsperto);
  const [pending, startTransition] = useTransition();
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function salva() {
    setErrore(null);
    const fd = new FormData();
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    fd.set("profiloSpedizione", profiloSpedizione);
    if (riservaAttiva) fd.set("riservaAttiva", "on");
    fd.set("modificatorePrezzoPercentuale", modPrezzo);
    fd.set("modificatoreRiservaEur", modRiserva);
    fd.set("modificatoreRiservaPercentuale", modRiservaPerc);
    fd.set("modificatoreRiservaUnita", unita);
    fd.set("messaggioEsperto", messaggio);
    startTransition(async () => {
      try {
        await aggiornaImpostazioniBatchCatawikiAction(fd);
        setSalvato(true);
        setTimeout(() => setSalvato(false), 1500);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!bidspirit && (
      <div className="space-y-1.5">
        <Label>Profilo di spedizione</Label>
        <Select
          value={profiloSpedizione}
          onValueChange={(v) => setProfiloSpedizione(v as ProfiloSpedizioneCatawiki)}
          disabled={disabilitato}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CATAWIKI_PROFILI_SPEDIZIONE) as ProfiloSpedizioneCatawiki[]).map((k) => (
              <SelectItem key={k} value={k}>
                {CATAWIKI_PROFILI_SPEDIZIONE[k].etichetta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}

      {!bidspirit && (
      <div className="flex items-end pb-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={riservaAttiva} onCheckedChange={(v) => setRiservaAttiva(v === true)} disabled={disabilitato} />
          Riserva attiva su tutto il batch
        </label>
      </div>
      )}

      <div className="space-y-1.5">
        <Label>Modificatore prezzo (%)</Label>
        <Input
          value={modPrezzo}
          onChange={(e) => setModPrezzo(e.target.value)}
          inputMode="decimal"
          disabled={disabilitato}
          placeholder="0"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Modificatore riserva ({unita === "percento" ? "%" : "€"})</Label>
        <div className="flex gap-2">
          <Input
            value={unita === "percento" ? modRiservaPerc : modRiserva}
            onChange={(e) => (unita === "percento" ? setModRiservaPerc(e.target.value) : setModRiserva(e.target.value))}
            inputMode="decimal"
            disabled={disabilitato}
            placeholder="0"
          />
          {/* Selettore € | % (Release 12): la percentuale e' sulla riserva finale, arrotondata all'euro intero. */}
          <div className="flex shrink-0 overflow-hidden rounded-md border text-sm" role="group" aria-label="Unita del modificatore riserva">
            {(["eur", "percento"] as const).map((u) => (
              <button
                key={u}
                type="button"
                disabled={disabilitato}
                onClick={() => setUnita(u)}
                className={`px-3 ${unita === u ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
              >
                {u === "eur" ? "€" : "%"}
              </button>
            ))}
          </div>
        </div>
        {unita === "percento" && (
          <p className="text-xs text-muted-foreground">Sulla riserva finale (lotto, sku o automatica), arrotondata all&apos;euro intero.</p>
        )}
      </div>

      {!bidspirit && (
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Messaggio a Expert (opzionale)</Label>
        <Input
          value={messaggio}
          onChange={(e) => setMessaggio(e.target.value)}
          disabled={disabilitato}
          placeholder="facoltativo"
        />
      </div>
      )}

      {!disabilitato && (
        <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex items-center gap-3 border-t bg-card/95 px-6 py-3 backdrop-blur sm:col-span-2">
          <Button type="button" onClick={salva} disabled={pending}>
            {pending ? "Salvo…" : "Salva impostazioni"}
          </Button>
          {salvato && <span className="text-xs text-success">Salvato</span>}
          {errore && <span className="text-xs text-destructive">{errore}</span>}
        </div>
      )}
    </div>
  );
}
