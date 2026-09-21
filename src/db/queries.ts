import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./index";
import { fotoSku, movimentiMagazzino, sku, tipiOggetto, ubicazioni } from "./schema";

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

// Legge il Magazzino: per ogni sku, la quantita' disponibile e' la somma
// dei movimenti nel registro (mai un campo sovrascritto), coerente con
// stock_come_registro_movimenti in 09_python_checklist.yaml.
export async function getMagazzino(ricerca?: string): Promise<RigaMagazzino[]> {
  const filtro = ricerca?.trim()
    ? or(ilike(sku.artista, `%${ricerca}%`), ilike(sku.opera, `%${ricerca}%`), ilike(sku.skuCode, `%${ricerca}%`))
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
    .where(filtro)
    .groupBy(sku.id, tipiOggetto.nome)
    .orderBy(asc(sku.skuCode));

  return righe;
}

export async function contaSku(): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(sku);
  return count;
}

// Ricerca duplicati per l'inserimento nuovo sku: SOLO artista+opera, testuale,
// nessun riconoscimento visivo/AI immagine (scelta deliberata, vedi
// modulo_inserimento_nuovo_sku_2026_09_11/ricerca_duplicati).
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

// Galleria foto sku, copertina (ordine=0) prima - vedi lib/shopify.ts per
// l'upload che le genera (Shopify CDN, decisione 2026-09-17).
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
