"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { anteprimaConsolidaAction, consolidaAction } from "@/app/sistema/dati/actions";
import type { AnteprimaConsolida } from "@/db/consolida";

// Consolida: fonde le correzioni NASCOSTE (quelle "senza registro") dello
// stesso articolo/proprietario/deposito. Le quantita' non cambiano mai.
// Con skuId lavora su un solo sku (scheda), senza su tutto il magazzino.
export function Consolida({ skuId, compatto }: { skuId?: number; compatto?: boolean }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [anteprima, setAnteprima] = useState<AnteprimaConsolida | null>(null);
  const [parola, setParola] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function apri() {
    setErrore(null);
    setEsito(null);
    setParola("");
    setOccupato(true);
    const r = await anteprimaConsolidaAction(skuId);
    setOccupato(false);
    if (!r.ok) {
      setErrore(r.errore);
      return;
    }
    setAnteprima(r.anteprima);
    setAperto(true);
  }

  async function conferma() {
    setOccupato(true);
    const r = await consolidaAction(parola, skuId);
    setOccupato(false);
    setAperto(false);
    if (r.ok) setEsito(r.messaggio ?? "Fatto.");
    else setErrore(r.errore ?? "Non riuscito");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant={compatto ? "ghost" : "outline"} size={compatto ? "sm" : "default"} disabled={occupato} onClick={apri}>
          {occupato && !aperto ? "Controllo…" : skuId ? "Consolida correzioni" : "Consolida"}
        </Button>
      </div>
      {esito && <p className="text-sm text-success">{esito}</p>}
      {errore && <p className="text-sm text-destructive">{errore}</p>}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consolida le correzioni</DialogTitle>
            <DialogDescription>
              {anteprima && anteprima.gruppiDaFondere > 0
                ? `${anteprima.righeDaEliminare} correzioni fuse su ${anteprima.skuCoinvolti} articoli, nessuna quantità cambia. Le righe nascoste passano da ${anteprima.righeNascoste} a ${anteprima.righeDopo}. I movimenti visibili non vengono toccati.`
                : "Non c'è niente da fondere: ogni correzione nascosta è già unica per articolo, proprietario e deposito."}
            </DialogDescription>
          </DialogHeader>
          {anteprima && anteprima.gruppiDaFondere > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm" htmlFor="parola-consolida">Per confermare scrivi <strong>CONSOLIDA</strong></label>
              <Input id="parola-consolida" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="off" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)}>Chiudi</Button>
            {anteprima && anteprima.gruppiDaFondere > 0 && (
              <Button type="button" disabled={parola !== "CONSOLIDA" || occupato} onClick={conferma}>
                {occupato ? "Lavoro…" : "Consolida"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
