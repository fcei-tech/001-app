"use client";

// Eliminazione multipla di sku dal Magazzino (Release 10): anteprima con motivo
// per quelli non eliminabili, conferma scrivendo ELIMINA, backup automatico.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { anteprimaEliminaSku, eliminaSkuMultipli, type VoceAnteprimaEliminazione } from "@/app/magazzino/actions";

export function EliminaSkuMultipli({
  aperto,
  onChiudi,
  skuIds,
  onFatto,
}: {
  aperto: boolean;
  onChiudi: () => void;
  skuIds: number[];
  onFatto: (testo: string) => void;
}) {
  const [voci, setVoci] = useState<VoceAnteprimaEliminazione[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [conferma, setConferma] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    anteprimaEliminaSku(skuIds).then((r) => {
      if (!vivo) return;
      if (r.ok) setVoci(r.voci);
      else setErrore(r.errore ?? "Errore");
    });
    return () => {
      vivo = false;
    };
  }, [aperto, skuIds]);

  function chiudi() {
    setVoci(null);
    setErrore(null);
    setConferma("");
    onChiudi();
  }

  const eliminabili = voci?.filter((v) => v.eliminabile) ?? [];
  const bloccati = voci?.filter((v) => !v.eliminabile) ?? [];
  const totFoto = eliminabili.reduce((a, v) => a + v.foto, 0);
  const totPezzi = eliminabili.reduce((a, v) => a + Math.max(v.pezzi, 0), 0);

  function elimina() {
    startTransition(async () => {
      const r = await eliminaSkuMultipli(eliminabili.map((v) => v.id));
      if (!r.ok) {
        setErrore(r.errore ?? "Errore");
        return;
      }
      onFatto(`Eliminati ${r.eliminati} sku${r.saltati ? ` (${r.saltati} non eliminabili)` : ""}. Backup scritto prima di cancellare.`);
      router.refresh();
      chiudi();
    });
  }

  return (
    <Dialog open={aperto} onOpenChange={(a) => { if (!a && !pending) chiudi(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Elimina sku</DialogTitle>
          <DialogDescription>
            Cancella lo sku per intero: scheda, foto collegate, movimenti e storico. Non si può annullare (viene scritto un backup prima).
          </DialogDescription>
        </DialogHeader>
        {!voci && !errore && <p className="text-sm text-muted-foreground">Controllo gli sku…</p>}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {voci && (
          <>
            <p className="text-sm">
              Verranno eliminati <b>{eliminabili.length}</b> sku ({totFoto} foto collegate, {totPezzi} pezzi a magazzino).
            </p>
            {bloccati.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">{bloccati.length} non eliminabili:</p>
                <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">
                  {bloccati.map((v) => (
                    <li key={v.id}><span className="font-mono text-xs">{v.skuCode}</span> — {v.motivo}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="max-h-56 overflow-auto rounded-md border text-sm">
              {eliminabili.map((v) => (
                <div key={v.id} className="flex gap-3 border-b px-3 py-1.5 last:border-b-0">
                  <span className="font-mono text-xs">{v.skuCode}</span>
                  <span className="truncate">{v.artista} — {v.opera}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{v.pezzi} pz · {v.foto} foto</span>
                </div>
              ))}
            </div>
            {eliminabili.length > 0 && (
              <label className="grid gap-1 text-sm">
                Per confermare scrivi <b>ELIMINA</b>
                <Input value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="off" />
              </label>
            )}
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={chiudi} disabled={pending}>Annulla</Button>
          <Button type="button" variant="destructive" disabled={pending || eliminabili.length === 0 || conferma.trim().toUpperCase() !== "ELIMINA"} onClick={elimina}>
            {pending ? "Elimino…" : `Elimina ${eliminabili.length} sku`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
