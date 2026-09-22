import { and, asc, desc, eq, exists, ilike, notExists, or, sql } from "drizzle-orm";
import { db } from "./index";
import { condizioneEnum, fotoSku, movimentiMagazzino, sku, tipiOggetto, ubicazioni } from "./schema";

export type RigaMagazzino = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  condizione: string;
  tipo: string;
  bloccatoVendita: boolean;
  prezzoEbay: string | null;
  quantitaDisponibile: number;
};

export type FiltriMagazzino = {
  ricerca?: string;
  tipoId?: number;
  condizione?: string;
  proprieta?: "FP" | "CV";
  bloccato?: "si" | "no";
  disponibilita?: "disponibile" | "esaurito";
  senzaFoto?: boolean;
};

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

  const having =
    filtri.disponibilita === "disponibile"
      ? sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0) > 0`
      : filtri.disponibilita === "esaurito"
        ? sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0) <= 0`
        : undefined;

  const righe = await db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      larghezza: sku.larghezza,
      altezza: sku.altezza,
      condizione: sku.condizione,
      tipo: tipiOggetto.nome,
      bloccatoVendita: sku.bloccatoVendita,
      prezzoEbay: sku.prezzoEbay,
      quantitaDisponibile: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
    })
    .from(sku)
    .innerJoin(tipiOggetto, eq(sku.tipoId, tipiOggetto.id))
    .leftJoin(movimentiMagazzino, eq(movimentiMagazzino.skuId, sku.id))
    .where(condizioniWhere.length ? and(...condizioniWhere) : undefined)
    .groupBy(sku.id, tipiOggetto.nome)
    .having(having)
    .orderBy(asc(sku.skuCode));

  return righe;
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
