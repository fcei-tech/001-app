import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getBatch } from "@/db/pubblicazione-queries";
import { getMagazzino } from "@/db/queries";
import { aggiungiLottiABatch, rimuoviLottoDaBatch, confermaBatchAction } from "../../actions";

const ETICHETTE_STATO: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  confermato: { label: "Confermato", variant: "success" },
  generato: { label: "Generato", variant: "outline" },
};

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

export default async function BatchPubblicazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ canaleId: string; batchId: string }>;
  searchParams: Promise<{ q?: string; aggiunti?: string; confermato?: string }>;
}) {
  const { canaleId, batchId } = await params;
  const sp = await searchParams;
  const batch = await getBatch(Number(batchId));

  if (!batch || batch.canaleId !== Number(canaleId)) notFound();

  const stato = ETICHETTE_STATO[batch.stato] ?? { label: batch.stato, variant: "outline" as const };
  const inBozza = batch.stato === "bozza";
  const idGiaInBatch = new Set(batch.lotti.map((l) => l.skuId));

  const ricerca = sp.q?.trim();
  const risultatiRicerca =
    inBozza && ricerca
      ? (await getMagazzino({ ricerca, bloccato: "no" })).filter((r) => !idGiaInBatch.has(r.id))
      : [];

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link
          href={`/pubblicazione/${canaleId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {batch.canale.nome}
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Batch #{batch.id} — {batch.canale.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              Creato il {formatData(batch.createdAt)}
              {batch.confermatoAt && <> · confermato il {formatData(batch.confermatoAt)}</>}
            </p>
          </div>
          <Badge variant={stato.variant}>{stato.label}</Badge>
        </div>

        {sp.aggiunti && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Lotti aggiunti.
          </div>
        )}
        {sp.confermato && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Batch confermato — la disponibilita&apos; e&apos; stata aggiornata per i canali esclusivi.
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Lotti nel batch</CardTitle>
            <CardDescription>{batch.lotti.length} sku selezionati.</CardDescription>
          </CardHeader>
          <CardContent>
            {batch.lotti.length === 0 ? (
              <TableEmpty>Nessun lotto ancora aggiunto.</TableEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sku</TableHead>
                    <TableHead>Artista</TableHead>
                    <TableHead>Opera</TableHead>
                    <TableHead>Stato riga</TableHead>
                    {inBozza && <TableHead className="text-right">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.lotti.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.sku.skuCode}</TableCell>
                      <TableCell>{l.sku.artista}</TableCell>
                      <TableCell>{l.sku.opera}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{l.statoRiga}</Badge>
                      </TableCell>
                      {inBozza && (
                        <TableCell className="text-right">
                          <form action={rimuoviLottoDaBatch}>
                            <input type="hidden" name="batchLottoId" value={l.id} />
                            <input type="hidden" name="batchId" value={batch.id} />
                            <input type="hidden" name="canaleId" value={canaleId} />
                            <Button type="submit" variant="ghost" size="sm">
                              Rimuovi
                            </Button>
                          </form>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {inBozza && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Aggiungi lotti</CardTitle>
                <CardDescription>Cerca per artista, opera o sku tra gli sku non bloccati alla vendita.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* GET semplice, nessun JS necessario - stesso motivo per cui
                    piu' sotto uso <input type="checkbox"> nativo invece del
                    componente Radix Checkbox: vedi fix_filtri_lista_magazzino_
                    2026_09_23 in knowledge, gli hidden bubble input di Radix
                    per la serializzazione form si sono gia' rivelati fragili
                    nella WKWebView reale dell'app - qui non serve rischiare,
                    un input nativo name="skuId" e' semplice e affidabile. */}
                <form method="get" className="flex gap-2">
                  <Input type="text" name="q" defaultValue={sp.q ?? ""} placeholder="Artista, opera o sku..." />
                  <Button type="submit" variant="secondary">
                    Cerca
                  </Button>
                </form>

                {ricerca &&
                  (risultatiRicerca.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun risultato (o gia&apos; presente nel batch).</p>
                  ) : (
                    <form action={aggiungiLottiABatch} className="flex flex-col gap-3">
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="canaleId" value={canaleId} />
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10" />
                              <TableHead>Sku</TableHead>
                              <TableHead>Artista</TableHead>
                              <TableHead>Opera</TableHead>
                              <TableHead className="text-right">Disponibile</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {risultatiRicerca.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>
                                  <input type="checkbox" name="skuId" value={r.id} className="size-4" aria-label={`Seleziona ${r.skuCode}`} />
                                </TableCell>
                                <TableCell className="font-mono text-xs">{r.skuCode}</TableCell>
                                <TableCell>{r.artista}</TableCell>
                                <TableCell>{r.opera}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.quantitaDisponibile}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <Button type="submit" className="self-start">
                        Aggiungi selezionati
                      </Button>
                    </form>
                  ))}
              </CardContent>
            </Card>

            <form action={confermaBatchAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <input type="hidden" name="canaleId" value={canaleId} />
              <Button type="submit" disabled={batch.lotti.length === 0}>
                Conferma batch
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
