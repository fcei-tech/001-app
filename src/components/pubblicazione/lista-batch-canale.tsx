"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import { EliminaBatchButton } from "@/components/pubblicazione/elimina-batch-button";
import { CambiaStatoBatchControl } from "@/components/pubblicazione/cambia-stato-batch-control";
import { eliminaBatchMultiploAction, cambiaStatoBatchMultiploAction } from "@/app/pubblicazione/actions";

// Elenco batch di un canale, con controlli esterni cancella/cambia-stato
// (2026-09-25, punto 2 del backlog UX FINALIZZATO - vedi
// backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
// claude/09c_python_pubblicazione.yaml): "vogli poter fare quei cosa quando
// ho la lista di batch davanti [...] anche con selezione multipla". Ogni
// riga ha gia' i suoi controlli (Cambia stato + Elimina, per l'uso "un solo
// batch senza aprirlo"); la selezione con shift+click (vedi
// src/lib/selezione-multipla.ts) abilita una barra azioni in piu' per
// applicare la stessa operazione a tutte le righe selezionate in un colpo,
// con un unico avviso/dialog consolidato invece di uno per batch.
const ETICHETTE_STATO: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  confermato: { label: "Confermato", variant: "success" },
  pubblicato: { label: "Pubblicato", variant: "outline" },
};

export type RigaBatch = {
  id: number;
  creatoIlFormattato: string;
  stato: "bozza" | "confermato" | "pubblicato";
  numeroLotti: number;
  numeroLottiConPrenotazione: number;
};

export function ListaBatchCanale({
  canaleId,
  righe,
}: {
  canaleId: number;
  righe: RigaBatch[];
}) {
  const ids = righe.map((r) => r.id);
  const { selezionati, gestisciSeleziona, segnalaShift, selezionaTutti, svuota, tuttiSelezionati, alcuniSelezionati } =
    useSelezioneMultipla<number>(ids);
  const [pending, startTransition] = useTransition();
  const [dialogEliminaAperto, setDialogEliminaAperto] = useState(false);
  const [statoBulk, setStatoBulk] = useState<"bozza" | "confermato" | "pubblicato" | "">("");
  const [dialogCambiaStatoAperto, setDialogCambiaStatoAperto] = useState(false);
  const [esitoBulk, setEsitoBulk] = useState<string | null>(null);

  const righeSelezionate = righe.filter((r) => selezionati.has(r.id));
  const totaleLottiConPrenotazione = righeSelezionate.reduce((s, r) => s + r.numeroLottiConPrenotazione, 0);
  const batchConPrenotazione = righeSelezionate.filter((r) => r.numeroLottiConPrenotazione > 0).length;

  function eliminaSelezionati() {
    const fd = new FormData();
    fd.set("canaleId", String(canaleId));
    righeSelezionate.forEach((r) => fd.append("batchId", String(r.id)));
    startTransition(() => {
      eliminaBatchMultiploAction(fd);
    });
    setDialogEliminaAperto(false);
    svuota();
  }

  function cambiaStatoSelezionati() {
    if (!statoBulk) return;
    const fd = new FormData();
    fd.set("canaleId", String(canaleId));
    fd.set("nuovoStato", statoBulk);
    righeSelezionate.forEach((r) => fd.append("batchId", String(r.id)));
    startTransition(async () => {
      const esito = await cambiaStatoBatchMultiploAction(fd);
      if (esito.errori.length > 0) {
        setEsitoBulk(
          `${esito.ok} batch aggiornati, ${esito.errori.length} falliti (${esito.errori
            .map((e) => `#${e.batchId}: ${e.messaggio}`)
            .join("; ")}).`
        );
      } else {
        setEsitoBulk(null);
      }
    });
    setDialogCambiaStatoAperto(false);
    svuota();
    setStatoBulk("");
  }

  return (
    <div className="flex flex-col gap-3">
      {esitoBulk && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {esitoBulk}
        </div>
      )}

      {selezionati.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selezionati.size} batch selezionati</span>
          <Select value={statoBulk} onValueChange={(v) => setStatoBulk(v as typeof statoBulk)}>
            <SelectTrigger className="h-8 w-44" aria-label="Cambia stato selezionati">
              <SelectValue placeholder="Cambia stato in…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bozza">Bozza</SelectItem>
              <SelectItem value="confermato">Confermato</SelectItem>
              <SelectItem value="pubblicato">Pubblicato</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!statoBulk || pending}
            onClick={() => setDialogCambiaStatoAperto(true)}
          >
            Applica
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setDialogEliminaAperto(true)}
          >
            <Trash2 /> Elimina selezionati
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={svuota}>
            Deseleziona
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={tuttiSelezionati ? true : alcuniSelezionati ? "indeterminate" : false}
                onCheckedChange={(v) => selezionaTutti(v === true)}
                aria-label="Seleziona tutti"
              />
            </TableHead>
            <TableHead>Creato il</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Lotti</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((r) => {
            const stato = ETICHETTE_STATO[r.stato] ?? { label: r.stato, variant: "outline" as const };
            return (
              <TableRow key={r.id}>
                <TableCell onClickCapture={segnalaShift}>
                  <Checkbox
                    checked={selezionati.has(r.id)}
                    onCheckedChange={(v) => gestisciSeleziona(r.id, v === true)}
                    aria-label={`Seleziona batch del ${r.creatoIlFormattato}`}
                  />
                </TableCell>
                <TableCell className="p-0">
                  <Link href={`/pubblicazione/${canaleId}/${r.id}`} className="block px-4 py-2">
                    {r.creatoIlFormattato}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/pubblicazione/${canaleId}/${r.id}`}>
                      <Badge variant={stato.variant}>{stato.label}</Badge>
                    </Link>
                    {r.numeroLottiConPrenotazione > 0 && (
                      <span className="text-xs text-muted-foreground" title="Lotti con prenotazione reale in questo batch">
                        ({r.numeroLottiConPrenotazione} prenotat{r.numeroLottiConPrenotazione === 1 ? "o" : "i"})
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.numeroLotti}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <CambiaStatoBatchControl batchId={r.id} canaleId={canaleId} statoAttuale={r.stato} className="h-8 w-32" />
                    <EliminaBatchButton
                      batchId={r.id}
                      canaleId={canaleId}
                      numeroLottiConPrenotazione={r.numeroLottiConPrenotazione}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* Dialog elimina multiplo - avviso consolidato (2026-09-25, punto 2 del
          backlog: "un unico avviso consolidato invece di bloccare l'intera
          operazione o saltare silenziosamente i bloccati") */}
      <Dialog open={dialogEliminaAperto} onOpenChange={setDialogEliminaAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare {righeSelezionate.length} batch selezionati?</DialogTitle>
            <DialogDescription>
              Ogni batch e i suoi lotti verranno eliminati definitivamente.{" "}
              {batchConPrenotazione > 0 ? (
                <>
                  <strong>{batchConPrenotazione}</strong> dei batch selezionati{" "}
                  {batchConPrenotazione === 1 ? "tiene" : "tengono"} ancora una prenotazione reale (
                  <strong>{totaleLottiConPrenotazione}</strong> lott{totaleLottiConPrenotazione === 1 ? "o" : "i"} in
                  totale) — verranno liberati per altri batch.
                </>
              ) : (
                "Nessuno dei batch selezionati tiene una prenotazione attiva."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogEliminaAperto(false)} disabled={pending}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={eliminaSelezionati}>
              {pending ? "Elimino..." : "Elimina definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cambia stato multiplo - conferma esplicita perche' puo'
          liberare o consumare disponibilita' su piu' batch in un colpo solo. */}
      <Dialog open={dialogCambiaStatoAperto} onOpenChange={setDialogCambiaStatoAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cambiare stato di {righeSelezionate.length} batch in &quot;{statoBulk && ETICHETTE_STATO[statoBulk]?.label}&quot;?
            </DialogTitle>
            <DialogDescription>
              {statoBulk === "bozza"
                ? "I batch selezionati torneranno in bozza: la disponibilita' dei lotti gia' confermati/pubblicati (canali esclusivi) tornera' libera."
                : "I batch selezionati che erano in bozza consumeranno disponibilita' se il canale e' esclusivo. Un batch senza lotti non puo' uscire da bozza - verra' segnalato tra gli errori."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogCambiaStatoAperto(false)} disabled={pending}>
              Annulla
            </Button>
            <Button type="button" disabled={pending} onClick={cambiaStatoSelezionati}>
              {pending ? "Applico..." : "Conferma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
