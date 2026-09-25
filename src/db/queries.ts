import { and, asc, desc, eq, exists, ilike, notExists, or, sql } from "drizzle-orm";
import { db } from "./index";
import {
  batchLotti,
  batchPubblicazione,
  canali,
  condizioneEnum,
  fotoSku,
  movimentiMagazzino,
  sku,
  tipiOggetto,
  ubicazioni,
} from "./schema";

export type RigaMagazzino = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  condizione: string;
  tipo: string;
  tipoId: number;
  tag: string | null;
  note: string | null;
  bloccatoVendita: boolean;
  valoreCarico: string | null;
  prezzoEbay: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
  quantitaDisponibile: number;
  // Proprieta' viste sui movimenti di questo sku (puo' averne piu' di una,
  // es. un carico FP e uno CV sullo stesso sku) - stringa gia' pronta per
  // la colonna, es. "FP", "FP, CV", o "" se nessun movimento ancora.
  proprieta: string;
  numeroFoto: number;
  // Quanto di quantitaDisponibile e' gia' bloccato su un altro batch
  // CONFERMATO su un canale ESCLUSIVO (vedi impegnatoSql sotto) - disponibile
  // reale = quantitaDisponibile - impegnato. Spostato qui da
  // pubblicazione-queries.ts (2026-09-23 sera): serve nella vista Magazzino
  // generale tanto quanto nel picker lotti di Pubblicazione, e cosi'
  // getMagazzino resta l'unica fonte per RigaMagazzino invece di duplicare
  // il concetto in due punti.
  impegnato: number;
  createdAt: string;
  updatedAt: string;
};

// REGOLA PERMANENTE (2026-09-23): tutte le colonne della tabella Magazzino
// devono essere ordinabili, non solo un sottoinsieme - vedi
// MAPPA_ORDINABILI (Record totale, non Partial) in
// src/components/magazzino/vista-magazzino.tsx, che forza a compilazione
// una voce qui per ogni ColonnaId lato client.
export type ColonnaOrdinabile =
  | "skuCode"
  | "artista"
  | "opera"
  | "larghezza"
  | "supporto"
  | "anno"
  | "tipo"
  | "condizione"
  | "proprieta"
  | "disponibile"
  | "impegnato"
  | "numeroFoto"
  | "valoreCarico"
  | "prezzoEbay"
  | "prezzoCatawiki"
  | "riservaCatawiki"
  | "tag"
  | "note"
  | "stato"
  | "creato"
  | "aggiornato";

export type FiltriMagazzino = {
  ricerca?: string;
  tipoId?: number;
  condizione?: string;
  proprieta?: "FP" | "CV";
  bloccato?: "si" | "no";
  disponibilita?: "disponibile" | "esaurito";
  senzaFoto?: boolean;
  // Inverso di senzaFoto - solo sku con almeno una foto salvata. Dimensione
  // indipendente (non un terzo valore sullo stesso campo) apposta: la vista
  // Magazzino generale non la usa mai, solo il picker lotti di Pubblicazione
  // (vedi getSkuSelezionabiliPerBatch sotto) - tenerla separata da senzaFoto
  // evita di toccare il filtro gia' in uso su src/app/page.tsx.
  conFoto?: boolean;
  ordina?: ColonnaOrdinabile;
  direzione?: "asc" | "desc";
};

// Condizione e' un codice testuale (A/A-/B+/B/B-/C), non ordinabile
// alfabeticamente in modo sensato (l'ordine lessicografico mischia i gradi:
// "A" < "A-" < "B" < "B+" < "B-" < "C"). Rango numerico esplicito che
// rispecchia la scala qualitativa vera, vedi 09_python_checklist.yaml/
// modulo_magazzino_design_2026_09_11/vocabolario_condizione_2026_09_11.
const RANGO_CONDIZIONE = sql`case ${sku.condizione}
  when 'A' then 1
  when 'A-' then 2
  when 'B+' then 3
  when 'B' then 4
  when 'B-' then 5
  when 'C' then 6
  else 7 end`;

// Frammenti SQL aggregati/derivati condivisi fra la select e l'ordinamento
// (2026-09-23) - stessa espressione usata in entrambi i punti cosi'
// l'ordinamento su "disponibile"/"proprieta"/"numeroFoto" resta coerente col
// valore mostrato in colonna. Ordinare su un'espressione aggregata ripetuta
// in ORDER BY e' valido in Postgres nello stesso contesto GROUP BY della
// select principale. Funzioni (non costanti) apposta: sql`` costruisce un
// oggetto SQL mutabile (.mapWith imposta un decoder in place) - una
// funzione garantisce un'istanza fresca per ogni chiamata invece di
// condividerne una fra tutte le esecuzioni concorrenti di getMagazzino.
const quantitaDisponibileSql = () => sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`;
const proprietaSql = () => sql`coalesce(string_agg(distinct ${movimentiMagazzino.proprieta}::text, ', '), '')`;
const numeroFotoSql = () => sql`(select count(*) from foto_sku fs where fs.sku_id = ${sku.id})`;

// Equivalente dinamico di MASTER!QTY_DISPONIBILE_REALE: conta le righe
// batch_lotti dove il batch e' confermato O pubblicato (fix 2026-09-25,
// sessione 5: un batch "pubblicato" - ex "generato" - continua a tenere la
// prenotazione, non la libera in silenzio solo perche' l'output e' stato
// generato), il canale e' esclusivo, e (asta_fisica: statoRiga=accettato) OR
// (asta_online/statico: statoRiga=attivo).
// Spostata qui da pubblicazione-queries.ts (2026-09-23 sera, insieme al
// campo impegnato su RigaMagazzino sopra). Stringa letterale "sku"."id" (non
// ${sku.id} interpolato) DELIBERATA: interpolare un oggetto Column di
// Drizzle in una subquery correlata dentro una select che unisce piu'
// tabelle con colonne dallo stesso nome puo' perdere il prefisso tabella e
// generare "column reference is ambiguous" (42702) - gia' scoperto e
// corretto in una sessione precedente, vedi note storiche del modulo
// Pubblicazione. Funzione (non costante) per lo stesso motivo di
// quantitaDisponibileSql/proprietaSql/numeroFotoSql sopra.
export function impegnatoSql() {
  return sql<number>`(
    select count(*)::int
    from ${batchLotti} bl
    inner join ${batchPubblicazione} bp on bp.id = bl.batch_id
    inner join ${canali} c on c.id = bp.canale_id
    where bl.sku_id = "sku"."id"
      and bp.stato in ('confermato', 'pubblicato')
      and c.esclusivo = true
      and (
        (c.tipo = 'asta_fisica' and bl.stato_riga = 'accettato')
        or (c.tipo != 'asta_fisica' and bl.stato_riga = 'attivo')
      )
  )`;
}

export async function getImpegnatoPerSku(skuId: number): Promise<number> {
  const [riga] = await db
    .select({ impegnato: impegnatoSql() })
    .from(sku)
    .where(eq(sku.id, skuId));
  return riga?.impegnato ?? 0;
}

export async function getMagazzino(filtri: FiltriMagazzino = {}): Promise<RigaMagazzino[]> {
  const condizioniWhere = [];

  if (filtri.ricerca?.trim()) {
    condizioniWhere.push(
      or(
        ilike(sku.artista, `%${filtri.ricerca}%`),
        ilike(sku.opera, `%${filtri.ricerca}%`),
        ilike(sku.skuCode, `%${filtri.ricerca}%`)
      )
    );
  }
  if (filtri.tipoId) condizioniWhere.push(eq(sku.tipoId, filtri.tipoId));
  if (filtri.condizione) {
    condizioniWhere.push(eq(sku.condizione, filtri.condizione as (typeof condizioneEnum.enumValues)[number]));
  }
  if (filtri.bloccato === "si") condizioniWhere.push(eq(sku.bloccatoVendita, true));
  if (filtri.bloccato === "no") condizioniWhere.push(eq(sku.bloccatoVendita, false));
  if (filtri.proprieta) {
    condizioniWhere.push(
      exists(
        db
          .select({ uno: sql`1` })
          .from(movimentiMagazzino)
          .where(and(eq(movimentiMagazzino.skuId, sku.id), eq(movimentiMagazzino.proprieta, filtri.proprieta!)))
      )
    );
  }
  if (filtri.senzaFoto) {
    condizioniWhere.push(
      notExists(db.select({ uno: sql`1` }).from(fotoSku).where(eq(fotoSku.skuId, sku.id)))
    );
  }
  if (filtri.conFoto) {
    condizioniWhere.push(
      exists(db.select({ uno: sql`1` }).from(fotoSku).where(eq(fotoSku.skuId, sku.id)))
    );
  }

  const having =
    filtri.disponibilita === "disponibile"
      ? sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0) > 0`
      : filtri.disponibilita === "esaurito"
        ? sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0) <= 0`
        : undefined;

  // Colonne cliccabili in intestazione per l'ordinamento lista (2026-09-23,
  // esteso lo stesso giorno a TUTTE le colonne della tabella per regola
  // permanente - vedi commento su ColonnaOrdinabile sopra).
  // Whitelist esplicita: mai interpolare filtri.ordina direttamente in SQL.
  const COLONNE_ORDINABILI = {
    skuCode: sku.skuCode,
    artista: sku.artista,
    opera: sku.opera,
    larghezza: sku.larghezza,
    supporto: sku.supporto,
    anno: sku.anno,
    tipo: tipiOggetto.nome,
    condizione: RANGO_CONDIZIONE,
    proprieta: proprietaSql(),
    disponibile: quantitaDisponibileSql(),
    impegnato: impegnatoSql(),
    numeroFoto: numeroFotoSql(),
    valoreCarico: sku.valoreCarico,
    prezzoEbay: sku.prezzoEbay,
    prezzoCatawiki: sku.prezzoCatawiki,
    riservaCatawiki: sku.riservaCatawiki,
    tag: sku.tag,
    note: sku.note,
    stato: sku.bloccatoVendita,
    creato: sku.createdAt,
    aggiornato: sku.updatedAt,
  };
  const colonnaOrdinamento = filtri.ordina ? COLONNE_ORDINABILI[filtri.ordina] : sku.skuCode;
  const direzioneOrdinamento = filtri.direzione === "desc" ? desc : asc;

  const righe = await db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      larghezza: sku.larghezza,
      altezza: sku.altezza,
      supporto: sku.supporto,
      anno: sku.anno,
      condizione: sku.condizione,
      tipo: tipiOggetto.nome,
      tipoId: sku.tipoId,
      tag: sku.tag,
      note: sku.note,
      bloccatoVendita: sku.bloccatoVendita,
      valoreCarico: sku.valoreCarico,
      prezzoEbay: sku.prezzoEbay,
      prezzoCatawiki: sku.prezzoCatawiki,
      riservaCatawiki: sku.riservaCatawiki,
      quantitaDisponibile: quantitaDisponibileSql().mapWith(Number),
      // string_agg ignora da solo i NULL (righe senza movimenti per via del
      // left join) - nessun gate esplicito necessario.
      proprieta: proprietaSql().mapWith(String),
      // Subquery correlata (non un altro left join): un secondo left join a
      // foto_sku qui creerebbe un fan-out incrociato con i movimenti gia'
      // joinati, gonfiando quantitaDisponibile. Stesso pattern gia' in uso
      // in cercaCandidatiDuplicati sotto. impegnato segue lo stesso motivo,
      // in piu' vedi la nota sulla stringa letterale "sku"."id" su
      // impegnatoSql sopra.
      numeroFoto: numeroFotoSql().mapWith(Number),
      impegnato: impegnatoSql().mapWith(Number),
      createdAt: sku.createdAt,
      updatedAt: sku.updatedAt,
    })
    .from(sku)
    .innerJoin(tipiOggetto, eq(sku.tipoId, tipiOggetto.id))
    .leftJoin(movimentiMagazzino, eq(movimentiMagazzino.skuId, sku.id))
    .where(condizioniWhere.length ? and(...condizioniWhere) : undefined)
    .groupBy(sku.id, tipiOggetto.nome)
    .having(having)
    .orderBy(direzioneOrdinamento(colonnaOrdinamento), asc(sku.skuCode));

  return righe.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// Filtri esposti al picker lotti di Pubblicazione: stessa forma di
// FiltriMagazzino MA senza bloccato/disponibilita - quei due non sono una
// scelta dell'utente li', sono sempre forzati (vedi
// getSkuSelezionabiliPerBatch sotto), quindi non ha senso lasciarli
// nell'interfaccia pubblica di questa funzione.
export type FiltriPickerPubblicazione = Omit<FiltriMagazzino, "bloccato" | "disponibilita">;

// Vista Pubblicazione (picker lotti da aggiungere a un batch, 2026-09-23
// sera) - riusa getMagazzino con tre esclusioni SEMPRE attive, mai
// togglabili da UI, confermate con l'utente:
// - bloccatoVendita=true -> mai selezionabile per un batch (stessa regola
//   gia' in vigore ovunque altro nel Magazzino).
// - quantitaDisponibile <= 0 -> mai selezionabile (equivalente al
//   doppio_cancello_base gia' fissato per i fogli portale Excel:
//   QTY_TOTALE > 0). A differenza della vista Magazzino generale, qui non
//   e' un filtro opzionale: non ha senso proporre in un batch uno sku senza
//   scorta.
// - skuCode = "IGNORA" -> mai selezionabile. A differenza di Excel (dove
//   RANK_SKU/COUNTIF tollerava un duplicato "IGNORA" per foglio), qui
//   skuCode e' UNIQUE quindi non puo' comunque esisterne piu' di uno, ma va
//   comunque escluso se presente.
// NOTA RANK_SKU (Master colonna B, COUNTIF progressivo su FP/CV): nessun
// filtro equivalente qui - il problema che risolve in Excel (stesso sku
// duplicato su due righe fisiche, foglio FP e foglio CV) non esiste in
// questo schema, dove sku.skuCode e' UNIQUE e quantitaDisponibile e' gia'
// una SUM aggregata su tutti i movimenti (FP e CV inclusi) dello stesso sku.
export async function getSkuSelezionabiliPerBatch(
  filtri: FiltriPickerPubblicazione = {}
): Promise<RigaMagazzino[]> {
  const righe = await getMagazzino({ ...filtri, bloccato: "no", disponibilita: "disponibile" });
  return righe.filter((r) => r.skuCode !== "IGNORA");
}

export async function contaSku(): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(sku);
  return count;
}

export async function cercaCandidatiDuplicati(query: string) {
  const q = query.trim();
  if (!q) return [];
  return db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      larghezza: sku.larghezza,
      altezza: sku.altezza,
      supporto: sku.supporto,
      quantitaDisponibile: sql<number>`coalesce((select sum(m.quantita_delta) from movimenti_magazzino m where m.sku_id = ${sku.id}), 0)`.mapWith(Number),
    })
    .from(sku)
    .where(or(ilike(sku.artista, `%${q}%`), ilike(sku.opera, `%${q}%`)))
    .orderBy(asc(sku.artista))
    .limit(10);
}

export async function getTipiOggetto() {
  return db.query.tipiOggetto.findMany({
    where: (t, { eq }) => eq(t.attivo, true),
    orderBy: (t, { asc }) => asc(t.nome),
  });
}

export async function getUbicazioniAttive() {
  return db.query.ubicazioni.findMany({
    where: (u, { eq }) => eq(u.attivo, true),
    orderBy: (u, { asc }) => asc(u.nome),
  });
}

export async function getSkuById(id: number) {
  return db.query.sku.findFirst({
    where: (s, { eq }) => eq(s.id, id),
    with: { tipo: true },
  });
}

export async function getFotoSku(skuId: number) {
  return db
    .select({ id: fotoSku.id, url: fotoSku.url, ordine: fotoSku.ordine })
    .from(fotoSku)
    .where(eq(fotoSku.skuId, skuId))
    .orderBy(asc(fotoSku.ordine));
}

// Saldo per combinazione proprieta'+ubicazione di uno sku, solo saldi > 0 -
// usato dal form Consegna (asta_fisica, 2026-09-25 sessione 5) per far
// scegliere all'operatore l'ubicazione di ORIGINE reale invece di indovinarla
// (vedi nota su consegnaLotto in pubblicazione-queries.ts: un sku puo' essere
// splittato su piu' ubicazioni/proprieta', nessun automatismo qui).
export async function getSaldiSkuPerUbicazione(skuId: number) {
  return db
    .select({
      ubicazioneId: movimentiMagazzino.ubicazioneId,
      ubicazioneNome: ubicazioni.nome,
      proprieta: movimentiMagazzino.proprieta,
      saldo: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
    })
    .from(movimentiMagazzino)
    .innerJoin(ubicazioni, eq(movimentiMagazzino.ubicazioneId, ubicazioni.id))
    .where(eq(movimentiMagazzino.skuId, skuId))
    .groupBy(movimentiMagazzino.ubicazioneId, ubicazioni.nome, movimentiMagazzino.proprieta)
    .having(sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0) > 0`)
    .orderBy(asc(ubicazioni.nome));
}

export async function getMovimentiSku(skuId: number) {
  return db
    .select({
      id: movimentiMagazzino.id,
      proprieta: movimentiMagazzino.proprieta,
      ubicazione: ubicazioni.nome,
      causale: movimentiMagazzino.causale,
      quantitaDelta: movimentiMagazzino.quantitaDelta,
      note: movimentiMagazzino.note,
      createdAt: movimentiMagazzino.createdAt,
    })
    .from(movimentiMagazzino)
    .innerJoin(ubicazioni, eq(movimentiMagazzino.ubicazioneId, ubicazioni.id))
    .where(eq(movimentiMagazzino.skuId, skuId))
    .orderBy(desc(movimentiMagazzino.createdAt));
}
