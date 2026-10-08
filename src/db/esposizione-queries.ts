import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { impegnatoSql } from "./queries";
import { bloccoSkuCanale, canali, esposizioneCanale, movimentiMagazzino, sku } from "./schema";
import {
  disponibileLibero,
  quantitaDaCaricare,
  type Annullabile,
  type ModificaBlocco,
  type ModificaEsposizione,
  type RigaDaFare,
  type TipoDaFare,
} from "@/lib/esposizione";

// Registro "esposto" dei portali statici (2026-10-07). Tutto il calcolo e'
// fatto in memoria: ~1300 sku x pochi portali, nessun bisogno di SQL
// complesso. Regole (vedi src/lib/esposizione.ts e knowledge 09f):
//  - eleggibile su un portale = sku non bloccato in generale, non bloccato su
//    quel portale, codice diverso da IGNORA
//  - disponibile libero = totale a magazzino - impegnato nelle aste
//  - quantita' target = fascia sul disponibile libero (Subito: sempre 1)
//  - DA AGGIUNGERE: target > 0 e nulla caricato ("nuovo" se mai caricato,
//    "tornato" se era stato rimosso)
//  - DA TOGLIERE: caricato > 0 e target = 0 (esaurito o bloccato)
//  - DA ABBASSARE: caricato > disponibile libero (rischio di vendere cio'
//    che non c'e'). Gli aumenti non vengono mai segnalati.

export type CanaleStatico = typeof canali.$inferSelect;

async function getCanaliStaticiAttivi(): Promise<CanaleStatico[]> {
  return db.query.canali.findMany({
    where: (c, { and: e, eq: uguale }) => e(uguale(c.tipo, "statico"), uguale(c.attivo, true)),
    orderBy: (c, { asc }) => asc(c.nome),
  });
}

export async function getCanaliStatici(): Promise<CanaleStatico[]> {
  return getCanaliStaticiAttivi();
}

export async function getBaseSku() {
  return db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      bloccatoVendita: sku.bloccatoVendita,
      disponibile: sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
      impegnato: impegnatoSql().mapWith(Number),
    })
    .from(sku)
    .leftJoin(movimentiMagazzino, eq(movimentiMagazzino.skuId, sku.id))
    .groupBy(sku.id);
}

export async function calcolaDaFare(): Promise<{
  canali: CanaleStatico[];
  righe: Map<number, RigaDaFare[]>;
}> {
  const [elenco, base, esposti, blocchi] = await Promise.all([
    getCanaliStaticiAttivi(),
    getBaseSku(),
    db.select().from(esposizioneCanale),
    db.select().from(bloccoSkuCanale),
  ]);

  const espostoMap = new Map<string, number>();
  for (const e of esposti) espostoMap.set(`${e.skuId}:${e.canaleId}`, e.quantitaCaricata);
  const bloccoSet = new Set(blocchi.map((b) => `${b.skuId}:${b.canaleId}`));

  const righe = new Map<number, RigaDaFare[]>();
  for (const c of elenco) {
    const lista: RigaDaFare[] = [];
    for (const s of base) {
      if (s.skuCode === "IGNORA") continue;
      const chiave = `${s.id}:${c.id}`;
      const haRiga = espostoMap.has(chiave);
      const caricata = espostoMap.get(chiave) ?? 0;
      const bloccatoQui = s.bloccatoVendita || bloccoSet.has(chiave);
      const libero = disponibileLibero(s.disponibile, s.impegnato);
      const target = bloccatoQui ? 0 : quantitaDaCaricare(libero, c.impostazioni);
      const comune = {
        skuId: s.id,
        skuCode: s.skuCode,
        artista: s.artista,
        opera: s.opera,
        quantitaCaricata: caricata,
        disponibileLibero: libero,
        quantitaTarget: target,
      };
      if (caricata === 0) {
        if (target > 0) {
          lista.push({ ...comune, tipo: "aggiungere", motivo: haRiga ? "tornato" : "nuovo" });
        }
      } else if (target === 0) {
        lista.push({ ...comune, tipo: "togliere", motivo: bloccatoQui ? "bloccato" : "esaurito" });
      } else if (caricata > libero) {
        lista.push({ ...comune, tipo: "abbassare", motivo: "abbassare" });
      }
    }
    lista.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
    righe.set(c.id, lista);
  }
  return { canali: elenco, righe };
}

export async function getDaFareCanale(canaleId: number): Promise<RigaDaFare[]> {
  const { righe } = await calcolaDaFare();
  return righe.get(canaleId) ?? [];
}

export type DaSistemare = { canaleId: number; portale: string; tipo: TipoDaFare };

// Per il Magazzino: per ogni sku, su quali portali c'e' qualcosa da sistemare.
export async function getDaSistemarePerSku(): Promise<Record<number, DaSistemare[]>> {
  const { canali: elenco, righe } = await calcolaDaFare();
  const nomi = new Map(elenco.map((c) => [c.id, c.nome]));
  const out: Record<number, DaSistemare[]> = {};
  for (const [canaleId, lista] of righe) {
    for (const r of lista) {
      (out[r.skuId] ??= []).push({ canaleId, portale: nomi.get(canaleId) ?? "", tipo: r.tipo });
    }
  }
  return out;
}

// Conferma: applica SOLO agli sku che sono ancora davvero in quella lista
// (i dati possono essere cambiati dopo il caricamento della pagina).
// Restituisce anche lo stato prima/dopo per l'Annulla.
export async function confermaDaFare(
  canaleId: number,
  tipo: TipoDaFare,
  skuIds: number[]
): Promise<{ n: number; annullabile?: Annullabile }> {
  if (skuIds.length === 0) return { n: 0 };
  const lista = (await getDaFareCanale(canaleId)).filter(
    (r) => r.tipo === tipo && skuIds.includes(r.skuId)
  );
  if (lista.length === 0) return { n: 0 };
  const modifiche: ModificaEsposizione[] = [];
  await db.transaction(async (tx) => {
    const prima = await tx
      .select()
      .from(esposizioneCanale)
      .where(and(eq(esposizioneCanale.canaleId, canaleId), inArray(esposizioneCanale.skuId, lista.map((r) => r.skuId))));
    const primaMap = new Map(prima.map((e) => [e.skuId, e.quantitaCaricata]));
    for (const r of lista) {
      const quantita = tipo === "togliere" ? 0 : r.quantitaTarget;
      await tx
        .insert(esposizioneCanale)
        .values({ skuId: r.skuId, canaleId, quantitaCaricata: quantita })
        .onConflictDoUpdate({
          target: [esposizioneCanale.skuId, esposizioneCanale.canaleId],
          set: { quantitaCaricata: quantita, aggiornatoAt: new Date() },
        });
      modifiche.push({ skuId: r.skuId, prima: primaMap.has(r.skuId) ? primaMap.get(r.skuId)! : null, dopo: quantita });
    }
  });
  return { n: lista.length, annullabile: { tipo: "esposizione", canaleId, modifiche } };
}

export async function impostaBlocco(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean
): Promise<{ n: number; annullabile?: Annullabile }> {
  if (skuIds.length === 0) return { n: 0 };
  const modifiche: ModificaBlocco[] = [];
  await db.transaction(async (tx) => {
    const esistenti = await tx
      .select()
      .from(bloccoSkuCanale)
      .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, skuIds)));
    const eraBloccato = new Set(esistenti.map((b) => b.skuId));
    for (const id of skuIds) {
      if (eraBloccato.has(id) !== bloccato) modifiche.push({ skuId: id, prima: eraBloccato.has(id), dopo: bloccato });
    }
    if (bloccato) {
      await tx.insert(bloccoSkuCanale).values(skuIds.map((skuId) => ({ skuId, canaleId }))).onConflictDoNothing();
    } else {
      await tx
        .delete(bloccoSkuCanale)
        .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, skuIds)));
    }
  });
  return {
    n: skuIds.length,
    annullabile: modifiche.length ? { tipo: "blocco", canaleId, modifiche } : undefined,
  };
}

// Annulla l'ultima operazione: tutto o niente. Rifiutato se uno degli sku
// non e' piu' nello stato scritto dall'operazione (qualcuno l'ha cambiato).
export async function annullaModifiche(a: Annullabile): Promise<{ ok: boolean; errore?: string }> {
  const { canaleId } = a;
  const ids = a.modifiche.map((m) => m.skuId);
  if (ids.length === 0) return { ok: true };
  let errore: string | undefined;
  await db.transaction(async (tx) => {
    if (a.tipo === "esposizione") {
      const correnti = await tx
        .select()
        .from(esposizioneCanale)
        .where(and(eq(esposizioneCanale.canaleId, canaleId), inArray(esposizioneCanale.skuId, ids)));
      const mappa = new Map(correnti.map((e) => [e.skuId, e.quantitaCaricata]));
      if (a.modifiche.some((m) => mappa.get(m.skuId) !== m.dopo)) {
        errore = "Nel frattempo qualche sku e' stato cambiato: non annullo per non sovrascrivere.";
        return;
      }
      for (const m of a.modifiche) {
        if (m.prima === null) {
          await tx.delete(esposizioneCanale).where(and(eq(esposizioneCanale.canaleId, canaleId), eq(esposizioneCanale.skuId, m.skuId)));
        } else {
          await tx
            .update(esposizioneCanale)
            .set({ quantitaCaricata: m.prima, aggiornatoAt: new Date() })
            .where(and(eq(esposizioneCanale.canaleId, canaleId), eq(esposizioneCanale.skuId, m.skuId)));
        }
      }
    } else {
      const correnti = await tx
        .select()
        .from(bloccoSkuCanale)
        .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, ids)));
      const bloccati = new Set(correnti.map((b) => b.skuId));
      if (a.modifiche.some((m) => bloccati.has(m.skuId) !== m.dopo)) {
        errore = "Nel frattempo qualche sku e' stato cambiato: non annullo per non sovrascrivere.";
        return;
      }
      const daBloccare = a.modifiche.filter((m) => m.prima).map((m) => m.skuId);
      const daSbloccare = a.modifiche.filter((m) => !m.prima).map((m) => m.skuId);
      if (daBloccare.length) await tx.insert(bloccoSkuCanale).values(daBloccare.map((skuId) => ({ skuId, canaleId }))).onConflictDoNothing();
      if (daSbloccare.length) {
        await tx.delete(bloccoSkuCanale).where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, daSbloccare)));
      }
    }
  });
  return errore ? { ok: false, errore } : { ok: true };
}

export type StatoPortaleSku = {
  canaleId: number;
  portale: string;
  quantitaCaricata: number;
  bloccato: boolean;
};

// Per la scheda sku: situazione dello sku su ogni portale statico attivo.
export async function getStatoPortaliSku(skuId: number): Promise<StatoPortaleSku[]> {
  const [elenco, esposti, blocchi] = await Promise.all([
    getCanaliStaticiAttivi(),
    db.select().from(esposizioneCanale).where(eq(esposizioneCanale.skuId, skuId)),
    db.select().from(bloccoSkuCanale).where(eq(bloccoSkuCanale.skuId, skuId)),
  ]);
  return elenco.map((c) => ({
    canaleId: c.id,
    portale: c.nome,
    quantitaCaricata: esposti.find((e) => e.canaleId === c.id)?.quantitaCaricata ?? 0,
    bloccato: blocchi.some((b) => b.canaleId === c.id),
  }));
}
