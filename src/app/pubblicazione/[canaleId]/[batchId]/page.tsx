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
import {
  getSkuSelezionabiliPerBatch,
  getTipiOggetto,
  getUbicazioniAttive,
  getSaldiSkuPerUbicazione,
  getFotoPerSkuIds,
  type ColonnaOrdinabile,
} from "@/db/queries";
import { getSilenziamentiComeMappa } from "@/db/silenziamenti-queries";
import {
  rimuoviLottoDaBatch,
  confermaBatchAction,
  accettaLottoAction,
  annullaAccettazioneAction,
  annullaConsegnaAction,
} from "../../actions";
import { SelettoreLottiBatch } from "@/components/pubblicazione/selettore-lotti";
import { SezioneAggiungiLotti } from "@/components/pubblicazione/sezione-aggiungi-lotti";
import { EliminaBatchButton } from "@/components/pubblicazione/elimina-batch-button";
import { OverrideLottoForm } from "@/components/pubblicazione/override-lotto-form";
import { CambiaStatoBatchControl } from "@/components/pubblicazione/cambia-stato-batch-control";
import { ConsegnaLottoForm } from "@/components/pubblicazione/consegna-lotto-form";
import { RientroLottoButton } from "@/components/pubblicazione/rientro-lotto-button";
import {
  CellaPrezzoCatawiki,
  CellaRiservaCatawiki,
  CellaCondizioneCatawiki,
  SilenziaErroreButton,
} from "@/components/pubblicazione/celle-override-catawiki";
import { ImpostazioniBatchCatawikiForm } from "@/components/pubblicazione/impostazioni-batch-catawiki-form";
import { GeneraFileCatawikiButton } from "@/components/pubblicazione/genera-file-catawiki-button";
import { coloreCanale, fasceCanale } from "@/lib/colori-canali";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";
import { contaLottiConPrenotazione } from "@/lib/prenotazione-batch";
import {
  risolviBatchCatawiki,
  IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
  ETICHETTA_ERRORE_VALIDAZIONE,
  type ImpostazioniBatchCatawiki,
  type LottoPerRisoluzioneCatawiki,
  type OverrideLottoCatawiki,
} from "@/lib/catawiki-resolver";

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
  // Filtri di profondita' min/max del picker "Aggiungi lotti" (2026-09-29) -
  // vedi FiltriPickerIniziali in selettore-lotti.tsx.
  prezzoEbayMin?: string;
  prezzoEbayMax?: string;
  prezzoCatawikiMin?: string;
  prezzoCatawikiMax?: string;
  riservaCatawikiMin?: string;
  riservaCatawikiMax?: string;
  quantitaMin?: string;
  quantitaMax?: string;
};

// Converte una stringa da URLSearchParams in numero, ignorando valori vuoti
// o non numerici (stesso principio "whitelist esplicita, mai fidarsi
// dell'URL a occhio" gia' in uso per COLONNE_ORDINABILI sopra).
function numeroParam(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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
  const fasce = fasceCanale(batch.canale.nome);
  // Override per lotto (2026-09-24, richiesta esplicita utente - vedi
  // OverrideLotto in pubblicazione-queries.ts): "Riserva proposta" su
  // asta_fisica, "Prezzo/Riserva evento" sugli altri canali asta_online
  // (Bidspirit/eBay Asta). Catawiki (2026-09-28, generazione output) ha
  // invece 4 colonne dedicate (Prezzo/Riserva/Condizione/Stato export, vedi
  // isCatawiki sotto) - non usa piu' questa colonna combinata unica. Mai
  // effetto sul Magazzino in nessun caso.
  const isCatawiki = batch.canale.nome === "Catawiki";
  const mostraRiservaProposta = batch.canale.tipo === "asta_fisica";
  const mostraOverrideOnline = batch.canale.tipo === "asta_online" && !isCatawiki;
  const mostraOverride = mostraRiservaProposta || mostraOverrideOnline;
  // Riserva proposta (asta_fisica): SEMPRE modificabile, qualsiasi stato del
  // batch (2026-09-25, sessione 5, richiesta esplicita utente: "la riserva:
  // sempre modificabile" - la trattativa con la casa d'asta continua anche
  // dopo l'invio). Prezzo/riserva evento (asta_online non-Catawiki): bloccato
  // solo dopo "pubblicato" (l'output e' gia' stato prodotto con quei valori)
  // - stesso fix applicato lato server in aggiornaOverrideLottoAction.
  const overrideModificabile =
    mostraRiservaProposta || (mostraOverrideOnline && batch.stato !== "pubblicato");
  // Catawiki: stessa regola "bloccato solo dopo pubblicato" per le 3 celle
  // per-lotto, stesso principio di sopra ma per canale singolo.
  const catawikiModificabile = isCatawiki && batch.stato !== "pubblicato";

  // Risoluzione a 3 livelli (canale/batch/override) per la colonna "Stato
  // export" - stessa fonte di verita' usata da generaFileCatawikiAction, mai
  // ricalcolata con logica diversa (vedi commento in catawiki-resolver.ts).
  const impostazioniCatawiki: ImpostazioniBatchCatawiki = {
    ...IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
    ...((batch.impostazioniBatch ?? {}) as Partial<ImpostazioniBatchCatawiki>),
  };
  const [fotoMappaCatawiki, silenziamentiMappa] = isCatawiki
    ? await Promise.all([
        getFotoPerSkuIds(batch.lotti.map((l) => l.skuId)),
        getSilenziamentiComeMappa(batch.canaleId),
      ])
    : [new Map<number, { id: number; url: string; ordine: number }[]>(), new Map<number, Set<string>>()];
  const righeRisolteCatawiki = isCatawiki
    ? risolviBatchCatawiki(
        batch.lotti.map(
          (l): LottoPerRisoluzioneCatawiki => ({
            batchLottoId: l.id,
            skuId: l.skuId,
            skuCode: l.sku.skuCode,
            skuCondizione: l.sku.condizione,
            skuAnno: l.sku.anno,
            skuPrezzoCatawiki: l.sku.prezzoCatawiki,
            override: (l.override as OverrideLottoCatawiki | null) ?? null,
            numeroFoto: fotoMappaCatawiki.get(l.skuId)?.length ?? 0,
          })
        ),
        impostazioniCatawiki
      )
    : [];
  const risoltaPerLottoId = new Map(righeRisolteCatawiki.map((r) => [r.batchLottoId, r]));
  const motivoGeneraDisabilitato =
    batch.stato === "pubblicato"
      ? "Batch gia' pubblicato - genera un nuovo batch per una nuova esportazione."
      : batch.stato === "bozza"
        ? "Conferma il batch prima di generare il file."
        : undefined;

  const tipoId = sp.tipo && sp.tipo !== "tutti" ? Number(sp.tipo) : undefined;
  const condizione = sp.condizione && sp.condizione !== "tutti" ? sp.condizione : undefined;
  const proprieta = sp.proprieta === "FP" || sp.proprieta === "CV" ? sp.proprieta : undefined;
  const conFoto = sp.confoto === "si";
  const ordina = sp.ordina && (COLONNE_ORDINABILI as string[]).includes(sp.ordina) ? (sp.ordina as ColonnaOrdinabile) : undefined;
  const direzione = sp.direzione === "desc" ? "desc" : sp.direzione === "asc" ? "asc" : undefined;
  const prezzoEbayMin = numeroParam(sp.prezzoEbayMin);
  const prezzoEbayMax = numeroParam(sp.prezzoEbayMax);
  const prezzoCatawikiMin = numeroParam(sp.prezzoCatawikiMin);
  const prezzoCatawikiMax = numeroParam(sp.prezzoCatawikiMax);
  const riservaCatawikiMin = numeroParam(sp.riservaCatawikiMin);
  const riservaCatawikiMax = numeroParam(sp.riservaCatawikiMax);
  const quantitaMin = numeroParam(sp.quantitaMin);
  const quantitaMax = numeroParam(sp.quantitaMax);
  const filtriAttiviPicker = Boolean(
    sp.q || tipoId || condizione || proprieta || conFoto ||
    prezzoEbayMin != null || prezzoEbayMax != null ||
    prezzoCatawikiMin != null || prezzoCatawikiMax != null ||
    riservaCatawikiMin != null || riservaCatawikiMax != null ||
    quantitaMin != null || quantitaMax != null
  );

  const [righeDisponibili, tipi] = inBozza
    ? await Promise.all([
        // soloDisponibileReale = canale.esclusivo (2026-09-25, sessione 6):
        // esclude gli sku gia' interamente impegnati su un ALTRO canale
        // esclusivo (non solo avviso, vedi commento su
        // getSkuSelezionabiliPerBatch in src/db/queries.ts). Un canale non
        // esclusivo non genera mai questo conflitto, quindi resta al
        // comportamento precedente.
        getSkuSelezionabiliPerBatch(
          {
            ricerca: sp.q, tipoId, condizione, proprieta, conFoto, ordina, direzione,
            prezzoEbayMin, prezzoEbayMax, prezzoCatawikiMin, prezzoCatawikiMax,
            riservaCatawikiMin, riservaCatawikiMax, quantitaMin, quantitaMax,
          },
          batch.canale.esclusivo
        ),
        getTipiOggetto(),
      ])
    : [[], []];
  const righePicker = righeDisponibili.filter((r) => !idGiaInBatch.has(r.id));

  // Dati per il form "Consegna" (asta_fisica, 2026-09-25 sessione 5) - solo
  // per i lotti che ne hanno davvero bisogno (accettato, non ancora
  // consegnato, batch non in bozza - vedi commento su mostraColonnaAzioni:
  // in bozza l'unica azione riga e' sempre "Rimuovi"). Saldi calcolati per
  // sku uno alla volta (Promise.all, batch piccoli - stesso principio N+1
  // deliberato gia' in uso in getCanaliConConteggio) invece che con una
  // query aggregata su piu' sku, per riusare getSaldiSkuPerUbicazione cosi'
  // com'e'.
  const lottiDaConsegnare =
    !inBozza && batch.canale.tipo === "asta_fisica"
      ? batch.lotti.filter((l) => l.statoRiga === "accettato" && !l.consegnatoAt)
      : [];
  const [ubicazioniAttive, saldiPerLotto] = await Promise.all([
    lottiDaConsegnare.length > 0 ? getUbicazioniAttive() : Promise.resolve([]),
    Promise.all(lottiDaConsegnare.map((l) => getSaldiSkuPerUbicazione(l.skuId).then((saldi) => [l.id, saldi] as const))),
  ]);
  const saldiPerLottoId = new Map(saldiPerLotto);

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

        {/* 2026-09-29: bordo 20px (SPESSORE_BORDO_CANALE_PX, "opzione C") -
            eBay/eBay Asta usano BarraCanale (4 fasce) invece del bordo
            singolo, vedi barra-canale.tsx. "pl-9" (36px = 20px fascia + 16px
            respiro, come il border-l-[20px]+pl-4 del caso a colore singolo)
            mantiene il testo alla stessa distanza in entrambi i casi -
            "relative overflow-hidden" evita qualsiasi sconfinamento. */}
        <div
          className={`relative mb-6 flex items-center justify-between gap-4 overflow-hidden ${fasce ? "pl-9" : "border-l-[20px] pl-4"}`}
          style={!fasce && colore ? { borderLeftColor: colore } : undefined}
        >
          {fasce && <BarraCanale nomeCanale={batch.canale.nome} />}
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
            {isCatawiki && (
              // Genera E pubblica in un solo click (2026-09-28) - abilitato
              // SOLO a batch confermato (vedi generaFileCatawikiAction in
              // actions.ts, che rifiuta comunque lato server qualsiasi altro
              // stato, questo e' solo il vincolo lato UI).
              <GeneraFileCatawikiButton
                batchId={batch.id}
                disabled={batch.stato !== "confermato"}
                motivoDisabilitato={motivoGeneraDisabilitato}
              />
            )}
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

        {/* Ordine sezioni (2026-09-29, richiesta esplicita del cliente dopo
            il primo test reale: "1 apro picker e aggiungo lotti senza
            modificare, 2 applico impostazioni batch, 3 passo alla lista
            lotti nel batch che si sono aggiornati secondo le impostazioni
            precedenti e posso modificarli singolarmente, 4 pubblico csv") -
            Aggiungi lotti (picker) PRIMA, poi Impostazioni batch, poi Lotti
            nel batch come tabella di revisione/modifica finale in fondo,
            dove la colonna "Stato export" mostra gia' stima/riserva
            calcolate con le impostazioni appena salvate. Generalizzato a
            tutti i canali (non solo Catawiki): "Aggiungi lotti" viene prima
            ovunque, "Impostazioni batch" esiste solo per Catawiki quindi
            semplicemente non compare per gli altri canali.

            CORREZIONE 2026-09-29 (stesso giorno, dopo test sulla release):
            "Aggiungi lotti" e' comprimibile - vedi commento in
            sezione-aggiungi-lotti.tsx. Senza questo, un picker magazzino
            lungo (nessuna paginazione) spingeva "Impostazioni batch"/"Lotti
            nel batch" fuori dalla vista, dando l'impressione che fossero
            sparite - segnalato dal cliente sulla build installata. */}
        {inBozza && (
          <SezioneAggiungiLotti
            apertaDiDefault={batch.lotti.length === 0 || Boolean(sp.aggiunti)}
            numeroLottiNelBatch={batch.lotti.length}
          >
            <SelettoreLottiBatch
              righe={righePicker}
              tipi={tipi}
              batchId={batch.id}
              canaleId={Number(canaleId)}
              basePath={`/pubblicazione/${canaleId}/${batchId}`}
              filtriAttivi={filtriAttiviPicker}
              filtriIniziali={{
                q: sp.q ?? "",
                tipo: tipoId ? String(tipoId) : "tutti",
                condizione: condizione ?? "tutti",
                proprieta: proprieta ?? "tutti",
                confoto: conFoto ? "si" : "no",
                prezzoEbayMin: sp.prezzoEbayMin ?? "",
                prezzoEbayMax: sp.prezzoEbayMax ?? "",
                prezzoCatawikiMin: sp.prezzoCatawikiMin ?? "",
                prezzoCatawikiMax: sp.prezzoCatawikiMax ?? "",
                riservaCatawikiMin: sp.riservaCatawikiMin ?? "",
                riservaCatawikiMax: sp.riservaCatawikiMax ?? "",
                quantitaMin: sp.quantitaMin ?? "",
                quantitaMax: sp.quantitaMax ?? "",
              }}
              ordinaAttuale={ordina}
              direzioneAttuale={direzione ?? "asc"}
            />
          </SezioneAggiungiLotti>
        )}

        {isCatawiki && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Impostazioni batch (Catawiki)</CardTitle>
              <CardDescription>
                Si applicano a tutti i lotti di questo batch - profilo di spedizione, riserva attiva, modificatori
                prezzo/riserva, messaggio a Expert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImpostazioniBatchCatawikiForm
                batchId={batch.id}
                canaleId={Number(canaleId)}
                valoreIniziale={impostazioniCatawiki}
                disabilitato={batch.stato === "pubblicato"}
              />
            </CardContent>
          </Card>
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
                    {isCatawiki && (
                      <>
                        <TableHead className="text-right">Prezzo</TableHead>
                        <TableHead className="text-right">Riserva</TableHead>
                        <TableHead>Condizione</TableHead>
                        <TableHead>Stato export</TableHead>
                      </>
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
                          <div className="flex items-center gap-1.5">
                            <Badge variant={statoRiga.variant}>{statoRiga.label}</Badge>
                            {/* Badge visivo in piu' (2026-09-25, sessione 5) - NON un
                                nuovo lottoStatoEnum (decisione 2026-09-14), solo
                                consegnatoAt valorizzato su un lotto "accettato". */}
                            {l.consegnatoAt && <Badge variant="warning">Consegnato</Badge>}
                          </div>
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
                        {isCatawiki &&
                          (() => {
                            const risolta = risoltaPerLottoId.get(l.id);
                            const override = (l.override as OverrideLottoCatawiki | null) ?? null;
                            return (
                              <>
                                <TableCell className="text-right">
                                  {catawikiModificabile ? (
                                    <CellaPrezzoCatawiki
                                      batchLottoId={l.id}
                                      batchId={batch.id}
                                      canaleId={Number(canaleId)}
                                      valore={override?.prezzo ?? null}
                                      fallback={l.sku.prezzoCatawiki}
                                    />
                                  ) : (
                                    (override?.prezzo ?? l.sku.prezzoCatawiki ?? "—")
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {catawikiModificabile ? (
                                    <CellaRiservaCatawiki
                                      batchLottoId={l.id}
                                      batchId={batch.id}
                                      canaleId={Number(canaleId)}
                                      valore={override?.riserva ?? null}
                                      fallback={risolta?.riservaFinale != null ? String(risolta.riservaFinale) : null}
                                    />
                                  ) : (
                                    (override?.riserva ?? "—")
                                  )}
                                </TableCell>
                                <TableCell>
                                  {catawikiModificabile ? (
                                    <CellaCondizioneCatawiki
                                      batchLottoId={l.id}
                                      batchId={batch.id}
                                      canaleId={Number(canaleId)}
                                      valoreAttuale={override?.condizione ?? null}
                                      fallbackSku={l.sku.condizione}
                                    />
                                  ) : (
                                    <Badge variant="outline">{override?.condizione ?? l.sku.condizione}</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {!risolta ? (
                                    "—"
                                  ) : risolta.valido ? (
                                    <div className="whitespace-nowrap text-xs text-muted-foreground">
                                      Stima: {risolta.stimaLotto !== null ? `€ ${risolta.stimaLotto.toFixed(2)}` : "—"}
                                      {" · "}
                                      Riserva: {risolta.riservaFinale !== null ? `€ ${risolta.riservaFinale.toFixed(2)}` : "—"}
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {risolta.errori.map((err) => {
                                        const silenziato = silenziamentiMappa.get(risolta.skuId)?.has(err) ?? false;
                                        return (
                                          <Badge key={err} variant={silenziato ? "outline" : "destructive"}>
                                            {ETICHETTA_ERRORE_VALIDAZIONE[err]}
                                            {!silenziato && (
                                              <SilenziaErroreButton
                                                skuId={risolta.skuId}
                                                canaleId={batch.canaleId}
                                                batchId={batch.id}
                                                tipoErrore={err}
                                              />
                                            )}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                </TableCell>
                              </>
                            );
                          })()}
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
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" && !l.consegnatoAt ? (
                              // Accettato, non ancora consegnato: "Annulla
                              // accettazione" (2026-09-24, vedi commento
                              // storico sotto) + "Consegna" (2026-09-25,
                              // sessione 5) - sempre distanziati nel flusso
                              // reale del cliente ("accetta e consega, sono
                              // sempre distanziati").
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <form action={annullaAccettazioneAction}>
                                  <input type="hidden" name="batchLottoId" value={l.id} />
                                  <input type="hidden" name="batchId" value={batch.id} />
                                  <input type="hidden" name="canaleId" value={canaleId} />
                                  {/* "Annulla accettazione" (2026-09-24, richiesta
                                      esplicita utente): finche' non c'e' un
                                      collegamento reale con le vendite, deve
                                      restare possibile liberare un lotto da
                                      "accettato" - altrimenti un errore o un
                                      accordo saltato con la casa d'asta blocca
                                      per sempre Elimina/Riporta in bozza sul
                                      batch intero, senza rimedio. */}
                                  <Button type="submit" variant="outline" size="sm">
                                    Annulla accettazione
                                  </Button>
                                </form>
                                <ConsegnaLottoForm
                                  batchLottoId={l.id}
                                  batchId={batch.id}
                                  canaleId={Number(canaleId)}
                                  canaleNome={batch.canale.nome}
                                  saldi={saldiPerLottoId.get(l.id) ?? []}
                                  ubicazioniAttive={ubicazioniAttive}
                                />
                              </div>
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" && l.consegnatoAt ? (
                              // Consegnato: "Annulla consegna" (deterministico,
                              // inverte esattamente lo stesso movimento - vedi
                              // annullaConsegnaAction) + "Rientro" (rimuove il
                              // lotto, con dialog di conferma).
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <form action={annullaConsegnaAction}>
                                  <input type="hidden" name="batchLottoId" value={l.id} />
                                  <input type="hidden" name="batchId" value={batch.id} />
                                  <input type="hidden" name="canaleId" value={canaleId} />
                                  <Button type="submit" variant="outline" size="sm">
                                    Annulla consegna
                                  </Button>
                                </form>
                                <RientroLottoButton batchLottoId={l.id} batchId={batch.id} canaleId={Number(canaleId)} />
                              </div>
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
      </main>
    </div>
  );
}
