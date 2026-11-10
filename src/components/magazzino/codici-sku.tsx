"use client";

// "Prossimo sku libero" accanto al titolo del Magazzino + prenotazione di
// blocchi di codici (Release 10). Click sul codice = copia. I blocchi
// prenotati servono a chi scrive righe su Excel: BATCH non li assegna.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prenotaCodiciAction, rilasciaCodiciAction } from "@/app/magazzino/actions";

export type BloccoMostrato = { id: string; da: number; a: number; usati: number };
const cod = (n: number) => `Z-${String(n).padStart(5, "0")}`;

export function CodiciSku({ prossimo, blocchi, dimensioneStandard }: { prossimo: string; blocchi: BloccoMostrato[]; dimensioneStandard: number }) {
  const [aperto, setAperto] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [quanti, setQuanti] = useState(String(dimensioneStandard));
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function copia() {
    try {
      await navigator.clipboard.writeText(prossimo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1500);
    } catch {
      /* appunti non disponibili: nessun effetto */
    }
  }

  function prenota() {
    setErrore(null);
    startTransition(async () => {
      const r = await prenotaCodiciAction(Number(quanti));
      if (!r.ok) setErrore(r.errore ?? "Errore");
      else router.refresh();
    });
  }

  function rilascia(id: string) {
    setErrore(null);
    startTransition(async () => {
      const r = await rilasciaCodiciAction(id);
      if (!r.ok) setErrore(r.errore ?? "Errore");
      else router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-primary">
        <button type="button" onClick={copia} className="inline-flex items-center gap-1 hover:underline" title="Clic per copiare il codice">
          Prossimo sku libero: <span className="font-mono font-medium">{prossimo}</span>
          {copiato ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
        </button>
        <button type="button" onClick={() => setAperto(true)} className="hover:underline">
          Prenota codici{blocchi.length > 0 ? ` (${blocchi.length})` : ""}…
        </button>
      </div>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prenota codici sku</DialogTitle>
            <DialogDescription>
              Riserva un blocco di codici per scrivere nuove righe su Excel senza doppioni: BATCH non li assegna a nessun altro sku. Quelli che non usi puoi rilasciarli.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-end gap-2">
            <label className="grid gap-1 text-sm">
              Quanti codici
              <Input type="number" min={1} max={500} value={quanti} onChange={(e) => setQuanti(e.target.value)} className="w-28" />
            </label>
            <Button type="button" onClick={prenota} disabled={pending}>Prenota</Button>
          </div>
          {errore && <p className="text-sm text-destructive">{errore}</p>}
          {blocchi.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun blocco prenotato.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {blocchi.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">{cod(b.da)} → {cod(b.a)}</span>
                  <span className="text-xs text-muted-foreground">usati {b.usati} di {b.a - b.da + 1}</span>
                  <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={pending} onClick={() => rilascia(b.id)}>
                    Rilascia
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Rilasciare un blocco libera i codici non ancora usati; gli sku già creati restano dove sono.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
