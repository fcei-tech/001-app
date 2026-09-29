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
}: {
  batchId: number;
  canaleId: number;
  valoreIniziale: ImpostazioniBatchCatawiki;
  disabilitato: boolean;
}) {
  const [profiloSpedizione, setProfiloSpedizione] = useState<ProfiloSpedizioneCatawiki>(valoreIniziale.profiloSpedizione);
  const [riservaAttiva, setRiservaAttiva] = useState(valoreIniziale.riservaAttiva);
  const [modPrezzo, setModPrezzo] = useState(String(valoreIniziale.modificatorePrezzoPercentuale));
  const [modRiserva, setModRiserva] = useState(String(valoreIniziale.modificatoreRiservaEur));
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

      <div className="flex items-end pb-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={riservaAttiva} onCheckedChange={(v) => setRiservaAttiva(v === true)} disabled={disabilitato} />
          Riserva attiva su tutto il batch
        </label>
      </div>

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
        <Label>Modificatore riserva (€)</Label>
        <Input
          value={modRiserva}
          onChange={(e) => setModRiserva(e.target.value)}
          inputMode="decimal"
          disabled={disabilitato}
          placeholder="0"
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label>Messaggio a Expert (opzionale)</Label>
        <Input
          value={messaggio}
          onChange={(e) => setMessaggio(e.target.value)}
          disabled={disabilitato}
          placeholder="facoltativo"
        />
      </div>

      {!disabilitato && (
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="button" onClick={salva} disabled={pending} size="sm">
            {pending ? "Salvo…" : "Salva impostazioni"}
          </Button>
          {salvato && <span className="text-xs text-success">Salvato</span>}
          {errore && <span className="text-xs text-destructive">{errore}</span>}
        </div>
      )}
    </div>
  );
}
