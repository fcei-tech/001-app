"use client";

// Tabella della pagina /pubblicazione/silenziamenti (2026-09-28) - elenco di
// tutti i silenziamenti attivi, con "risolto" calcolato lato server (vedi
// page.tsx: ricalcola risolviLottoCatawiki con i dati sku correnti, nessuna
// scrittura durante quel render) e passato qui gia' pronto. "Riattiva" =
// DELETE del silenziamento (vedi riattivaSilenziamentoQuery in
// silenziamenti-queries.ts) - non ha altro effetto, la riga torna
// semplicemente a poter essere segnalata di nuovo se l'errore si ripresenta.
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import { riattivaSilenziamentoAction, riattivaSilenziamentiBulkAction } from "@/app/pubblicazione/actions";

export type RigaSilenziamento = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  canaleNome: string;
  tipoErroreLabel: string;
  note: string | null;
  createdAtFormattato: string;
  risolto: boolean;
};

export function TabellaSilenziamenti({ righe }: { righe: RigaSilenziamento[] }) {
  const ids = righe.map((r) => r.id);
  const { selezionati, gestisciSeleziona, segnalaShift, selezionaTutti, svuota, tuttiSelezionati, alcuniSelezionati } =
    useSelezioneMultipla<number>(ids);
  const [pending, startTransition] = useTransition();
  const [singoloPendingId, setSingoloPendingId] = useState<number | null>(null);

  const numeroRisolti = righe.filter((r) => r.risolto).length;

  function riattivaSelezionati() {
    const daRiattivare = [...selezionati];
    startTransition(() => {
      riattivaSilenziamentiBulkAction(daRiattivare);
    });
    svuota();
  }

  function riattivaRisolti() {
    const daRiattivare = righe.filter((r) => r.risolto).map((r) => r.id);
    startTransition(() => {
      riattivaSilenziamentiBulkAction(daRiattivare);
    });
  }

  function riattivaSingolo(id: number) {
    setSingoloPendingId(id);
    startTransition(async () => {
      await riattivaSilenziamentoAction(id);
      setSingoloPendingId(null);
    });
  }

  if (righe.length === 0) {
    return <TableEmpty>Nessun errore silenziato al momento.</TableEmpty>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {selezionati.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selezionati.size} selezionati</span>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={riattivaSelezionati}>
              Riattiva selezionati
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={svuota}>
              Deseleziona
            </Button>
          </div>
        )}
        {numeroRisolti > 0 && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={riattivaRisolti}>
            Pulisci risolti ({numeroRisolti})
          </Button>
        )}
      </div>

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
              <TableHead>Sku</TableHead>
              <TableHead>Artista / Opera</TableHead>
              <TableHead>Canale</TableHead>
              <TableHead>Errore silenziato</TableHead>
              <TableHead>Silenziato il</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {righe.map((r) => (
              <TableRow key={r.id}>
                <TableCell onClickCapture={segnalaShift}>
                  <Checkbox
                    checked={selezionati.has(r.id)}
                    onCheckedChange={(v) => gestisciSeleziona(r.id, v === true)}
                    aria-label={`Seleziona silenziamento ${r.skuCode}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.skuCode}</TableCell>
                <TableCell>
                  {r.artista} / {r.opera}
                </TableCell>
                <TableCell>{r.canaleNome}</TableCell>
                <TableCell>{r.tipoErroreLabel}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.createdAtFormattato}</TableCell>
                <TableCell>
                  {r.risolto ? (
                    <Badge variant="success">Risolto</Badge>
                  ) : (
                    <Badge variant="secondary">Attivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending && singoloPendingId === r.id}
                    onClick={() => riattivaSingolo(r.id)}
                  >
                    Riattiva
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
