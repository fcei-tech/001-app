import { db } from "@/db";
import { fotoSku, sku } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { RigaFotoMaster } from "./foto-import";

export type OperazioneFotoSku = { skuId: number; skuCode: string; artista: string; opera: string; urls: string[] };
export type SkuNonTrovato = { skuCode: string; nUrl: number };
export type SkuGiaConFoto = { skuCode: string; nFotoAttuali: number; nUrlMaster: number };
export type AnteprimaImportFoto = {
  daImportare: OperazioneFotoSku[];
  skuNonTrovati: SkuNonTrovato[];
  skuGiaConFoto: SkuGiaConFoto[];
  righeConUrlNelMasterCount: number;
};

export async function calcolaAnteprimaFoto(righe: RigaFotoMaster[]): Promise<AnteprimaImportFoto> {
  const tuttiSku = await db.select({ id: sku.id, skuCode: sku.skuCode, artista: sku.artista, opera: sku.opera }).from(sku);
  const mappaSku = new Map(tuttiSku.map((s) => [s.skuCode, s]));

  const conteggiFoto = await db
    .select({ skuId: fotoSku.skuId, totale: sql<number>`count(*)`.mapWith(Number) })
    .from(fotoSku)
    .groupBy(fotoSku.skuId);
  const mappaConteggioFoto = new Map(conteggiFoto.map((c) => [c.skuId, c.totale]));

  const daImportare: OperazioneFotoSku[] = [];
  const skuNonTrovati: SkuNonTrovato[] = [];
  const skuGiaConFoto: SkuGiaConFoto[] = [];

  for (const r of righe) {
    const esistente = mappaSku.get(r.skuCode);
    if (!esistente) { skuNonTrovati.push({ skuCode: r.skuCode, nUrl: r.urls.length }); continue; }
    const fotoAttuali = mappaConteggioFoto.get(esistente.id) ?? 0;
    if (fotoAttuali > 0) { skuGiaConFoto.push({ skuCode: r.skuCode, nFotoAttuali: fotoAttuali, nUrlMaster: r.urls.length }); continue; }
    daImportare.push({ skuId: esistente.id, skuCode: r.skuCode, artista: esistente.artista, opera: esistente.opera, urls: r.urls });
  }

  return { daImportare, skuNonTrovati, skuGiaConFoto, righeConUrlNelMasterCount: righe.length };
}

export async function eseguiImportFoto(anteprima: AnteprimaImportFoto): Promise<{ skuConFotoAggiunte: number; fotoInserite: number }> {
  let fotoInserite = 0;
  await db.transaction(async (tx) => {
    for (const op of anteprima.daImportare) {
      let ordine = 0;
      for (const url of op.urls) {
        await tx.insert(fotoSku).values({ skuId: op.skuId, url, ordine });
        ordine += 1;
        fotoInserite += 1;
      }
    }
  });
  return { skuConFotoAggiunte: anteprima.daImportare.length, fotoInserite };
}
