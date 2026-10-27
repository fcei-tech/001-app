import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { impegnatoSql } from "./queries";
import { bloccoSkuCanale, canali, esposizioneCanale, movimentiMagazzino, sku, storicoPortale } from "./schema";
import { type Annullabile, type ModificaBlocco } from "@/lib/esposizione";

// Base dati dei portali statici: elenco canali, blocchi/ritiri, storico.
// La tabella unica per portale (stati, celle, file) sta in portale-queries.ts;
// le regole pure in src/lib/tabella-portale.ts.

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

// Storico operazioni (2026-10-20): una riga per sku. Si scrive DENTRO la
// stessa transazione dell'operazione, cosi' storico e stato non divergono.
type VoceStorico = { skuId: number; azione: string; dettaglio?: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function scriviStorico(tx: Tx, canaleId: number, voci: VoceStorico[]) {
  for (let i = 0; i < voci.length; i += 500) {
    await tx
      .insert(storicoPortale)
      .values(voci.slice(i, i + 500).map((v) => ({ canaleId, skuId: v.skuId, azione: v.azione, dettaglio: v.dettaglio ?? null })));
  }
}

export async function getBaseSku() {
  return db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      bloccatoVendita: sku.bloccatoVendita,
      prezzoEbay: sku.prezzoEbay,
      disponibile: sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
      impegnato: impegnatoSql().mapWith(Number),
    })
    .from(sku)
    .leftJoin(movimentiMagazzino, eq(movimentiMagazzino.skuId, sku.id))
    .groupBy(sku.id);
}

// motivo: "ritiro" per "Ritira da…", "blocco" per "non pubblicare mai qui".
// Se lo sku e' gia' bloccato/ritirato il motivo esistente NON cambia; togliere
// il blocco (bloccato = false) vale per entrambi i motivi.
export async function impostaBlocco(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean,
  motivo: "blocco" | "ritiro" = "blocco"
): Promise<{ n: number; annullabile?: Annullabile }> {
  if (skuIds.length === 0) return { n: 0 };
  const modifiche: ModificaBlocco[] = [];
  await db.transaction(async (tx) => {
    const esistenti = await tx
      .select()
      .from(bloccoSkuCanale)
      .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, skuIds)));
    const eraBloccato = new Set(esistenti.map((b) => b.skuId));
    const motivoPrima = new Map(esistenti.map((b) => [b.skuId, b.motivo]));
    for (const id of skuIds) {
      if (eraBloccato.has(id) !== bloccato) {
        modifiche.push({ skuId: id, prima: eraBloccato.has(id), dopo: bloccato, motivoPrima: motivoPrima.get(id) });
      }
    }
    await scriviStorico(
      tx,
      canaleId,
      modifiche.map((m) => ({
        skuId: m.skuId,
        azione: m.dopo
          ? motivo === "ritiro" ? "ritirato" : "bloccato"
          : m.motivoPrima === "ritiro" ? "rimesso" : "sbloccato",
      }))
    );
    if (bloccato) {
      await tx.insert(bloccoSkuCanale).values(skuIds.map((skuId) => ({ skuId, canaleId, motivo }))).onConflictDoNothing();
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
          const ripristino: Partial<typeof esposizioneCanale.$inferInsert> = {
            quantitaCaricata: m.prima,
            aggiornatoAt: new Date(),
          };
          if (m.prezzoPrima !== undefined) {
            ripristino.prezzoCaricato = m.prezzoPrima === null ? null : m.prezzoPrima.toFixed(2);
          }
          await tx
            .update(esposizioneCanale)
            .set(ripristino)
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
      const daBloccareM = a.modifiche.filter((m) => m.prima);
      const daSbloccare = a.modifiche.filter((m) => !m.prima).map((m) => m.skuId);
      if (daBloccareM.length) {
        await tx
          .insert(bloccoSkuCanale)
          .values(daBloccareM.map((m) => ({ skuId: m.skuId, canaleId, motivo: m.motivoPrima ?? "blocco" })))
          .onConflictDoNothing();
      }
      if (daSbloccare.length) {
        await tx.delete(bloccoSkuCanale).where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, daSbloccare)));
      }
    }
    if (!errore) {
      await scriviStorico(tx, canaleId, ids.map((skuId) => ({ skuId, azione: "annullato", dettaglio: "operazione annullata" })));
    }
  });
  return errore ? { ok: false, errore } : { ok: true };
}

export type StatoPortaleSku = {
  canaleId: number;
  portale: string;
  quantitaCaricata: number;
  inVetrina: boolean;
  bloccato: boolean;
  ritirato: boolean; // bloccato con motivo "ritiro"
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
    quantitaCaricata: esposti.find((e) => e.canaleId === c.id && e.inVetrina)?.quantitaCaricata ?? 0,
    inVetrina: esposti.some((e) => e.canaleId === c.id && e.inVetrina),
    bloccato: blocchi.some((b) => b.canaleId === c.id),
    ritirato: blocchi.some((b) => b.canaleId === c.id && b.motivo === "ritiro"),
  }));
}

export type RigaRitirato = { skuId: number; skuCode: string; artista: string; opera: string; quantitaCaricata: number; inVetrina: boolean; ritiratoIl: Date };

// Sku ritirati da un portale con "Ritira da…" (per la lista "Ritirati" della
// pagina del portale, da cui si rimettono in vendita).
export async function getRitiratiCanale(canaleId: number): Promise<RigaRitirato[]> {
  const righe = await db
    .select({
      skuId: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      quantitaCaricata: sql<number>`case when ${esposizioneCanale.inVetrina} then ${esposizioneCanale.quantitaCaricata} else 0 end`.mapWith(Number),
      inVetrina: sql<boolean>`coalesce(${esposizioneCanale.inVetrina}, false)`.mapWith(Boolean),
      ritiratoIl: bloccoSkuCanale.createdAt,
    })
    .from(bloccoSkuCanale)
    .innerJoin(sku, eq(sku.id, bloccoSkuCanale.skuId))
    .leftJoin(
      esposizioneCanale,
      and(eq(esposizioneCanale.skuId, bloccoSkuCanale.skuId), eq(esposizioneCanale.canaleId, bloccoSkuCanale.canaleId))
    )
    .where(and(eq(bloccoSkuCanale.canaleId, canaleId), eq(bloccoSkuCanale.motivo, "ritiro")));
  return righe.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

// --- Storico ------------------------------------------------------------------
export type RigaStorico = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  azione: string;
  dettaglio: string | null;
  quando: Date;
};

export async function getStoricoCanale(canaleId: number, limite = 300): Promise<RigaStorico[]> {
  const righe = await db
    .select({
      id: storicoPortale.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      azione: storicoPortale.azione,
      dettaglio: storicoPortale.dettaglio,
      quando: storicoPortale.createdAt,
    })
    .from(storicoPortale)
    .innerJoin(sku, eq(sku.id, storicoPortale.skuId))
    .where(eq(storicoPortale.canaleId, canaleId))
    .orderBy(desc(storicoPortale.createdAt), desc(storicoPortale.id))
    .limit(limite);
  return righe;
}
