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
// Regola allentata il 2026-09-24: non piu' solo in bozza, disponibile su
// qualsiasi stato (bozza/confermato/generato) - il chiamante (pagina batch)
// nasconde comunque il bottone se il batch contiene un lotto gia'
// "accettato" da un'asta fisica, unico caso in cui restare bloccato.
export function EliminaBatchButton({ batchId, canaleId }: { batchId: number; canaleId: number }) {
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
              Il batch e tutti i suoi lotti verranno eliminati definitivamente. Se il batch era gia&apos; confermato, la disponibilita&apos; dei lotti torna libera per altri batch.
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
