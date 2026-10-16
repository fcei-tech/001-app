"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { eliminaBatchAction } from "@/app/pubblicazione/actions";

// Componente dedicato solo per il dialog di conferma (2026-09-23 sera,
// richiesta esplicita utente: "manca... non posso mai cancellarli"). Azione
// distruttiva e irreversibile (batch_lotti viene cancellato insieme al
// batch, vedi eliminaBatch in pubblicazione-queries.ts) - stesso pattern di
// conferma gia' in uso per la modifica in blocco di VistaMagazzino, non un
// window.confirm nativo.
// CAMBIO DI ROTTA 2026-09-25 (vedi backlog_ux_FINALIZZATO_2026_09_25_sessione_3
// in claude/09c_python_pubblicazione.yaml, punto 2): la cancellazione non e'
// PIU' MAI bloccata, nemmeno con lotti "accettato" - il bottone e' sempre
// disponibile su qualsiasi stato. Al posto del vecchio blocco duro: un
// AVVISO NON BLOCCANTE (stesso pattern gia' in uso in
// avviso_gia_pubblicato_non_blocco) quando il batch tiene ancora una
// prenotazione reale - numeroLottiConPrenotazione (vedi
// contaLottiConPrenotazione in src/lib/prenotazione-batch.ts) arriva gia'
// calcolato dal chiamante, che ha gia' in mano batch+canale.
export function EliminaBatchButton({
  batchId,
  canaleId,
  numeroLottiConPrenotazione = 0,
  numeroLottiConsegnati = 0,
  avvisoRegistroPortale = false,
}: {
  batchId: number;
  canaleId: number;
  // Quanti lotti di QUESTO batch tengono oggi una prenotazione reale (vedi
  // contaLottiConPrenotazione) - 0 = nessun avviso aggiuntivo, il testo resta
  // quello generico.
  numeroLottiConPrenotazione?: number;
  // Lotti gia' consegnati (movimento di spostamento gia' scritto): cancellando
  // il batch si perde il modo di annullare la consegna da qui.
  numeroLottiConsegnati?: number;
  // Batch di un portale statico gia' confermato/pubblicato: eliminarlo non
  // cambia il registro "caricato" del portale.
  avvisoRegistroPortale?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAperto(true)}>
        <Trash2 /> Elimina batch
      </Button>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare questo batch?</DialogTitle>
            <DialogDescription>
              Il batch e tutti i suoi lotti verranno eliminati definitivamente.{" "}
              {numeroLottiConPrenotazione > 0 ? (
                <>
                  <strong>
                    {numeroLottiConPrenotazione} lott{numeroLottiConPrenotazione === 1 ? "o" : "i"}
                  </strong>{" "}
                  in questo batch tengono ancora una prenotazione reale — verranno liberati per altri
                  batch.
                </>
              ) : (
                "Se il batch era gia' confermato, la disponibilita' dei lotti torna libera per altri batch."
              )}
            </DialogDescription>
          </DialogHeader>
          {numeroLottiConsegnati > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Attenzione: {numeroLottiConsegnati} lott{numeroLottiConsegnati === 1 ? "o risulta consegnato" : "i risultano consegnati"}. La
              consegna resta nel Magazzino (i pezzi restano dove sono stati spostati) ma, eliminando il batch, non potrai più annullarla o
              registrarne il rientro da qui.
            </p>
          )}
          {avvisoRegistroPortale && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Attenzione: eliminare il batch non cambia il registro di cosa è caricato sul portale. Se i pezzi erano già online restano segnati
              come caricati.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)} disabled={pending}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("batchId", String(batchId));
                fd.set("canaleId", String(canaleId));
                startTransition(() => {
                  eliminaBatchAction(fd);
                });
              }}
            >
              {pending ? "Elimino..." : "Elimina definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
