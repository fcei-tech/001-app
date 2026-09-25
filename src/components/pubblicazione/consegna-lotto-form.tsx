"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { consegnaLottoAction } from "@/app/pubblicazione/actions";

// Form guidato "Consegna" (asta_fisica, 2026-09-25 sessione 5) - SCELTA
// MANUALE dell'operatore per origine/destinazione/quantita', confermata col
// cliente dopo aver segnalato il rischio di un automatismo che indovina
// "dove si trova adesso" un sku (il Registro Movimenti non ha un concetto di
// ubicazione attuale unica, uno sku puo' essere splittato su piu'
// ubicazioni/proprieta'). "Da" e' precompilato dai saldi reali (vedi
// getSaldiSkuPerUbicazione in src/db/queries.ts, passato gia' pronto da
// page.tsx - zero query aggiuntive lato client), "A" precompilato
// sull'ubicazione asta_fisica omonima del canale quando esiste (es. canale
// "Cambi" -> ubicazione "Cambi") ma sempre modificabile.
type SaldoOrigine = { ubicazioneId: number; ubicazioneNome: string; proprieta: string; saldo: number };
type Ubicazione = { id: number; nome: string; tipo: string };

export function ConsegnaLottoForm({
  batchLottoId,
  batchId,
  canaleId,
  canaleNome,
  saldi,
  ubicazioniAttive,
}: {
  batchLottoId: number;
  batchId: number;
  canaleId: number;
  canaleNome: string;
  saldi: SaldoOrigine[];
  ubicazioniAttive: Ubicazione[];
}) {
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  const destinazioneIniziale = ubicazioniAttive.find((u) => u.nome === canaleNome)?.id ?? ubicazioniAttive[0]?.id;
  const [ubicazioneDestinazioneId, setUbicazioneDestinazioneId] = useState<number | undefined>(destinazioneIniziale);
  // Origine di default: il primo saldo che NON coincide gia' con la
  // destinazione (es. il pezzo ha gia' un resto li' da una consegna
  // precedente) - altrimenti origine e destinazione precompilate
  // coinciderebbero e il submit fallirebbe senza che l'operatore abbia
  // toccato nulla (bug trovato in test 2026-09-25). Fallback al primo saldo
  // in assoluto se davvero l'unica scorta e' gia' nella destinazione.
  const primoSaldoValido = saldi.find((s) => s.ubicazioneId !== destinazioneIniziale) ?? saldi[0];
  const chiaveOrigineIniziale = primoSaldoValido ? `${primoSaldoValido.ubicazioneId}:${primoSaldoValido.proprieta}` : "";
  const [chiaveOrigine, setChiaveOrigine] = useState(chiaveOrigineIniziale);
  const [quantita, setQuantita] = useState("1");

  const origineScelta = useMemo(
    () => saldi.find((s) => `${s.ubicazioneId}:${s.proprieta}` === chiaveOrigine),
    [saldi, chiaveOrigine]
  );

  function consegna() {
    setErrore(null);
    if (!origineScelta || !ubicazioneDestinazioneId) {
      setErrore("Scegli origine e destinazione");
      return;
    }
    const q = Number(quantita);
    if (!Number.isFinite(q) || q <= 0) {
      setErrore("Quantita' non valida");
      return;
    }
    const fd = new FormData();
    fd.set("batchLottoId", String(batchLottoId));
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    fd.set("proprieta", origineScelta.proprieta);
    fd.set("ubicazioneOrigineId", String(origineScelta.ubicazioneId));
    fd.set("ubicazioneDestinazioneId", String(ubicazioneDestinazioneId));
    fd.set("quantita", quantita);
    startTransition(async () => {
      try {
        await consegnaLottoAction(fd);
        setAperto(false);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore durante la consegna");
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAperto(true)} disabled={saldi.length === 0}>
        Consegna
      </Button>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consegna lotto</DialogTitle>
            <DialogDescription>
              Sposta la posizione fisica del pezzo: scegli da dove parte e dove arriva (di norma la casa d&apos;asta stessa).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consegna-origine">Da</Label>
              {saldi.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna scorta disponibile per questo sku.</p>
              ) : (
                <Select value={chiaveOrigine} onValueChange={setChiaveOrigine}>
                  <SelectTrigger id="consegna-origine">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {saldi.map((s) => (
                      <SelectItem key={`${s.ubicazioneId}:${s.proprieta}`} value={`${s.ubicazioneId}:${s.proprieta}`}>
                        {s.ubicazioneNome} ({s.proprieta}) — disponibili: {s.saldo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consegna-destinazione">A</Label>
              <Select
                value={ubicazioneDestinazioneId ? String(ubicazioneDestinazioneId) : ""}
                onValueChange={(v) => setUbicazioneDestinazioneId(Number(v))}
              >
                <SelectTrigger id="consegna-destinazione">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ubicazioniAttive.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consegna-quantita">Quantita&apos;</Label>
              <Input
                id="consegna-quantita"
                type="number"
                min={1}
                max={origineScelta?.saldo}
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
                className="w-24"
              />
            </div>

            {errore && <p className="text-sm text-destructive">{errore}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)} disabled={pending}>
              Annulla
            </Button>
            <Button type="button" disabled={pending || saldi.length === 0} onClick={consegna}>
              {pending ? "Consegno..." : "Conferma consegna"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
