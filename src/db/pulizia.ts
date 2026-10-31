import { inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { batchLotti, batchPubblicazione, bloccoSkuCanale, esposizioneCanale, movimentiMagazzino, silenziamentiErrore, sku, storicoPortale, overridePortale, filePortale, skuTag } from "./schema";

// Pulizia dati prima del go-live. Ogni voce e' scelta a parte; le foto
// (foto_sku) e le tabelle di base (proprietari, depositi, portali, tipi,
// impostazioni) non vengono MAI toccate. Gli sku non vengono cancellati se
// hanno foto, movimenti o lotti in un batch che resta.

export type SceltaPulizia = {
  movimenti: boolean; // tutto il registro dei movimenti (le giacenze tornano a zero)
  batch: boolean; // batch di pubblicazione e relativi lotti
  silenziamenti: boolean; // errori di validazione silenziati
  caricato: boolean; // registro "cosa e' caricato" dei portali statici
  blocchi: boolean; // blocchi per sku+portale
  anagrafica: boolean; // azzera i dati degli sku (prezzi, note, tag, misure...)
  skuSenzaFoto: boolean; // elimina gli sku senza foto (e senza movimenti/lotti rimasti)
};

export type AnteprimaPulizia = {
  movimenti: number;
  pezziAttuali: number;
  batch: number;
  lotti: number;
  silenziamenti: number;
  caricato: number;
  blocchi: number;
  skuTotali: number;
  skuConFoto: number;
  skuEliminabili: number;
  skuNonEliminabiliPerche: { movimentiRimasti: number; lottiRimasti: number };
  // Righe di blocchi / "caricato" che spariscono perche' legate agli sku
  // eliminati (solo se la voce "elimina sku" e' scelta).
  blocchiDegliSkuEliminati: number;
  caricatoDegliSkuEliminati: number;
  foto: number;
};

async function conta(q: ReturnType<typeof sql>): Promise<number> {
  const r = await db.execute(q);
  const rows = (r as unknown as { rows?: Record<string, unknown>[] }).rows ?? (r as unknown as Record<string, unknown>[]);
  return Number(rows[0]?.n ?? 0);
}

// Id degli sku che la pulizia eliminerebbe con questa scelta.
async function skuEliminabili(s: SceltaPulizia): Promise<number[]> {
  if (!s.skuSenzaFoto) return [];
  const senzaMov = s.movimenti ? sql`true` : sql`not exists (select 1 from movimenti_magazzino m where m.sku_id = s.id)`;
  const senzaLotti = s.batch ? sql`true` : sql`not exists (select 1 from batch_lotti b where b.sku_id = s.id)`;
  const r = await db.execute(
    sql`select s.id as id from sku s where not exists (select 1 from foto_sku f where f.sku_id = s.id) and ${senzaMov} and ${senzaLotti}`
  );
  const rows = (r as unknown as { rows?: { id: number }[] }).rows ?? (r as unknown as { id: number }[]);
  return rows.map((x) => Number(x.id));
}

export async function anteprimaPulizia(s: SceltaPulizia): Promise<AnteprimaPulizia> {
  const eliminabili = await skuEliminabili(s);
  const [movimenti, pezziAttuali, batch, lotti, silenziamenti, caricato, blocchi, skuTotali, skuConFoto, foto, movRimasti, lottiRimasti] =
    await Promise.all([
      conta(sql`select count(*) as n from movimenti_magazzino`),
      conta(sql`select coalesce(sum(quantita_delta),0) as n from movimenti_magazzino`),
      conta(sql`select count(*) as n from batch_pubblicazione`),
      conta(sql`select count(*) as n from batch_lotti`),
      conta(sql`select count(*) as n from silenziamenti_errore`),
      conta(sql`select count(*) as n from esposizione_canale`),
      conta(sql`select count(*) as n from blocco_sku_canale`),
      conta(sql`select count(*) as n from sku`),
      conta(sql`select count(distinct sku_id) as n from foto_sku`),
      conta(sql`select count(*) as n from foto_sku`),
      s.movimenti ? Promise.resolve(0) : conta(sql`select count(distinct sku_id) as n from movimenti_magazzino`),
      s.batch ? Promise.resolve(0) : conta(sql`select count(distinct sku_id) as n from batch_lotti`),
    ]);
  const listaId = eliminabili.length > 0 ? sql.join(eliminabili.map((i) => sql`${i}`), sql`, `) : null;
  const [blocchiDegliSkuEliminati, caricatoDegliSkuEliminati] = listaId
    ? await Promise.all([
        conta(sql`select count(*) as n from blocco_sku_canale where sku_id in (${listaId})`),
        conta(sql`select count(*) as n from esposizione_canale where sku_id in (${listaId})`),
      ])
    : [0, 0];
  return {
    movimenti,
    pezziAttuali,
    batch,
    lotti,
    silenziamenti,
    caricato,
    blocchi,
    skuTotali,
    skuConFoto,
    skuEliminabili: eliminabili.length,
    skuNonEliminabiliPerche: { movimentiRimasti: movRimasti, lottiRimasti },
    blocchiDegliSkuEliminati,
    caricatoDegliSkuEliminati,
    foto,
  };
}

export type EsitoPulizia = {
  movimenti: number;
  batch: number;
  silenziamenti: number;
  caricato: number;
  blocchi: number;
  skuAzzerati: number;
  skuEliminati: number;
};

export async function eseguiPulizia(s: SceltaPulizia): Promise<EsitoPulizia> {
  const esito: EsitoPulizia = { movimenti: 0, batch: 0, silenziamenti: 0, caricato: 0, blocchi: 0, skuAzzerati: 0, skuEliminati: 0 };
  await db.transaction(async (tx) => {
    if (s.movimenti) {
      const r = await tx.delete(movimentiMagazzino).returning();
      esito.movimenti = r.length;
    }
    if (s.batch) {
      await tx.delete(batchLotti);
      const r = await tx.delete(batchPubblicazione).returning();
      esito.batch = r.length;
    }
    if (s.silenziamenti) {
      const r = await tx.delete(silenziamentiErrore).returning();
      esito.silenziamenti = r.length;
    }
    if (s.caricato) {
      await tx.delete(storicoPortale);
      await tx.delete(filePortale);
      await tx.delete(overridePortale);
      const r = await tx.delete(esposizioneCanale).returning();
      esito.caricato = r.length;
    }
    if (s.blocchi) {
      const r = await tx.delete(bloccoSkuCanale).returning();
      esito.blocchi = r.length;
    }

    // Eliminazione sku: calcolata DENTRO la transazione, dopo le cancellazioni
    // sopra, con le stesse regole dell'anteprima.
    if (s.skuSenzaFoto) {
      const r = await tx.execute(
        sql`select s.id as id from sku s where not exists (select 1 from foto_sku f where f.sku_id = s.id) and not exists (select 1 from movimenti_magazzino m where m.sku_id = s.id) and not exists (select 1 from batch_lotti b where b.sku_id = s.id)`
      );
      const rows = (r as unknown as { rows?: { id: number }[] }).rows ?? (r as unknown as { id: number }[]);
      const ids = rows.map((x) => Number(x.id));
      for (let i = 0; i < ids.length; i += 1000) {
        const parte = ids.slice(i, i + 1000);
        await tx.delete(storicoPortale).where(inArray(storicoPortale.skuId, parte));
        await tx.delete(overridePortale).where(inArray(overridePortale.skuId, parte));
        await tx.delete(esposizioneCanale).where(inArray(esposizioneCanale.skuId, parte));
        await tx.delete(bloccoSkuCanale).where(inArray(bloccoSkuCanale.skuId, parte));
        await tx.delete(silenziamentiErrore).where(inArray(silenziamentiErrore.skuId, parte));
        await tx.delete(skuTag).where(inArray(skuTag.skuId, parte));
        await tx.delete(sku).where(inArray(sku.id, parte));
      }
      esito.skuEliminati = ids.length;
    }

    if (s.anagrafica) {
      const r = await tx
        .update(sku)
        .set({
          larghezza: null,
          altezza: null,
          supporto: null,
          anno: null,
          tag: null,
          note: null,
          valoreCarico: null,
          prezzoEbay: null,
          prezzoCatawiki: null,
          riservaCatawiki: null,
          condizione: "A-",
          bloccatoVendita: false,
          updatedAt: new Date(),
        })
        .returning();
      esito.skuAzzerati = r.length;
    }
  });
  return esito;
}
