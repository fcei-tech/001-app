import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { movimentiMagazzino, proprietari, sku } from "@/db/schema";
import type { RigaStock } from "@/lib/excel-righe-stock";

export type SkuDaRiportare = { id: number; skuCode: string; artista: string; opera: string; righe: RigaStock[] };

// Sku non ancora riportati su Excel, con una riga per foglio: azienda -> FP,
// soci -> CV (stessa regola dell'import). I "terzo" e le giacenze a zero non
// hanno un foglio: lo sku esce in "senzaFoglio" e NON viene marcato.
export async function getSkuDaRiportare(): Promise<{ voci: SkuDaRiportare[]; senzaFoglio: { id: number; skuCode: string; artista: string; opera: string }[] }> {
  const nuovi = await db.select().from(sku).where(isNull(sku.riportatoExcelAt)).orderBy(sku.skuCode);
  if (nuovi.length === 0) return { voci: [], senzaFoglio: [] };
  const somme = await db
    .select({
      skuId: movimentiMagazzino.skuId,
      tipo: proprietari.tipo,
      totale: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)::int`.mapWith(Number),
    })
    .from(movimentiMagazzino)
    .innerJoin(proprietari, eq(movimentiMagazzino.proprietarioId, proprietari.id))
    .where(inArray(movimentiMagazzino.skuId, nuovi.map((s) => s.id)))
    .groupBy(movimentiMagazzino.skuId, proprietari.tipo);
  const qta = new Map<string, number>();
  for (const s of somme) qta.set(`${s.skuId}:${s.tipo}`, s.totale);

  const voci: SkuDaRiportare[] = [];
  const senzaFoglio: { id: number; skuCode: string; artista: string; opera: string }[] = [];
  for (const s of nuovi) {
    const righe: RigaStock[] = [];
    for (const [foglio, tipo] of [["FP", "azienda"], ["CV", "soci"]] as const) {
      const q = qta.get(`${s.id}:${tipo}`) ?? 0;
      if (q <= 0) continue;
      righe.push({
        foglio,
        skuCode: s.skuCode,
        quantita: q,
        artista: s.artista,
        opera: s.opera,
        larghezza: s.larghezza,
        altezza: s.altezza,
        supporto: s.supporto,
        anno: s.anno,
        note: s.note,
        valoreCarico: s.valoreCarico,
        prezzoCatawiki: s.prezzoCatawiki,
        riservaCatawiki: s.riservaCatawiki,
        prezzoEbay: s.prezzoEbay,
        prezzoSubito: s.prezzoSubito,
      });
    }
    if (righe.length === 0) senzaFoglio.push({ id: s.id, skuCode: s.skuCode, artista: s.artista, opera: s.opera });
    else voci.push({ id: s.id, skuCode: s.skuCode, artista: s.artista, opera: s.opera, righe });
  }
  return { voci, senzaFoglio };
}

export async function segnaRiportati(skuIds: number[]): Promise<number> {
  if (!skuIds.length) return 0;
  const r = await db
    .update(sku)
    .set({ riportatoExcelAt: new Date() })
    .where(and(inArray(sku.id, skuIds), isNull(sku.riportatoExcelAt)))
    .returning();
  return r.length;
}
