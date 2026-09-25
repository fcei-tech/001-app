import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getBatch, type OverrideLotto } from "@/db/pubblicazione-queries";
import { getSkuSelezionabiliPerBatch, getTipiOggetto, type ColonnaOrdinabile } from "@/db/queries";
import {
  rimuoviLottoDaBatch,
  confermaBatchAction,
  accettaLottoAction,
  annullaAccettazioneAction,
} from "../../actions";
import { SelettoreLottiBatch } from "@/components/pubblicazione/selettore-lotti";
import { EliminaBatchButton } from "@/components/pubblicazione/elimina-batch-button";
import { OverrideLottoForm } from "@/components/pubblicazione/override-lotto-form";
import { CambiaStatoBatchControl } from "@/components/pubblicazione/cambia-stato-batch-control";
import { coloreCanale } from "@/lib/colori-canali";
import { contaLottiConPrenotazione } from "@/lib/prenotazione-batch";

const ETICHETTE_STATO_RIGA: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  attivo: { label: "Attivo", variant: "secondary" },
  candidato: { label: "Candidato", variant: "outline" },
  accettato: { label: "Accettato", variant: "success" },
};

// Stessa whitelist di validazione del parametro URL ?ordina= gia' in uso su
// src/app/page.tsx (Magazzino), estesa a "impegnato" - deve restare
// allineata a ColonnaOrdinabile in src/db/queries.ts.
const COLONNE_ORDINABILI: ColonnaOrdinabile[] = [
  "skuCode", "artista", "opera", "larghezza", "supporto", "anno", "tipo", "condizione",
  "proprieta", "disponibile", "impegnato", "numeroFoto", "valoreCarico", "prezzoEbay",
  "prezzoCatawiki", "riservaCatawiki", "tag", "note", "stato", "creato", "aggiornato",
];

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  tipo?: string;
  condizione?: string;
  proprieta?: string;
  confoto?: string;
  ordina?: string;
  direzione?: string;
  aggiunti?: string;
  confermato?: string;
};

export default async function BatchPubblicazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ canaleId: string; batchId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { canaleId, batchId } = await params;
  const sp = await searchParams;
  const batch = await getBatch(Number(batchId));

  if (!batch || batch.canaleId !== Number(canaleId)) notFound();

  const inBozza = batch.stato === "bozza";
  // Colonna Azioni per-riga: Rimuovi in bozza, Accetta sui canali asta
  // fisica anche a batch confermato (la casa d'asta risponde solo dopo che
  // il batch e' stato inviato - vedi accettaLottoAction in actions.ts).
  const mostraColonnaAzioni = inBozza || batch.canale.tipo === "asta_fisica";
  const idGiaInBatch = new Set(batch.lotti.map((l) => l.skuId));
  // Transizioni di stato ed eliminazione LIBERE in qualsiasi direzione/stato,
  // senza eccezioni per lotti "accettato" (CAMBIO DI ROTTA 2026-09-25 - vedi
  // backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
  // claude/09c_python_pubblicazione.yaml, punto 2, e i commenti su
  // eliminaBatch/riportaInBozza/cambiaStatoBatch in pubblicazione-queries.ts
  // per il testo completo della decisione). numeroLottiConPrenotazione
  // alimenta l'AVVISO non bloccante nel dialog di EliminaBatchButton (cosa
  // si libera), mai un blocco.
  const numeroLottiConPrenotazione = contaLottiConPrenotazione(batch, batch.canale);
  const colore = coloreCanale(batch.canale.nome);
  // Override per lotto (2026-09-24, richiesta esplicita utente - vedi
  // OverrideLotto in pubblicazione-queries.ts): "Riserva proposta" su
  // asta_fisica, "Prezzo/Riserva evento" su asta_online (Catawiki incluso,
  // nessun caso speciale per nome). Mai effetto sul Magazzino, mai
  // modificabile dopo che il batch e' "generato" (output gia' prodotto con
  // i valori di allora).
  const mostraRiservaProposta = batch.canale.tipo === "asta_fisica";
  const mostraOverrideOnline = batch.canale.tipo === "asta_online";
  const mostraOverride = mostraRiservaProposta || mostraOverrideOnline;
  const overrideModificabile = mostraOverride && batch.stato !== "generato";

  const tipoId = sp.tipo && sp.tipo !== "tutti" ? Number(sp.tipo) : undefined;
  const condizione = sp.condizione && sp.condizione !== "tutti" ? sp.condizione : undefined;
  const proprieta = sp.proprieta === "FP" || sp.proprieta === "CV" ? sp.proprieta : undefined;
  const conFoto = sp.confoto === "si";
  const ordina = sp.ordina && (COLONNE_ORDINABILI as string[]).includes(sp.ordina) ? (sp.ordina as ColonnaOrdinabile) : undefined;
  const direzione = sp.direzione === "desc" ? "desc" : sp.direzione === "asc" ? "asc" : undefined;
  const filtriAttiviPicker = Boolean(sp.q || tipoId || condizione || proprieta || conFoto);

  const [righeDisponibili, tipi] = inBozza
    ? await Promise.all([
        getSkuSelezionabiliPerBatch({ ricerca: sp.q, tipoId, condizione, proprieta, conFoto, ordina, direzione }),
        getTipiOggetto(),
      ])
    : [[], []];
  const righePicker = righeDisponibili.filter((r) => !idGiaInBatch.has(r.id));

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Link
          href={`/pubblicazione/${canaleId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> {batch.canale.nome}
        </Link>

        <div
          className="mb-6 flex items-center justify-between gap-4 border-l-4 pl-4"
          style={colore ? { borderLeftColor: colore } : undefined}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Batch #{batch.id} — {batch.canale.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              Creato il {formatData(batch.createdAt)}
              {batch.confermatoAt && <> · confermato il {formatData(batch.confermatoAt)}</>}
              {numeroLottiConPrenotazione > 0 && (
                <> · {numeroLottiConPrenotazione} lott{numeroLottiConPrenotazione === 1 ? "o" : "i"} con prenotazione reale</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EliminaBatchButton
              batchId={batch.id}
              canaleId={Number(canaleId)}
              numeroLottiConPrenotazione={numeroLottiConPrenotazione}
            />
            {inBozza && (
              // Spostato dal fondo pagina qui in alto (2026-09-23 notte,
              // feedback utente: "voglio i bottoni in alto"), stesso motivo
              // del bottone "Aggiungi" in SelettoreLottiBatch. Resta il
              // percorso primario per bozza->confermato; il controllo Cambia
              // stato qui sotto copre le altre direzioni.
              <form action={confermaBatchAction}>
                <input type="hidden" name="batchId" value={batch.id} />
                <input type="hidden" name="canaleId" value={canaleId} />
                <Button type="submit" disabled={batch.lotti.length === 0}>
                  Conferma batch
                </Button>
              </form>
            )}
            {/* Controllo esterno "Cambia stato" (2026-09-25) - transizioni
                libere in qualsiasi direzione, sostituisce il vecchio bottone
                "Riporta in bozza" col Select generico a 3 vie. */}
            <CambiaStatoBatchControl batchId={batch.id} canaleId={Number(canaleId)} statoAttuale={batch.stato} />
          </div>
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
                    {mostraOverride && (
                      <TableHead>{mostraRiservaProposta ? "Riserva proposta" : "Prezzo / Riserva evento"}</TableHead>
                    )}
                    {mostraColonnaAzioni && <TableHead className="text-right">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.lotti.map((l) => {
                    const statoRiga = ETICHETTE_STATO_RIGA[l.statoRiga] ?? { label: l.statoRiga, variant: "outline" as const };
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.sku.skuCode}</TableCell>
                        <TableCell>{l.sku.artista}</TableCell>
                        <TableCell>{l.sku.opera}</TableCell>
                        <TableCell>
                          <Badge variant={statoRiga.variant}>{statoRiga.label}</Badge>
                        </TableCell>
                        {mostraOverride && (
                          <TableCell>
                            {overrideModificabile ? (
                              <OverrideLottoForm
                                batchLottoId={l.id}
                                batchId={batch.id}
                                canaleId={Number(canaleId)}
                                mostraRiservaProposta={mostraRiservaProposta}
                                valoreIniziale={l.override as OverrideLotto | null}
                              />
                            ) : mostraRiservaProposta ? (
                              (l.override as OverrideLotto | null)?.riservaProposta ?? "—"
                            ) : (
                              `${(l.override as OverrideLotto | null)?.prezzo ?? "—"} / ${(l.override as OverrideLotto | null)?.riserva ?? "—"}`
                            )}
                          </TableCell>
                        )}
                        {mostraColonnaAzioni && (
                          <TableCell className="text-right">
                            {inBozza ? (
                              <form action={rimuoviLottoDaBatch}>
                                <input type="hidden" name="batchLottoId" value={l.id} />
                                <input type="hidden" name="batchId" value={batch.id} />
                                <input type="hidden" name="canaleId" value={canaleId} />
                                <Button type="submit" variant="ghost" size="sm">
                                  Rimuovi
                                </Button>
                              </form>
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "candidato" ? (
                              <form action={accettaLottoAction}>
                                <input type="hidden" name="batchLottoId" value={l.id} />
                                <input type="hidden" name="batchId" value={batch.id} />
                                <input type="hidden" name="canaleId" value={canaleId} />
                                <Button type="submit" variant="secondary" size="sm">
                                  Accetta
                                </Button>
                              </form>
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" ? (
                              // "Annulla accettazione" (2026-09-24, richiesta
                              // esplicita utente): finche' non c'e' un
                              // collegamento reale con le vendite, deve
                              // restare possibile liberare un lotto da
                              // "accettato" - altrimenti un errore o un
                              // accordo saltato con la casa d'asta blocca
                              // per sempre Elimina/Riporta in bozza sul
                              // batch intero, senza rimedio.
                              <form action={annullaAccettazioneAction}>
                                <input type="hidden" name="batchLottoId" value={l.id} />
                                <input type="hidden" name="batchId" value={batch.id} />
                                <input type="hidden" name="canaleId" value={canaleId} />
                                <Button type="submit" variant="outline" size="sm">
                                  Annulla accettazione
                                </Button>
                              </form>
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {inBozza && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Aggiungi lotti</CardTitle>
              <CardDescription>
                Modulo Magazzino filtrato e interattivo: esclude sempre sku bloccati per la vendita, senza scorta o già nel batch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SelettoreLottiBatch
                righe={righePicker}
                tipi={tipi}
                batchId={batch.id}
                canaleId={Number(canaleId)}
                tipoCanale={batch.canale.tipo}
                basePath={`/pubblicazione/${canaleId}/${batchId}`}
                filtriAttivi={filtriAttiviPicker}
                filtriIniziali={{
                  q: sp.q ?? "",
                  tipo: tipoId ? String(tipoId) : "tutti",
                  condizione: condizione ?? "tutti",
                  proprieta: proprieta ?? "tutti",
                  confoto: conFoto ? "si" : "no",
                }}
                ordinaAttuale={ordina}
                direzioneAttuale={direzione ?? "asc"}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
