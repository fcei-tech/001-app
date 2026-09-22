"use client";

import * as React from "react";
import { UploadCloud, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { anteprimaImportFotoMaster, confermaImportFotoMaster } from "./actions";
import type { AnteprimaImportFoto } from "@/lib/foto-import-plan";

type Stato =
  | { fase: "scelta_file" }
  | { fase: "analisi_in_corso" }
  | { fase: "anteprima"; anteprima: AnteprimaImportFoto; erroriRighe: string[] }
  | { fase: "conferma_in_corso"; anteprima: AnteprimaImportFoto; erroriRighe: string[] }
  | { fase: "completato"; skuConFotoAggiunte: number; fotoInserite: number }
  | { fase: "errore"; messaggio: string };

export function ImportFotoFlow() {
  const [file, setFile] = React.useState<File | null>(null);
  const [stato, setStato] = React.useState<Stato>({ fase: "scelta_file" });

  async function analizza() {
    if (!file) return;
    setStato({ fase: "analisi_in_corso" });
    const formData = new FormData();
    formData.set("file", file);
    const risultato = await anteprimaImportFotoMaster(formData);
    if (!risultato.ok) { setStato({ fase: "errore", messaggio: risultato.errore }); return; }
    setStato({ fase: "anteprima", anteprima: risultato.anteprima, erroriRighe: risultato.erroriRighe });
  }

  async function conferma() {
    if (!file || stato.fase !== "anteprima") return;
    setStato({ fase: "conferma_in_corso", anteprima: stato.anteprima, erroriRighe: stato.erroriRighe });
    const formData = new FormData();
    formData.set("file", file);
    const risultato = await confermaImportFotoMaster(formData);
    if (!risultato.ok) { setStato({ fase: "errore", messaggio: risultato.errore }); return; }
    setStato({ fase: "completato", skuConFotoAggiunte: risultato.skuConFotoAggiunte, fotoInserite: risultato.fotoInserite });
  }

  function ricomincia() { setFile(null); setStato({ fase: "scelta_file" }); }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Carica il Master</CardTitle>
          <CardDescription>
            Serve il file Master completo (non il file grezzo STOCK_CONTO_VENDITA) - viene letta
            solo la colonna <strong>MASTER!URL_STORICA</strong>. Uno sku che ha gia&apos; almeno una
            foto nel software non viene mai toccato.
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
          <Button onClick={analizza} disabled={!file || stato.fase === "analisi_in_corso" || stato.fase === "conferma_in_corso"}>
            {stato.fase === "analisi_in_corso" ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            Analizza file
          </Button>
          {stato.fase !== "scelta_file" && (
            <Button variant="ghost" onClick={ricomincia}>Ricomincia con un altro file</Button>
          )}
        </CardContent>
      </Card>

      {stato.fase === "errore" && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-destructive">
            <AlertTriangle className="size-5 shrink-0" /><p>{stato.messaggio}</p>
          </CardContent>
        </Card>
      )}

      {stato.fase === "completato" && (
        <Card className="border-success/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-success">
            <CheckCircle2 className="size-5 shrink-0" />
            <p>Import completato: {stato.skuConFotoAggiunte} sku hanno ricevuto foto, {stato.fotoInserite} foto inserite in totale.</p>
          </CardContent>
        </Card>
      )}

      {(stato.fase === "anteprima" || stato.fase === "conferma_in_corso") && (
        <AnteprimaVista anteprima={stato.anteprima} erroriRighe={stato.erroriRighe} inCorso={stato.fase === "conferma_in_corso"} onConferma={conferma} />
      )}
    </div>
  );
}

function AnteprimaVista({ anteprima, erroriRighe, inCorso, onConferma }: {
  anteprima: AnteprimaImportFoto; erroriRighe: string[]; inCorso: boolean; onConferma: () => void;
}) {
  const nessunaModifica = anteprima.daImportare.length === 0;
  const totaleFotoDaInserire = anteprima.daImportare.reduce((tot, op) => tot + op.urls.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Riepilogo prima di scrivere</CardTitle>
          <CardDescription>Niente viene ancora salvato. Controlla i dettagli sotto, poi conferma.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{anteprima.righeConUrlNelMasterCount} sku con URL nel Master</Badge>
          <Badge variant={anteprima.daImportare.length ? "success" : "secondary"}>
            {anteprima.daImportare.length} sku riceveranno foto ({totaleFotoDaInserire} foto totali)
          </Badge>
          <Badge variant="secondary">{anteprima.skuGiaConFoto.length} sku gia&apos; con foto (saltati)</Badge>
          <Badge variant={anteprima.skuNonTrovati.length ? "warning" : "secondary"}>
            {anteprima.skuNonTrovati.length} sku non ancora nel software
          </Badge>
          {erroriRighe.length > 0 && <Badge variant="destructive">{erroriRighe.length} righe con avviso</Badge>}
        </CardContent>
      </Card>

      {erroriRighe.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader><CardTitle className="text-base">Avvisi</CardTitle></CardHeader>
          <CardContent>
            <ul className="max-h-48 overflow-y-auto text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {erroriRighe.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {anteprima.daImportare.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sku che riceveranno foto ({anteprima.daImportare.length})</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Artista</TableHead><TableHead>Opera</TableHead><TableHead className="text-right">N. foto</TableHead></TableRow></TableHeader>
              <TableBody>
                {anteprima.daImportare.map((op) => (
                  <TableRow key={op.skuCode}>
                    <TableCell className="font-mono text-xs">{op.skuCode}</TableCell>
                    <TableCell>{op.artista}</TableCell>
                    <TableCell>{op.opera}</TableCell>
                    <TableCell className="text-right tabular-nums">{op.urls.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {anteprima.skuNonTrovati.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sku non trovati nel software ({anteprima.skuNonTrovati.length})</CardTitle>
            <CardDescription>Importa prima il file grezzo con &quot;Importa da Excel&quot;, poi ripeti.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead className="text-right">N. foto nel Master</TableHead></TableRow></TableHeader>
              <TableBody>
                {anteprima.skuNonTrovati.map((s) => (
                  <TableRow key={s.skuCode}><TableCell className="font-mono text-xs">{s.skuCode}</TableCell><TableCell className="text-right tabular-nums">{s.nUrl}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {anteprima.skuGiaConFoto.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sku gia&apos; con foto, saltati ({anteprima.skuGiaConFoto.length})</CardTitle>
            <CardDescription>Mai sovrascritte o duplicate.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead className="text-right">Foto gia&apos; presenti</TableHead><TableHead className="text-right">Foto nel Master</TableHead></TableRow></TableHeader>
              <TableBody>
                {anteprima.skuGiaConFoto.map((s) => (
                  <TableRow key={s.skuCode}>
                    <TableCell className="font-mono text-xs">{s.skuCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.nFotoAttuali}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.nUrlMaster}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          {nessunaModifica ? (
            <p className="text-sm text-muted-foreground">Nessuno sku da aggiornare: niente da importare.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Confermando, queste foto vengono scritte nel Magazzino in un&apos;unica operazione.</p>
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
