"use client";

import * as React from "react";
import { UploadCloud, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { anteprimaImportExcel, confermaImportExcel } from "./actions";
import type { AnteprimaImport } from "@/lib/excel-import-plan";

type Stato =
  | { fase: "scelta_file" }
  | { fase: "analisi_in_corso" }
  | { fase: "anteprima"; anteprima: AnteprimaImport; erroriRighe: string[] }
  | { fase: "conferma_in_corso"; anteprima: AnteprimaImport; erroriRighe: string[] }
  | { fase: "completato"; skuCreati: number; movimentiCreati: number; skuAggiornati: number }
  | { fase: "errore"; messaggio: string };

export function ImportExcelFlow() {
  const [file, setFile] = React.useState<File | null>(null);
  const [stato, setStato] = React.useState<Stato>({ fase: "scelta_file" });

  async function analizza() {
    if (!file) return;
    setStato({ fase: "analisi_in_corso" });
    const formData = new FormData();
    formData.set("file", file);
    const risultato = await anteprimaImportExcel(formData);
    if (!risultato.ok) {
      setStato({ fase: "errore", messaggio: risultato.errore });
      return;
    }
    setStato({ fase: "anteprima", anteprima: risultato.anteprima, erroriRighe: risultato.erroriRighe });
  }

  async function conferma() {
    if (!file || stato.fase !== "anteprima") return;
    setStato({ fase: "conferma_in_corso", anteprima: stato.anteprima, erroriRighe: stato.erroriRighe });
    const formData = new FormData();
    formData.set("file", file);
    const risultato = await confermaImportExcel(formData);
    if (!risultato.ok) {
      setStato({ fase: "errore", messaggio: risultato.errore });
      return;
    }
    setStato({
      fase: "completato",
      skuCreati: risultato.skuCreati,
      movimentiCreati: risultato.movimentiCreati,
      skuAggiornati: risultato.skuAggiornati,
    });
  }

  function ricomincia() {
    setFile(null);
    setStato({ fase: "scelta_file" });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Carica il file</CardTitle>
          <CardDescription>
            Serve il Master (o il file grezzo STOCK_CONTO_VENDITA) - vengono letti solo i due fogli
            grezzi <strong>STOCK FP</strong> e <strong>STOCK FOGLI CV</strong>, mai le formule del
            foglio MASTER. Righe con SKU vuoto o &quot;IGNORA&quot; sono escluse automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={stato.fase === "analisi_in_corso" || stato.fase === "conferma_in_corso"}
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <Button
            onClick={analizza}
            disabled={!file || stato.fase === "analisi_in_corso" || stato.fase === "conferma_in_corso"}
          >
            {stato.fase === "analisi_in_corso" ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            Analizza file
          </Button>
          {stato.fase !== "scelta_file" && (
            <Button variant="ghost" onClick={ricomincia}>
              Ricomincia con un altro file
            </Button>
          )}
        </CardContent>
      </Card>

      {stato.fase === "errore" && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <p>{stato.messaggio}</p>
          </CardContent>
        </Card>
      )}

      {stato.fase === "completato" && (
        <Card className="border-success/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-success">
            <CheckCircle2 className="size-5 shrink-0" />
            <p>
              Import completato: {stato.skuCreati} nuovi sku, {stato.movimentiCreati} movimenti
              registrati, {stato.skuAggiornati} sku con dati anagrafici/commerciali aggiornati.
            </p>
          </CardContent>
        </Card>
      )}

      {(stato.fase === "anteprima" || stato.fase === "conferma_in_corso") && (
        <AnteprimaVista
          anteprima={stato.anteprima}
          erroriRighe={stato.erroriRighe}
          inCorso={stato.fase === "conferma_in_corso"}
          onConferma={conferma}
        />
      )}
    </div>
  );
}

function AnteprimaVista({
  anteprima,
  erroriRighe,
  inCorso,
  onConferma,
}: {
  anteprima: AnteprimaImport;
  erroriRighe: string[];
  inCorso: boolean;
  onConferma: () => void;
}) {
  const nessunaModifica =
    anteprima.nuoviSku.length === 0 &&
    anteprima.movimenti.length === 0 &&
    anteprima.aggiornamenti.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Riepilogo prima di scrivere</CardTitle>
          <CardDescription>
            Niente viene ancora salvato. Controlla i dettagli sotto, poi conferma.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{anteprima.righeLetteCount} righe lette</Badge>
          <Badge variant={anteprima.nuoviSku.length ? "success" : "secondary"}>
            {anteprima.nuoviSku.length} nuovi sku
          </Badge>
          <Badge variant={anteprima.movimenti.length ? "warning" : "secondary"}>
            {anteprima.movimenti.length} movimenti da registrare
          </Badge>
          <Badge variant={anteprima.aggiornamenti.length ? "warning" : "secondary"}>
            {anteprima.aggiornamenti.length} sku con campi aggiornati
          </Badge>
          <Badge variant="secondary">{anteprima.skuNonToccatiCount} sku non toccati (assenti dal file)</Badge>
          {erroriRighe.length > 0 && (
            <Badge variant="destructive">{erroriRighe.length} righe scartate</Badge>
          )}
        </CardContent>
      </Card>

      {erroriRighe.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Righe scartate</CardTitle>
            <CardDescription>Non generano nessuna scrittura, elencate solo per controllo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-48 overflow-y-auto text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {erroriRighe.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {anteprima.nuoviSku.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuovi sku ({anteprima.nuoviSku.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Artista</TableHead>
                  <TableHead>Opera</TableHead>
                  <TableHead>Carico iniziale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anteprima.nuoviSku.map((n) => (
                  <TableRow key={n.skuCode}>
                    <TableCell className="font-mono text-xs">{n.skuCode}</TableCell>
                    <TableCell>{n.artista}</TableCell>
                    <TableCell>{n.opera}</TableCell>
                    <TableCell>
                      {n.movimenti.length === 0
                        ? "— (quantita' 0)"
                        : n.movimenti.map((m) => `${m.proprieta}: ${m.quantita}`).join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {anteprima.movimenti.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimenti su sku esistenti ({anteprima.movimenti.length})</CardTitle>
            <CardDescription>
              Quantita&apos; Excel diversa da quella gia&apos; tracciata: un aumento genera causale
              &quot;carico&quot;, una diminuzione genera causale &quot;vendita_esterna&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Artista / Opera</TableHead>
                  <TableHead>Proprieta&apos;</TableHead>
                  <TableHead className="text-right">Attuale</TableHead>
                  <TableHead className="text-right">Excel</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Causale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anteprima.movimenti.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{m.skuCode}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.artista} — {m.opera}
                    </TableCell>
                    <TableCell>{m.proprieta}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.quantitaAttuale}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.quantitaExcel}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.causale === "carico" ? "success" : "destructive"}>
                        {m.causale}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {anteprima.aggiornamenti.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campi aggiornati su sku esistenti ({anteprima.aggiornamenti.length})</CardTitle>
            <CardDescription>
              Solo campi compilati in Excel con un valore diverso da quello attuale. Un campo
              vuoto in Excel non cancella mai un valore gia&apos; presente.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Artista / Opera</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Da</TableHead>
                  <TableHead>A</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anteprima.aggiornamenti.flatMap((a) =>
                  a.campi.map((c, i) => (
                    <TableRow key={`${a.skuCode}-${c.campo}`}>
                      {i === 0 ? (
                        <>
                          <TableCell className="font-mono text-xs" rowSpan={a.campi.length}>
                            {a.skuCode}
                          </TableCell>
                          <TableCell className="text-muted-foreground" rowSpan={a.campi.length}>
                            {a.artista} — {a.opera}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell>{c.etichetta}</TableCell>
                      <TableCell className="text-muted-foreground">{c.da ?? "—"}</TableCell>
                      <TableCell className="font-medium">{c.a}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          {nessunaModifica ? (
            <p className="text-sm text-muted-foreground">
              Nessuna differenza rispetto ai dati gia&apos; presenti: niente da importare.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Confermando, queste modifiche vengono scritte nel Magazzino in un&apos;unica operazione.
            </p>
          )}
          <Button onClick={onConferma} disabled={inCorso || nessunaModifica} size="lg">
            {inCorso ? <Loader2 className="animate-spin" /> : null}
            Conferma e importa
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
