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
import type { AnteprimaImport, DecisioniImport } from "@/lib/excel-import-plan";

type Stato =
  | { fase: "scelta_file" }
  | { fase: "analisi_in_corso" }
  | { fase: "anteprima"; anteprima: AnteprimaImport; erroriRighe: string[] }
  | { fase: "conferma_in_corso"; anteprima: AnteprimaImport; erroriRighe: string[] }
  | { fase: "completato"; skuCreati: number; movimentiCreati: number; skuAggiornati: number; rinominati: { vecchio: string; nuovo: string }[] }
  | { fase: "errore"; messaggio: string };

export function ImportExcelFlow() {
  const [file, setFile] = React.useState<File | null>(null);
  const [stato, setStato] = React.useState<Stato>({ fase: "scelta_file" });
  const [decisioni, setDecisioni] = React.useState<DecisioniImport>({ codici: {}, campi: {} });

  async function analizza() {
    if (!file) return;
    setStato({ fase: "analisi_in_corso" });
    setDecisioni({ codici: {}, campi: {} });
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
    formData.set("decisioni", JSON.stringify(decisioni));
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
      rinominati: risultato.rinominati,
    });
  }

  function ricomincia() {
    setDecisioni({ codici: {}, campi: {} });
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

      {stato.fase === "completato" && stato.rinominati.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Codici da correggere nel tuo file Excel</CardTitle>
            <CardDescription>
              Questi sku hanno preso un codice nuovo: nel file Excel cambia la colonna SKU dalla riga con il codice vecchio a quello nuovo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {stato.rinominati.map((r) => (
                <li key={r.nuovo}>
                  <span className="font-mono text-xs">{r.vecchio}</span> → <span className="font-mono text-xs font-medium">{r.nuovo}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(stato.fase === "anteprima" || stato.fase === "conferma_in_corso") && (
        <AnteprimaVista
          anteprima={stato.anteprima}
          erroriRighe={stato.erroriRighe}
          inCorso={stato.fase === "conferma_in_corso"}
          decisioni={decisioni}
          onDecisioni={setDecisioni}
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
  decisioni,
  onDecisioni,
  onConferma,
}: {
  anteprima: AnteprimaImport;
  erroriRighe: string[];
  inCorso: boolean;
  decisioni: DecisioniImport;
  onDecisioni: (d: DecisioniImport) => void;
  onConferma: () => void;
}) {
  const valoriDaMemorizzare = anteprima.valoriExcelDaSalvare.filter((v) => Object.keys(v.valori).length > 0).length;
  const nessunaModifica =
    anteprima.nuoviSku.length === 0 &&
    anteprima.movimenti.length === 0 &&
    anteprima.aggiornamenti.length === 0 &&
    anteprima.conflittiCodice.length === 0 &&
    anteprima.conflittiCampi.length === 0 &&
    valoriDaMemorizzare === 0;
  const nonDecisi =
    anteprima.conflittiCodice.filter((c) => !decisioni.codici[c.skuCode]).length +
    anteprima.conflittiCampi.filter((c) => !decisioni.campi[c.chiave]).length;

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
          {anteprima.conflittiCodice.length + anteprima.conflittiCampi.length > 0 && (
            <Badge variant="warning">{anteprima.conflittiCodice.length + anteprima.conflittiCampi.length} conflitti da decidere</Badge>
          )}
          {valoriDaMemorizzare > 0 && <Badge variant="secondary">{valoriDaMemorizzare} sku: memorizzo i valori letti da Excel</Badge>}
          <Badge variant="secondary">{anteprima.skuNonToccatiCount} sku non toccati (assenti dal file)</Badge>
          {erroriRighe.length > 0 && (
            <Badge variant="destructive">{erroriRighe.length} righe scartate</Badge>
          )}
        </CardContent>
      </Card>

      {anteprima.conflittiCodice.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="text-base">Codici in conflitto ({anteprima.conflittiCodice.length})</CardTitle>
            <CardDescription>
              Questi codici esistono già in BATCH ma con un altro poster. Scegli per ognuno:
              <strong> Sovrascrivi</strong> (i dati Excel sostituiscono quelli di BATCH),
              <strong> Rinomina</strong> (la riga Excel diventa un nuovo sku con un codice libero; poi correggi il codice nel file) oppure
              <strong> Ignora</strong> (la riga viene saltata). Finché non scegli, non si scrive nulla.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {anteprima.conflittiCodice.map((c) => (
              <div key={c.skuCode} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                <span className="font-mono text-xs">{c.skuCode}</span>
                <div className="min-w-0 flex-1">
                  <p>In BATCH: <b>{c.esistente.artista}</b> — {c.esistente.opera}</p>
                  <p>In Excel: <b>{c.excel.artista}</b> — {c.excel.opera}</p>
                </div>
                <div className="flex gap-1">
                  {(["sovrascrivi", "rinomina", "ignora"] as const).map((o) => (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={decisioni.codici[c.skuCode] === o ? "default" : "outline"}
                      onClick={() => onDecisioni({ ...decisioni, codici: { ...decisioni.codici, [c.skuCode]: o } })}
                    >
                      {o === "sovrascrivi" ? "Sovrascrivi" : o === "rinomina" ? "Rinomina" : "Ignora"}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {anteprima.conflittiCampi.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="text-base">Valori cambiati sia in BATCH sia in Excel ({anteprima.conflittiCampi.length})</CardTitle>
            <CardDescription>
              Hai modificato il campo in BATCH e nel frattempo è cambiato anche nel file. Scegli quale tenere per ciascuno.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {anteprima.conflittiCampi.map((c) => (
              <div key={c.chiave} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                <span className="font-mono text-xs">{c.skuCode}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground">{c.artista} — {c.opera}</p>
                  <p>{c.etichetta}: BATCH <b>{c.valoreBatch ?? "vuoto"}</b> · Excel <b>{c.valoreExcel}</b></p>
                </div>
                <div className="flex gap-1">
                  {(["batch", "excel"] as const).map((o) => (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={decisioni.campi[c.chiave] === o ? "default" : "outline"}
                      onClick={() => onDecisioni({ ...decisioni, campi: { ...decisioni.campi, [c.chiave]: o } })}
                    >
                      {o === "batch" ? "Tieni BATCH" : "Usa Excel"}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2 px-6 py-3">
              <Button type="button" size="sm" variant="ghost" onClick={() => onDecisioni({ ...decisioni, campi: { ...decisioni.campi, ...Object.fromEntries(anteprima.conflittiCampi.map((c) => [c.chiave, "batch" as const])) } })}>Tieni BATCH per tutti</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onDecisioni({ ...decisioni, campi: { ...decisioni.campi, ...Object.fromEntries(anteprima.conflittiCampi.map((c) => [c.chiave, "excel" as const])) } })}>Usa Excel per tutti</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              Solo campi che in Excel sono cambiati dall&apos;ultima importazione e che in BATCH non hai
              toccato. Un campo vuoto in Excel non cancella mai un valore gia&apos; presente; le tue
              modifiche fatte in BATCH non vengono sovrascritte.
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

      <Card className="sticky bottom-4 z-20 shadow-lg">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          {nessunaModifica ? (
            <p className="text-sm text-muted-foreground">
              Nessuna differenza rispetto ai dati gia&apos; presenti: niente da importare.
            </p>
          ) : nonDecisi > 0 ? (
            <p className="text-sm text-warning">
              Mancano {nonDecisi} {nonDecisi === 1 ? "scelta" : "scelte"} sui conflitti: finché non le fai non si può importare.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Confermando, queste modifiche vengono scritte nel Magazzino in un&apos;unica operazione.
            </p>
          )}
          <Button onClick={onConferma} disabled={inCorso || nessunaModifica || nonDecisi > 0} size="lg">
            {inCorso ? <Loader2 className="animate-spin" /> : null}
            Conferma e importa
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
