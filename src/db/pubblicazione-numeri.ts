import { eq } from "drizzle-orm";
import { db } from "./index";
import { batchLotti, batchPubblicazione, canali, esposizioneCanale, sku } from "./schema";
import { getBaseSku } from "./esposizione-queries";

// Numeri per i tasti della pagina Pubblicazione (calcolo live).
// Portali statici: esposti (pezzi online sul portale) su disponibili (giacenza > 0, non bloccati).
// Aste: costo (valore di carico) e riserva dei lotti nei batch del portale.
export type NumeriVetrina = { tipo: "vetrina"; esposti: number; disponibili: number };
export type NumeriAsta = { tipo: "asta"; lotti: number; costo: number; riserva: number; costoIncompleto: boolean };
export type NumeriCanale = NumeriVetrina | NumeriAsta;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function getNumeriPubblicazione(): Promise<Map<number, NumeriCanale>> {
  const [elenco, base, esposti, lotti] = await Promise.all([
    db.select().from(canali).where(eq(canali.attivo, true)),
    getBaseSku(),
    db.select().from(esposizioneCanale).where(eq(esposizioneCanale.inVetrina, true)),
    db
      .select({
        canaleId: batchPubblicazione.canaleId,
        tipoCanale: canali.tipo,
        nomeCanale: canali.nome,
        statoBatch: batchPubblicazione.stato,
        statoRiga: batchLotti.statoRiga,
        override: batchLotti.override,
        valoreCarico: sku.valoreCarico,
        riservaCatawiki: sku.riservaCatawiki,
        riservaBidspirit: sku.riservaBidspirit,
      })
      .from(batchLotti)
      .innerJoin(batchPubblicazione, eq(batchLotti.batchId, batchPubblicazione.id))
      .innerJoin(canali, eq(batchPubblicazione.canaleId, canali.id))
      .innerJoin(sku, eq(batchLotti.skuId, sku.id)),
  ]);

  const disponibiliIds = new Set(
    base.filter((s) => s.skuCode !== "IGNORA" && !s.bloccatoVendita && s.disponibile > 0).map((s) => s.id)
  );
  const risultato = new Map<number, NumeriCanale>();

  for (const c of elenco) {
    if (c.tipo === "statico") {
      const n = esposti.filter((e) => e.canaleId === c.id && e.quantitaCaricata > 0 && disponibiliIds.has(e.skuId)).length;
      risultato.set(c.id, { tipo: "vetrina", esposti: n, disponibili: disponibiliIds.size });
    } else {
      risultato.set(c.id, { tipo: "asta", lotti: 0, costo: 0, riserva: 0, costoIncompleto: false });
    }
  }

  for (const l of lotti) {
    const n = risultato.get(l.canaleId);
    if (!n || n.tipo !== "asta") continue;
    // Online: batch confermati/pubblicati. Fisiche: lotti accettati (anche in bozza).
    const conta = l.tipoCanale === "asta_fisica" ? l.statoRiga === "accettato" : l.statoBatch !== "bozza";
    if (!conta) continue;
    const ov = (l.override ?? {}) as Record<string, unknown>;
    const riservaSku = l.nomeCanale === "Bidspirit" ? l.riservaBidspirit ?? l.riservaCatawiki : l.riservaCatawiki;
    n.lotti += 1;
    n.riserva += num(ov.riservaProposta ?? ov.riserva ?? riservaSku);
    if (l.valoreCarico === null || l.valoreCarico === undefined || num(l.valoreCarico) === 0) n.costoIncompleto = true;
    n.costo += num(l.valoreCarico);
  }
  return risultato;
}

// Lotti consegnati di un batch (serve a bloccare "Sposta").
export async function contaLottiConsegnati(batchId: number): Promise<number> {
  const r = await db
    .select({ id: batchLotti.id, consegnatoAt: batchLotti.consegnatoAt })
    .from(batchLotti)
    .where(eq(batchLotti.batchId, batchId));
  return r.filter((x) => x.consegnatoAt !== null).length;
}

export async function spostaBatchSuCanale(batchId: number, canaleId: number) {
  await db.update(batchPubblicazione).set({ canaleId, updatedAt: new Date() }).where(eq(batchPubblicazione.id, batchId));
}
