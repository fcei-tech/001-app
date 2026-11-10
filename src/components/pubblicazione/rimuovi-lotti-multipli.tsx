"use client";

// "Rimuovi lotti dal batch" (Release 10): sceglie piu' lotti con le caselle e li
// toglie dal batch in un colpo solo. Gli sku restano in Magazzino.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rimuoviLottiMultipliAction, type EsitoRimozioneMultipla } from "@/app/pubblicazione/actions";

export type LottoRimovibile = { id: number; skuCode: string; artista: string; opera: string; consegnato: boolean };

export function RimuoviLottiMultipli({ batchId, canaleId, lotti }: { batchId: number; canaleId: number; lotti: LottoRimovibile[] }) {
  const [aperto, setAperto] = useState(false);
  const [scelti, setScelti] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [esito, setEsito] = useState<EsitoRimozioneMultipla | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visibili = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? lotti.filter((l) => `${l.skuCode} ${l.artista} ${l.opera}`.toLowerCase().includes(q)) : lotti;
  }, [lotti, filtro]);
  const tuttiVisibili = visibili.length > 0 && visibili.every((l) => scelti.has(l.id));
  const alcuni = !tuttiVisibili && visibili.some((l) => scelti.has(l.id));
  const consegnatiScelti = lotti.filter((l) => scelti.has(l.id) && l.consegnato).length;

  function chiudi() {
    setAperto(false);
    setScelti(new Set());
    setFiltro("");
    setEsito(null);
  }

  function conferma() {
    startTransition(async () => {
      const r = await rimuoviLottiMultipliAction(batchId, canaleId, Array.from(scelti));
      setEsito(r);
      if (r.ok && r.errori.length === 0) {
        router.refresh();
        chiudi();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAperto(true)}>
        <Trash2 /> Rimuovi più lotti…
      </Button>
      <Dialog open={aperto} onOpenChange={(a) => { if (!a) chiudi(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rimuovi lotti dal batch</DialogTitle>
            <DialogDescription>
              Scegli i lotti da togliere. Gli sku restano in Magazzino: puoi riaggiungerli dal picker.
            </DialogDescription>
          </DialogHeader>
          <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Cerca sku, artista, opera…" aria-label="Cerca lotti" />
          <div className="max-h-80 overflow-auto rounded-md border">
            <label className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
              <Checkbox
                checked={tuttiVisibili ? true : alcuni ? "indeterminate" : false}
                onCheckedChange={(v) =>
                  setScelti((prev) => {
                    const n = new Set(prev);
                    for (const l of visibili) {
                      if (v === true) n.add(l.id);
                      else n.delete(l.id);
                    }
                    return n;
                  })
                }
                aria-label="Seleziona tutti i lotti mostrati"
              />
              Seleziona tutti ({visibili.length})
            </label>
            {visibili.map((l) => (
              <label key={l.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                <Checkbox
                  checked={scelti.has(l.id)}
                  onCheckedChange={(v) =>
                    setScelti((prev) => {
                      const n = new Set(prev);
                      if (v === true) n.add(l.id);
                      else n.delete(l.id);
                      return n;
                    })
                  }
                  aria-label={`Rimuovi ${l.skuCode}`}
                />
                <span className="font-mono text-xs">{l.skuCode}</span>
                <span className="truncate">{l.artista} — {l.opera}</span>
                {l.consegnato && <span className="ml-auto shrink-0 text-xs text-muted-foreground">consegnato</span>}
              </label>
            ))}
          </div>
          {consegnatiScelti > 0 && (
            <p className="text-sm text-muted-foreground">
              {consegnatiScelti} {consegnatiScelti === 1 ? "lotto scelto risulta consegnato" : "lotti scelti risultano consegnati"}: il pezzo torna da noi e poi il lotto esce dal batch.
            </p>
          )}
          {esito && !esito.ok && <p className="text-sm text-destructive">{esito.errore}</p>}
          {esito && esito.errori.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <p className="font-medium">Rimossi {esito.rimossi}, non riusciti {esito.errori.length}:</p>
              <ul className="mt-1 list-disc pl-5">
                {esito.errori.map((e) => (
                  <li key={e.skuCode}>{e.skuCode}: {e.motivo}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={chiudi}>Chiudi</Button>
            <Button type="button" variant="destructive" disabled={scelti.size === 0 || pending} onClick={conferma}>
              {pending ? "Rimuovo…" : `Rimuovi ${scelti.size} ${scelti.size === 1 ? "lotto" : "lotti"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
