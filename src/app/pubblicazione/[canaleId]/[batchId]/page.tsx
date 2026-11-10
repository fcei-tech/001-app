import { notFound } from "next/navigation";
import { getRegolePrezzi } from "@/db/impostazioni-app-queries";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft } from "lucide-react";
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
  getProprietariAttivi,
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
  togliLottoDalBatchAction,
} from "../../actions";
import { SelettoreLottiBatch } from "@/components/pubblicazione/selettore-lotti";
import { getTagBrevi } from "@/db/tag-queries";
import { leggiTagParam } from "@/lib/tag-filtro";
import { SezioneAggiungiLotti } from "@/components/pubblicazione/sezione-aggiungi-lotti";
import { MenuAzioniBatch } from "@/components/pubblicazione/menu-azioni-batch";
import { OverrideLottoForm } from "@/components/pubblicazione/override-lotto-form";
import { ConsegnaLottoForm } from "@/components/pubblicazione/consegna-lotto-form";
import { MenuAltreAzioni } from "@/components/menu-altre-azioni";
import {
  CellaPrezzoCatawiki,
  CellaRiservaCatawiki,
  CellaCondizioneCatawiki,
  CellaDescrizioneCatawiki,
  SilenziaErroreButton,
} from "@/components/pubblicazione/celle-override-catawiki";
import { ImpostazioniBatchCatawikiForm } from "@/components/pubblicazione/impostazioni-batch-catawiki-form";
import { AzioneLottiGruppo } from "@/components/pubblicazione/azione-lotti-gruppo";
import { GeneraFileBidspiritButton } from "@/components/pubblicazione/genera-file-bidspirit-button";
import { GeneraFileCatawikiButton } from "@/components/pubblicazione/genera-file-catawiki-button";
import { GeneraFileAstaFisicaButton } from "@/components/pubblicazione/genera-file-asta-fisica-button";
import { buildDescription } from "@/lib/catawiki-export";
import { SelettoreColonneLotti, type ColonnaLottiBatch } from "@/components/pubblicazione/selettore-colonne-lotti";
import { coloreCanale, fasceCanale } from "@/lib/colori-canali";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";
import { contaLottiConPrenotazione } from "@/lib/prenotazione-batch";
import {
  risolviBatchCatawiki,
  opzioniDaRegole,
  IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
  ETICHETTA_ERRORE_VALIDAZIONE,
  type ImpostazioniBatchCatawiki,
  type LottoPerRisoluzioneCatawiki,
  type OverrideLottoCatawiki,
} from "@/lib/catawiki-resolver";
import { pl } from "@/lib/plurale";

const ETICHETTE_STATO_RIGA: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  attivo: { label: "In asta", variant: "secondary" },
  candidato: { label: "Proposto", variant: "outline" },
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
  // Filtro per tag: id separati da virgola (lo sku deve averli tutti).
  tag?: string;
  // Ordinamento della tabella "Lotti nel batch" (clic sul titolo della colonna).
  ordinaLotti?: string;
  dirLotti?: string;
};

const COLONNE_ORDINABILI_LOTTI = ["skuCode", "artista", "opera", "stato", "prezzo", "riserva", "condizione"] as const;
type ColonnaLotti = (typeof COLONNE_ORDINABILI_LOTTI)[number];

// Titolo di colonna cliccabile della tabella lotti: crescente, decrescente, poi
// ordine di inserimento. Link normale (la pagina è lato server), conserva gli
// altri parametri dell'indirizzo (filtri del picker compresi).
function TitoloLotti({
  etichetta,
  chiave,
  attuale,
  direzione,
  parametri,
  base,
  dataCol,
  className,
}: {
  etichetta: string;
  chiave: ColonnaLotti;
  attuale?: ColonnaLotti;
  direzione: "asc" | "desc";
  parametri: Record<string, string | undefined>;
  base: string;
  dataCol?: string;
  className?: string;
}) {
  const attiva = attuale === chiave;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parametri)) if (v && k !== "ordinaLotti" && k !== "dirLotti") q.set(k, v);
  if (!attiva) {
    q.set("ordinaLotti", chiave);
    q.set("dirLotti", "asc");
  } else if (direzione === "asc") {
    q.set("ordinaLotti", chiave);
    q.set("dirLotti", "desc");
  }
  const Icona = attiva ? (direzione === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead data-col={dataCol} className={className} aria-sort={attiva ? (direzione === "desc" ? "descending" : "ascending") : "none"}>
      <Link
        href={`${base}${q.toString() ? `?${q.toString()}` : ""}`}
        scroll={false}
        title="Clicca per ordinare"
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${attiva ? "font-medium text-foreground" : ""}`}
      >
        {etichetta}
        <Icona className={`size-3.5 ${attiva ? "" : "opacity-40"}`} />
      </Link>
    </TableHead>
  );
}

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
  const regolePrezzi = await getRegolePrezzi();
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
            skuRiservaCatawiki: l.sku.riservaCatawiki,
            override: (l.override as OverrideLottoCatawiki | null) ?? null,
            numeroFoto: fotoMappaCatawiki.get(l.skuId)?.length ?? 0,
          })
        ),
        impostazioniCatawiki,
        opzioniDaRegole(regolePrezzi)
      )
    : [];
  const risoltaPerLottoId = new Map(righeRisolteCatawiki.map((r) => [r.batchLottoId, r]));
  const motivoGeneraDisabilitato =
    batch.stato === "pubblicato" ? "Batch gia' inviato - genera un nuovo batch per una nuova esportazione." : undefined;

  // Colonne selezionabili della tabella "Lotti nel batch" (2026-09-29): Sku e
  // Azioni restano sempre visibili. Default = colonne presenti prima di questa
  // funzione (Misure/Supporto/Anno sono nuove e nascoste di default).
  const colonneLottiBatch: ColonnaLottiBatch[] = [
    { id: "artista", etichetta: "Artista", defaultVisibile: true },
    { id: "opera", etichetta: "Opera", defaultVisibile: true },
    { id: "misure", etichetta: "Misure", defaultVisibile: false },
    { id: "supporto", etichetta: "Supporto", defaultVisibile: false },
    { id: "anno", etichetta: "Anno / epoca", defaultVisibile: false },
    { id: "stato", etichetta: "Stato riga", defaultVisibile: true },
    ...(mostraOverride
      ? [
          {
            id: "override",
            etichetta: mostraRiservaProposta ? "Riserva proposta" : "Prezzo / Riserva evento",
            defaultVisibile: true,
          },
        ]
      : []),
    ...(isCatawiki
      ? [
          { id: "prezzo", etichetta: "Prezzo", defaultVisibile: true },
          { id: "riserva", etichetta: "Riserva", defaultVisibile: true },
          { id: "condizione", etichetta: "Condizione", defaultVisibile: true },
          { id: "descrizione", etichetta: "Descrizione", defaultVisibile: true },
          { id: "statoExport", etichetta: "Stato export", defaultVisibile: true },
        ]
      : []),
  ];

  const ordinaLotti = (COLONNE_ORDINABILI_LOTTI as readonly string[]).includes(sp.ordinaLotti ?? "") ? (sp.ordinaLotti as ColonnaLotti) : undefined;
  const dirLotti: "asc" | "desc" = sp.dirLotti === "desc" ? "desc" : "asc";
  const lottiOrdinati = (() => {
    if (!ordinaLotti) return batch.lotti;
    const chiave = (l: (typeof batch.lotti)[number]): string | number => {
      const o = (l.override as OverrideLottoCatawiki | null) ?? null;
      switch (ordinaLotti) {
        case "artista": return l.sku.artista.toLowerCase();
        case "opera": return l.sku.opera.toLowerCase();
        case "stato": return l.statoRiga;
        case "prezzo": return Number(o?.prezzo ?? l.sku.prezzoCatawiki ?? 0) || 0;
        case "riserva": return risoltaPerLottoId.get(l.id)?.riservaFinale ?? 0;
        case "condizione": return (o?.condizione ?? l.sku.condizione ?? "").toString();
        default: return l.sku.skuCode;
      }
    };
    const segno = dirLotti === "desc" ? -1 : 1;
    return [...batch.lotti].sort((a, b) => {
      const x = chiave(a);
      const y = chiave(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it", { numeric: true });
      return segno * (c || a.sku.skuCode.localeCompare(b.sku.skuCode, "it", { numeric: true }));
    });
  })();
  const parametriLotti: Record<string, string | undefined> = { ...sp };
  const baseLotti = `/pubblicazione/${canaleId}/${batchId}`;

  const tipoId = sp.tipo && sp.tipo !== "tutti" ? Number(sp.tipo) : undefined;
  const condizione = sp.condizione && sp.condizione !== "tutti" ? sp.condizione : undefined;
  const proprietarioId = sp.proprieta && Number.isInteger(Number(sp.proprieta)) && Number(sp.proprieta) > 0 ? Number(sp.proprieta) : undefined;
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
  const tagIds = leggiTagParam(sp.tag);
  const filtriAttiviPicker = Boolean(
    sp.q || tipoId || condizione || proprietarioId || conFoto ||
    prezzoEbayMin != null || prezzoEbayMax != null ||
    prezzoCatawikiMin != null || prezzoCatawikiMax != null ||
    riservaCatawikiMin != null || riservaCatawikiMax != null ||
    quantitaMin != null || quantitaMax != null || tagIds.length > 0
  );

  const [righeDisponibili, tipi, proprietariElenco, tagDisponibili] = inBozza
    ? await Promise.all([
        // soloDisponibileReale = canale.esclusivo (2026-09-25, sessione 6):
        // esclude gli sku gia' interamente impegnati su un ALTRO canale
        // esclusivo (non solo avviso, vedi commento su
        // getSkuSelezionabiliPerBatch in src/db/queries.ts). Un canale non
        // esclusivo non genera mai questo conflitto, quindi resta al
        // comportamento precedente.
        getSkuSelezionabiliPerBatch(
          {
            ricerca: sp.q, tagIds, tipoId, condizione, proprietarioId, conFoto, ordina, direzione,
            prezzoEbayMin, prezzoEbayMax, prezzoCatawikiMin, prezzoCatawikiMax,
            riservaCatawikiMin, riservaCatawikiMax, quantitaMin, quantitaMax,
          },
          batch.canale.esclusivo
        ),
        getTipiOggetto(),
        getProprietariAttivi(),
        getTagBrevi(),
      ])
    : [[], [], [], []];
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

  // Voce comune del menu "Altre azioni" di ogni lotto delle aste fisiche: toglie il lotto
  // dal batch (se era consegnato, riporta anche il pezzo dov'era).
  const voceTogli = (batchLottoId: number) => ({
    etichetta: "Rimuovi dal batch",
    descrizione: "Il lotto esce dal batch (e, se era consegnato, il pezzo torna da noi). Puoi riaggiungerlo dal picker.",
    azione: togliLottoDalBatchAction,
    campi: { batchLottoId, batchId: batch.id, canaleId },
  });

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
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              <span>{batch.nome ? `${batch.nome}` : `Batch #${batch.id}`} — {batch.canale.nome}</span>
              <Badge variant={batch.stato === "confermato" ? "success" : batch.stato === "pubblicato" ? "outline" : "secondary"}>
                {batch.stato === "bozza" ? "Bozza" : batch.stato === "confermato" ? "Pronto" : "Inviato"}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              {batch.nome ? <>Batch #{batch.id} · </> : null}Creato il {formatData(batch.createdAt)}
              {batch.confermatoAt && <> · pronto dal {formatData(batch.confermatoAt)}</>}
              {numeroLottiConPrenotazione > 0 && (
                <> · {numeroLottiConPrenotazione} lott{numeroLottiConPrenotazione === 1 ? "o" : "i"} con prenotazione reale</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {inBozza ? (
              // Un solo bottone principale per stato: in bozza "Conferma batch";
              // da Pronto in poi "Genera file" (o la lista, per le aste fisiche).
              <form action={confermaBatchAction}>
                <input type="hidden" name="batchId" value={batch.id} />
                <input type="hidden" name="canaleId" value={canaleId} />
                <Button type="submit" disabled={batch.lotti.length === 0}>
                  Conferma batch
                </Button>
              </form>
            ) : (
              <>
                {isCatawiki && (
                  // Genera E segna come Inviato in un solo click (2026-09-28):
                  // la generazione scarica il CSV e porta il batch a Inviato.
                  <GeneraFileCatawikiButton
                    batchId={batch.id}
                    disabled={batch.stato !== "confermato"}
                    motivoDisabilitato={motivoGeneraDisabilitato}
                  />
                )}
                {batch.canale.nome === "Bidspirit" && (
                  <GeneraFileBidspiritButton
                    batchId={batch.id}
                    disabled={batch.lotti.length === 0}
                    motivoDisabilitato="Il batch non ha lotti."
                    giaInviato={batch.stato === "pubblicato"}
                  />
                )}
                {batch.canale.tipo === "asta_fisica" && (
                  // PDF lista lotti: da Pronto genera e passa a Inviato; da Inviato
                  // rigenera senza cambiare stato (la Riserva proposta resta modificabile).
                  <GeneraFileAstaFisicaButton
                    batchId={batch.id}
                    disabled={batch.lotti.length === 0}
                    motivoDisabilitato="Il batch non ha lotti."
                  />
                )}
              </>
            )}
            <MenuAzioniBatch
              batchId={batch.id}
              canaleId={Number(canaleId)}
              stato={batch.stato}
              nome={batch.nome}
              numeroLottiConPrenotazione={numeroLottiConPrenotazione}
              numeroLottiConsegnati={batch.lotti.filter((l) => l.consegnatoAt !== null).length}
              avvisoRegistroPortale={batch.canale.tipo === "statico" && batch.stato !== "bozza"}
            />
          </div>
        </div>

        {batch.canale.tipo === "asta_fisica" && !inBozza && batch.lotti.length > 0 && (
          <AzioneLottiGruppo
            batchId={batch.id}
            canaleNome={batch.canale.nome}
            lotti={batch.lotti.map((l) => ({
              id: l.id,
              skuCode: l.sku.skuCode,
              artista: l.sku.artista,
              opera: l.sku.opera,
              statoRiga: l.statoRiga,
              consegnato: l.consegnatoAt !== null,
            }))}
          />
        )}

        {sp.aggiunti && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Lotti aggiunti.
          </div>
        )}
        {sp.confermato && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Batch pronto — la disponibilita&apos; e&apos; stata aggiornata per i canali esclusivi.
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
              tagDisponibili={tagDisponibili}
              tipi={tipi}
              proprietari={proprietariElenco}
              batchId={batch.id}
              canaleId={Number(canaleId)}
              basePath={`/pubblicazione/${canaleId}/${batchId}`}
              filtriAttivi={filtriAttiviPicker}
              filtriIniziali={{
                q: sp.q ?? "",
                tipo: tipoId ? String(tipoId) : "tutti",
                condizione: condizione ?? "tutti",
                proprieta: proprietarioId ? String(proprietarioId) : "tutti",
                confoto: conFoto ? "si" : "no",
                prezzoEbayMin: sp.prezzoEbayMin ?? "",
                prezzoEbayMax: sp.prezzoEbayMax ?? "",
                prezzoCatawikiMin: sp.prezzoCatawikiMin ?? "",
                prezzoCatawikiMax: sp.prezzoCatawikiMax ?? "",
                riservaCatawikiMin: sp.riservaCatawikiMin ?? "",
                riservaCatawikiMax: sp.riservaCatawikiMax ?? "",
                quantitaMin: sp.quantitaMin ?? "",
                quantitaMax: sp.quantitaMax ?? "",
                tag: tagIds.join(","),
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
            <CardDescription>{batch.lotti.length} sku {pl(batch.lotti.length, "selezionato", "selezionati")}.</CardDescription>
          </CardHeader>
          <CardContent>
            {batch.lotti.length === 0 ? (
              <TableEmpty>Nessun lotto ancora aggiunto.</TableEmpty>
            ) : (
              <div data-lotti-tabella>
              <div className="mb-3 flex justify-end">
                <SelettoreColonneLotti tipoCanale={batch.canale.tipo} colonne={colonneLottiBatch} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TitoloLotti etichetta="Sku" chiave="skuCode" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                    <TitoloLotti etichetta="Artista" chiave="artista" dataCol="artista" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                    <TitoloLotti etichetta="Opera" chiave="opera" dataCol="opera" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                    <TableHead data-col="misure">Misure</TableHead>
                    <TableHead data-col="supporto">Supporto</TableHead>
                    <TableHead data-col="anno">Anno / epoca</TableHead>
                    <TitoloLotti etichetta="Stato riga" chiave="stato" dataCol="stato" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                    {mostraOverride && (
                      <TableHead data-col="override">
                        {mostraRiservaProposta ? "Riserva proposta" : "Prezzo / Riserva evento"}
                      </TableHead>
                    )}
                    {isCatawiki && (
                      <>
                        <TitoloLotti etichetta="Prezzo" chiave="prezzo" dataCol="prezzo" className="text-right" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                        <TitoloLotti etichetta="Riserva" chiave="riserva" dataCol="riserva" className="text-right" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                        <TitoloLotti etichetta="Condizione" chiave="condizione" dataCol="condizione" attuale={ordinaLotti} direzione={dirLotti} parametri={parametriLotti} base={baseLotti} />
                        <TableHead data-col="descrizione">Descrizione</TableHead>
                        <TableHead data-col="statoExport">Stato export</TableHead>
                      </>
                    )}
                    {mostraColonnaAzioni && <TableHead className="sticky right-0 z-10 bg-background text-right shadow-[-1px_0_0_0_var(--border)]">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lottiOrdinati.map((l) => {
                    const statoRiga = ETICHETTE_STATO_RIGA[l.statoRiga] ?? { label: l.statoRiga, variant: "outline" as const };
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.sku.skuCode}</TableCell>
                        <TableCell data-col="artista">{l.sku.artista}</TableCell>
                        <TableCell data-col="opera">{l.sku.opera}</TableCell>
                        <TableCell data-col="misure">
                          {l.sku.larghezza || l.sku.altezza
                            ? `${(l.sku.larghezza ?? "?").replace(/\.0+$/, "")} \u00d7 ${(l.sku.altezza ?? "?").replace(/\.0+$/, "")} cm`
                            : "\u2014"}
                        </TableCell>
                        <TableCell data-col="supporto">{l.sku.supporto || "\u2014"}</TableCell>
                        <TableCell data-col="anno">{l.sku.anno || "\u2014"}</TableCell>
                        <TableCell data-col="stato">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={statoRiga.variant}>{statoRiga.label}</Badge>
                            {/* Badge visivo in piu' (2026-09-25, sessione 5) - NON un
                                nuovo lottoStatoEnum (decisione 2026-09-14), solo
                                consegnatoAt valorizzato su un lotto "accettato". */}
                            {l.consegnatoAt && <Badge variant="warning">{`Consegnato a ${batch.canale.nome}`}</Badge>}
                            {batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" && !l.consegnatoAt && (
                              <span className="text-xs text-muted-foreground">ancora da noi</span>
                            )}
                          </div>
                        </TableCell>
                        {mostraOverride && (
                          <TableCell data-col="override">
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
                                <TableCell data-col="prezzo" className="text-right">
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
                                <TableCell data-col="riserva" className="text-right">
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
                                <TableCell data-col="condizione">
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
                                <TableCell data-col="descrizione">
                                  {catawikiModificabile ? (
                                    <CellaDescrizioneCatawiki
                                      batchLottoId={l.id}
                                      batchId={batch.id}
                                      canaleId={Number(canaleId)}
                                      valore={override?.descrizione ?? null}
                                      generata={buildDescription({
                                        artista: l.sku.artista,
                                        opera: l.sku.opera,
                                        larghezza: l.sku.larghezza,
                                        altezza: l.sku.altezza,
                                        supporto: l.sku.supporto,
                                        anno: (l.sku.anno ?? "").trim(),
                                      })}
                                    />
                                  ) : override?.descrizione ? (
                                    <Badge variant="warning">modificata</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">automatica</span>
                                  )}
                                </TableCell>
                                <TableCell data-col="statoExport">
                                  {!risolta ? (
                                    "—"
                                  ) : risolta.valido ? (
                                    <div className="whitespace-nowrap text-xs text-muted-foreground">
                                      Stima: {risolta.stimaLotto !== null ? `€ ${risolta.stimaLotto.toFixed(2)}` : "—"}
                                      {" · "}
                                      Riserva: {risolta.riservaFinale !== null ? `€ ${risolta.riservaFinale.toFixed(2)}` : "—"}
                                      {risolta.riservaFinale !== null && risolta.origineRiserva === "sku" && " (dallo sku)"}
                                      {risolta.riservaFinale !== null && risolta.origineRiserva === "automatica" && " (50% automatica)"}
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
                          <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-1px_0_0_0_var(--border)]">
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
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <form action={accettaLottoAction}>
                                  <input type="hidden" name="batchLottoId" value={l.id} />
                                  <input type="hidden" name="batchId" value={batch.id} />
                                  <input type="hidden" name="canaleId" value={canaleId} />
                                  <Button type="submit" variant="secondary" size="sm">
                                    Accetta
                                  </Button>
                                </form>
                                <MenuAltreAzioni voci={[voceTogli(l.id)]} />
                              </div>
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" && !l.consegnatoAt ? (
                              // Accettato, non ancora consegnato: azione principale
                              // "Consegna all'asta"; la correzione "Torna proposto"
                              // (ex "Annulla accettazione", 2026-09-24: deve restare
                              // possibile liberare un lotto da "accettato", altrimenti
                              // un accordo saltato blocca Elimina/Riporta in bozza sul
                              // batch intero) sta nel menu "Altre azioni".
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <ConsegnaLottoForm
                                  batchLottoId={l.id}
                                  batchId={batch.id}
                                  canaleId={Number(canaleId)}
                                  canaleNome={batch.canale.nome}
                                  saldi={saldiPerLottoId.get(l.id) ?? []}
                                  ubicazioniAttive={ubicazioniAttive}
                                />
                                <MenuAltreAzioni
                                  voci={[
                                    {
                                      etichetta: "Torna proposto",
                                      descrizione: "L'asta non lo accetta piu': il lotto torna proposto, il pezzo non si muove.",
                                      azione: annullaAccettazioneAction,
                                      campi: { batchLottoId: l.id, batchId: batch.id, canaleId },
                                    },
                                    voceTogli(l.id),
                                  ]}
                                />
                              </div>
                            ) : batch.canale.tipo === "asta_fisica" && l.statoRiga === "accettato" && l.consegnatoAt ? (
                              // Consegnato: azione principale "Rientrato" (l'asta ce lo
                              // ha restituito: il pezzo torna da noi e il lotto resta nel
                              // batch, di nuovo "da consegnare"). Per toglierlo del tutto
                              // dal batch c'e' "Rimuovi dal batch" nel menu.
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <form action={annullaConsegnaAction}>
                                  <input type="hidden" name="batchLottoId" value={l.id} />
                                  <input type="hidden" name="batchId" value={batch.id} />
                                  <input type="hidden" name="canaleId" value={canaleId} />
                                  <Button type="submit" variant="outline" size="sm" title="L'asta ci ha restituito il pezzo: il lotto resta nel batch, da consegnare">
                                    Rientrato
                                  </Button>
                                </form>
                                <MenuAltreAzioni voci={[voceTogli(l.id)]} />
                              </div>
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
