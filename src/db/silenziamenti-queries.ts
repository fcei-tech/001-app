// Query CRUD per silenziamenti_errore (modulo Pubblicazione, generazione
// output, 2026-09-28) - vedi commento su silenziamentiErrore in schema.ts
// per il design completo. Nessun "risolto" scritto qui: lo sblocco
// automatico e' calcolato al volo dal chiamante confrontando questi record
// con gli errori correnti di risolviBatchCatawiki (src/lib/catawiki-
// resolver.ts) - questo file espone solo lettura/scrittura grezza della
// tabella, mai una query che unisce le due cose.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { silenziamentiErrore, sku, canali } from "./schema";
import type { TipoErroreValidazione } from "@/lib/catawiki-resolver";

export type SilenziamentoConSku = {
  id: number;
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  canaleId: number;
  tipoErrore: string;
  note: string | null;
  createdAt: Date;
};

// Elenco per la pagina /pubblicazione/silenziamenti (e per il banner della
// pagina batch, che ne legge solo un sottoinsieme via getSilenziamentiComeMappa
// sotto) - join con sku per mostrare sku_code/artista/opera senza una query
// separata per riga.
export async function listaSilenziamentiPerCanale(canaleId: number): Promise<SilenziamentoConSku[]> {
  const righe = await db
    .select({
      id: silenziamentiErrore.id,
      skuId: silenziamentiErrore.skuId,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      canaleId: silenziamentiErrore.canaleId,
      tipoErrore: silenziamentiErrore.tipoErrore,
      note: silenziamentiErrore.note,
      createdAt: silenziamentiErrore.createdAt,
    })
    .from(silenziamentiErrore)
    .innerJoin(sku, eq(sku.id, silenziamentiErrore.skuId))
    .where(eq(silenziamentiErrore.canaleId, canaleId))
    .orderBy(silenziamentiErrore.createdAt);
  return righe;
}

// Elenco COMPLETO (tutti i canali) per la pagina dedicata
// /pubblicazione/silenziamenti - include anche i campi sku necessari a
// ricalcolare al volo se l'errore silenziato e' "risolto" (condizione/anno/
// prezzoCatawiki, vedi risolviLottoCatawiki - la pagina li usa con
// override:null e le impostazioni di default, dato che nessuno di questi 3
// controlli dipende da un batch specifico). Nessun filtro canale qui: oggi
// solo Catawiki produce silenziamenti, ma la tabella e' generica (chiave
// sku+canale+tipoErrore) - non vale la pena filtrare lato query per un
// singolo canale quando la pagina puo' mostrarli tutti raggruppati.
export type SilenziamentoCompleto = SilenziamentoConSku & {
  canaleNome: string;
  skuCondizione: string;
  skuAnno: string | null;
  skuPrezzoCatawiki: string | null;
};

export async function listaSilenziamentiTutti(): Promise<SilenziamentoCompleto[]> {
  return db
    .select({
      id: silenziamentiErrore.id,
      skuId: silenziamentiErrore.skuId,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      skuCondizione: sku.condizione,
      skuAnno: sku.anno,
      skuPrezzoCatawiki: sku.prezzoCatawiki,
      canaleId: silenziamentiErrore.canaleId,
      canaleNome: canali.nome,
      tipoErrore: silenziamentiErrore.tipoErrore,
      note: silenziamentiErrore.note,
      createdAt: silenziamentiErrore.createdAt,
    })
    .from(silenziamentiErrore)
    .innerJoin(sku, eq(sku.id, silenziamentiErrore.skuId))
    .innerJoin(canali, eq(canali.id, silenziamentiErrore.canaleId))
    .orderBy(desc(silenziamentiErrore.createdAt));
}

// Forma compatta per il banner della pagina batch: Map<skuId, Set<tipoErrore>>
// - permette al chiamante di filtrare in O(1) quali errori di una riga sono
// gia' silenziati senza rifare la join sopra per ogni render.
export async function getSilenziamentiComeMappa(
  canaleId: number
): Promise<Map<number, Set<string>>> {
  const righe = await db
    .select({ skuId: silenziamentiErrore.skuId, tipoErrore: silenziamentiErrore.tipoErrore })
    .from(silenziamentiErrore)
    .where(eq(silenziamentiErrore.canaleId, canaleId));
  const mappa = new Map<number, Set<string>>();
  for (const r of righe) {
    const set = mappa.get(r.skuId) ?? new Set<string>();
    set.add(r.tipoErrore);
    mappa.set(r.skuId, set);
  }
  return mappa;
}

// Crea un silenziamento sku+canale+tipoErrore - idempotente: nessun vincolo
// UNIQUE a livello DB (solo un indice per le letture, vedi schema.ts), quindi
// il controllo duplicati e' fatto qui in applicazione con un select prima
// dell'insert, stesso principio "niente race condition seria attesa in
// questo contesto" gia' in uso altrove nel modulo (form monoutente).
export async function silenziaErrore(dati: {
  skuId: number;
  canaleId: number;
  tipoErrore: TipoErroreValidazione;
  note?: string;
}) {
  const esistente = await db.query.silenziamentiErrore.findFirst({
    where: (s, { eq, and }) =>
      and(eq(s.skuId, dati.skuId), eq(s.canaleId, dati.canaleId), eq(s.tipoErrore, dati.tipoErrore)),
  });
  if (esistente) return esistente;

  const [nuovo] = await db
    .insert(silenziamentiErrore)
    .values({
      skuId: dati.skuId,
      canaleId: dati.canaleId,
      tipoErrore: dati.tipoErrore,
      note: dati.note?.trim() || null,
    })
    .returning();
  return nuovo;
}

// Riattivazione singola (bottone "Riattiva" per riga nella pagina dedicata).
export async function riattivaSilenziamento(id: number) {
  await db.delete(silenziamentiErrore).where(eq(silenziamentiErrore.id, id));
}

// Riattivazione/pulizia multipla - stesso DELETE usato sia dal bottone
// "Riattiva" con selezione multipla sia dal "Pulisci risolti" (che passa gli
// id calcolati come risolti dal chiamante) sia dall'effetto collaterale
// automatico dentro generaFileCatawikiAction (pulizia silenziamenti ormai
// non piu' necessari, perche' l'errore non si ripresenta piu' per quello
// sku). Nessuna query "quali sono risolti" qui dentro: quel calcolo vive nel
// chiamante, che ha gia' in mano risolviBatchCatawiki() per il batch corrente.
export async function riattivaSilenziamentiBulk(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(silenziamentiErrore).where(inArray(silenziamentiErrore.id, ids));
}

// Usata dall'effetto collaterale di pulizia in generaFileCatawikiAction:
// dato l'elenco (skuId, tipoErrore) ancora effettivamente in errore per
// QUESTO batch, elimina ogni silenziamento del canale che non e' piu' in
// quell'elenco (cioe' l'errore silenziato non si ripresenta piu' per quello
// sku - "risolto"). Non tocca silenziamenti di sku fuori da questo batch:
// la generazione di UN batch non deve ripulire lo stato di sku che non c'entrano.
export async function ripulisciSilenziamentiRisolti(
  canaleId: number,
  skuIdsNelBatch: number[],
  erroriAncoraPresenti: { skuId: number; tipoErrore: string }[]
): Promise<number> {
  if (skuIdsNelBatch.length === 0) return 0;

  const esistenti = await db
    .select({ id: silenziamentiErrore.id, skuId: silenziamentiErrore.skuId, tipoErrore: silenziamentiErrore.tipoErrore })
    .from(silenziamentiErrore)
    .where(
      and(eq(silenziamentiErrore.canaleId, canaleId), inArray(silenziamentiErrore.skuId, skuIdsNelBatch))
    );

  const chiaviAncoraPresenti = new Set(erroriAncoraPresenti.map((e) => `${e.skuId}:${e.tipoErrore}`));
  const daRipulire = esistenti
    .filter((s) => !chiaviAncoraPresenti.has(`${s.skuId}:${s.tipoErrore}`))
    .map((s) => s.id);

  await riattivaSilenziamentiBulk(daRipulire);
  return daRipulire.length;
}
