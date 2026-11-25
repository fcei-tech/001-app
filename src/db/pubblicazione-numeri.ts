import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { batchLotti, batchPubblicazione, canali, esposizioneCanale, sku } from "./schema";
import { getBaseSku } from "./esposizione-queries";
import { convertiOverride, statoLottoIniziale } from "@/lib/batch-conversione";

// Numeri per i tasti della pagina Pubblicazione (calcolo live).
// Portali statici: esposti (pezzi online sul portale) su disponibili (giacenza > 0, non bloccati).
// Aste: costo (valore di carico) e riserva dei lotti che sono DAVVERO alla casa:
// online = batch 'Inviato' (stato pubblicato); fisiche = lotti 'Consegnati' (consegnatoAt).
// Chi e' solo in preparazione/pronto/accettato ma non ancora partito non conta.
export type NumeriVetrina = { tipo: "vetrina"; esposti: number; disponibili: number };
export type NumeriAsta = { tipo: "asta"; lotti: number; costo: number; riserva: number; costoMancanti: number };
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
        consegnatoAt: batchLotti.consegnatoAt,
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
      risultato.set(c.id, { tipo: "asta", lotti: 0, costo: 0, riserva: 0, costoMancanti: 0 });
    }
  }

  for (const l of lotti) {
    const n = risultato.get(l.canaleId);
    if (!n || n.tipo !== "asta") continue;
    // Online: solo batch Inviati (pubblicato). Fisiche: solo lotti Consegnati alla casa.
    const conta = l.tipoCanale === "asta_fisica" ? l.consegnatoAt !== null : l.statoBatch === "pubblicato";
    if (!conta) continue;
    const ov = (l.override ?? {}) as Record<string, unknown>;
    const riservaSku = l.nomeCanale === "Bidspirit" ? l.riservaBidspirit ?? l.riservaCatawiki : l.riservaCatawiki;
    n.lotti += 1;
    n.riserva += num(ov.riservaProposta ?? ov.riserva ?? riservaSku);
    if (l.valoreCarico === null || l.valoreCarico === undefined || num(l.valoreCarico) === 0) n.costoMancanti += 1;
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

// Sposta un batch su un altro portale. Stesso tipo: cambia solo il portale (lotti,
// riserve e stato restano). Tipo diverso (asta online <-> fisica): il batch torna
// "In preparazione", niente snapshot, i lotti ripartono dallo stato iniziale del
// nuovo tipo e la riserva segue il lotto (vedi src/lib/batch-conversione.ts).
export async function spostaBatchSuCanale(batchId: number, canaleId: number) {
  const batch = await db.query.batchPubblicazione.findFirst({
    where: (b, { eq }) => eq(b.id, batchId),
    with: { canale: true, lotti: true },
  });
  const dest = await db.query.canali.findFirst({ where: (c, { eq }) => eq(c.id, canaleId) });
  if (!batch || !dest) throw new Error("Batch o portale non trovato");
  if (batch.canale.tipo === dest.tipo) {
    await db.update(batchPubblicazione).set({ canaleId, updatedAt: new Date() }).where(eq(batchPubblicazione.id, batchId));
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(batchPubblicazione)
      .set({ canaleId, stato: "bozza", snapshot: null, confermatoAt: null, impostazioniBatch: {}, updatedAt: new Date() })
      .where(eq(batchPubblicazione.id, batchId));
    for (const l of batch.lotti) {
      await tx
        .update(batchLotti)
        .set({
          statoRiga: statoLottoIniziale(dest.tipo),
          override: convertiOverride(l.override, batch.canale.tipo, dest.tipo),
        })
        .where(eq(batchLotti.id, l.id));
    }
  });
}

// Sku "esposti": in vetrina con almeno un pezzo su un portale statico attivo.
export async function getSkuEspostiIds(): Promise<Set<number>> {
  const righe = await db
    .select({ skuId: esposizioneCanale.skuId, quantita: esposizioneCanale.quantitaCaricata })
    .from(esposizioneCanale)
    .innerJoin(canali, eq(canali.id, esposizioneCanale.canaleId))
    .where(and(eq(esposizioneCanale.inVetrina, true), eq(canali.attivo, true), eq(canali.tipo, "statico")));
  return new Set(righe.filter((r) => r.quantita > 0).map((r) => r.skuId));
}
