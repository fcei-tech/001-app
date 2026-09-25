"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { rientroLottoAction } from "@/app/pubblicazione/actions";

// "Rientro": il pezzo torna indietro dalla casa d'asta (invenduto/ritirato) -
// rimuove il lotto dal batch e inverte il movimento fisico della consegna
// (2026-09-25, sessione 5, "il rientro cancella il lotto"). Dialog di
// conferma (richiesta esplicita utente) perche' e' un'azione irreversibile
// sul lotto, stesso pattern gia' in uso per EliminaBatchButton.
export function RientroLottoButton({
  batchLottoId,
  batchId,
  canaleId,
}: {
  batchLottoId: number;
  batchId: number;
  canaleId: number;
}) {
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAperto(true)}>
        Rientro
      </Button>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confermare il rientro di questo lotto?</DialogTitle>
            <DialogDescription>
              Il lotto viene tolto dal batch e la posizione fisica torna a dov&apos;era prima della consegna. L&apos;operazione
              non e&apos; reversibile da qui.
            </DialogDescription>
          </DialogHeader>
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
                fd.set("batchLottoId", String(batchLottoId));
                fd.set("batchId", String(batchId));
                fd.set("canaleId", String(canaleId));
                startTransition(() => {
                  rientroLottoAction(fd);
                });
                setAperto(false);
              }}
            >
              {pending ? "Rientro..." : "Conferma rientro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
