"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cambiaStatoBatchAction } from "@/app/pubblicazione/actions";

// Controllo esterno "Cambia stato" (2026-09-25, punto 2 del backlog UX
// FINALIZZATO - vedi backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
// claude/09c_python_pubblicazione.yaml): transizioni di stato batch libere
// in QUALSIASI direzione, senza dover navigare avanti/indietro. Sostituisce
// i singoli bottoni "Riporta in bozza"/ecc. con un unico Select a 3 vie,
// riusato identico sia nella pagina dettaglio batch sia in ogni riga della
// lista batch di un canale (ListaBatchCanale) - stesso principio del
// cliente: stesso controllo disponibile "quando ho la lista di batch
// davanti o anche un solo batch".
//
// Il bottone "Conferma batch" (primario, solo in bozza, disabilitato se 0
// lotti) resta com'era nella pagina dettaglio - questo Select e' un modo
// SECONDARIO, sempre disponibile, di raggiungere qualsiasi stato senza
// passare dal flusso guidato. La query lato server rifiuta comunque la
// transizione verso confermato/pubblicato se il batch non ha lotti (vedi
// cambiaStatoBatch in pubblicazione-queries.ts) - l'errore, se capita, arriva
// come Error non catturato (stesso comportamento gia' in uso altrove nel
// software per azioni singole, es. aggiungiLottiABatch).
const ETICHETTE: Record<string, string> = {
  bozza: "Bozza",
  confermato: "Confermato",
  pubblicato: "Pubblicato",
};

export function CambiaStatoBatchControl({
  batchId,
  canaleId,
  statoAttuale,
  className,
}: {
  batchId: number;
  canaleId: number;
  statoAttuale: "bozza" | "confermato" | "pubblicato";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function cambia(nuovoStato: string) {
    if (nuovoStato === statoAttuale) return;
    const fd = new FormData();
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    fd.set("nuovoStato", nuovoStato);
    startTransition(() => {
      cambiaStatoBatchAction(fd);
    });
  }

  return (
    <Select value={statoAttuale} onValueChange={cambia} disabled={pending}>
      <SelectTrigger className={className ?? "h-8 w-36"} aria-label="Cambia stato batch">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ETICHETTE) as (keyof typeof ETICHETTE)[]).map((s) => (
          <SelectItem key={s} value={s}>
            {ETICHETTE[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
