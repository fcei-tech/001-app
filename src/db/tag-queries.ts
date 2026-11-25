import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { sku, skuTag, tag } from "./schema";

// Tag degli sku (2026-10-30). Elenco gestito in Archivi > Tag; assegnazione
// dalla scheda sku e in blocco dal Magazzino.

export type TagInfo = {
  id: number;
  nome: string;
  tipo: "interno" | "soggetto";
  vaiSuShopify: boolean;
  numeroSku: number;
};

export type TagBreve = { id: number; nome: string; tipo: "interno" | "soggetto" };

export const TIPI_TAG = ["interno", "soggetto"] as const;

export async function getTagConConteggio(): Promise<TagInfo[]> {
  const righe = await db
    .select({
      id: tag.id,
      nome: tag.nome,
      tipo: tag.tipo,
      vaiSuShopify: tag.vaiSuShopify,
      numeroSku: sql<number>`(select count(*) from sku_tag st where st.tag_id = ${tag.id})`.mapWith(Number),
    })
    .from(tag)
    .orderBy(asc(tag.tipo), asc(sql`lower(${tag.nome})`));
  return righe.map((r) => ({ ...r, tipo: r.tipo === "interno" ? "interno" : "soggetto" }));
}

// Elenco breve per i menu (filtri, dialoghi): prima gli interni, poi i soggetti.
export async function getTagBrevi(): Promise<TagBreve[]> {
  const righe = await db.select({ id: tag.id, nome: tag.nome, tipo: tag.tipo }).from(tag).orderBy(asc(tag.tipo), asc(sql`lower(${tag.nome})`));
  return righe.map((r) => ({ ...r, tipo: r.tipo === "interno" ? "interno" : "soggetto" }));
}

function normalizzaNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

export async function creaTag(nomeGrezzo: string, tipo: string): Promise<{ ok: true; id: number } | { ok: false; errore: string }> {
  const nome = normalizzaNome(nomeGrezzo);
  if (!nome) return { ok: false, errore: "Scrivi il nome del tag." };
  if (nome.length > 60) return { ok: false, errore: "Nome troppo lungo (massimo 60 caratteri)." };
  if (nome.includes(",") || nome.includes("|")) return { ok: false, errore: "Nel nome non si possono usare virgole o il simbolo |." };
  const t = tipo === "interno" ? "interno" : "soggetto";
  const esiste = await db.select({ id: tag.id }).from(tag).where(sql`lower(${tag.nome}) = lower(${nome})`);
  if (esiste.length) return { ok: false, errore: `Esiste gia' un tag "${nome}".` };
  const [r] = await db.insert(tag).values({ nome, tipo: t }).returning();
  return { ok: true, id: r.id };
}

export async function rinominaTag(id: number, nomeGrezzo: string): Promise<{ ok: true } | { ok: false; errore: string }> {
  const nome = normalizzaNome(nomeGrezzo);
  if (!nome) return { ok: false, errore: "Scrivi il nome del tag." };
  if (nome.length > 60) return { ok: false, errore: "Nome troppo lungo (massimo 60 caratteri)." };
  if (nome.includes(",") || nome.includes("|")) return { ok: false, errore: "Nel nome non si possono usare virgole o il simbolo |." };
  const altro = await db.select({ id: tag.id }).from(tag).where(and(sql`lower(${tag.nome}) = lower(${nome})`, sql`${tag.id} <> ${id}`));
  if (altro.length) return { ok: false, errore: `Esiste gia' un tag "${nome}".` };
  await db.update(tag).set({ nome }).where(eq(tag.id, id));
  return { ok: true };
}

export async function impostaTipoTag(id: number, tipo: string): Promise<void> {
  await db.update(tag).set({ tipo: tipo === "interno" ? "interno" : "soggetto" }).where(eq(tag.id, id));
}

// Interruttore pronto per dopo: oggi nessun file per i portali lo legge.
export async function impostaVaiSuShopify(id: number, valore: boolean): Promise<void> {
  await db.update(tag).set({ vaiSuShopify: valore }).where(eq(tag.id, id));
}

// Elimina il tag e lo toglie da tutti gli sku (cascade). Restituisce da quanti sku e' stato tolto.
export async function eliminaTag(id: number): Promise<number> {
  return db.transaction(async (tx) => {
    const tolti = await tx.delete(skuTag).where(eq(skuTag.tagId, id)).returning();
    await tx.delete(tag).where(eq(tag.id, id));
    return tolti.length;
  });
}

// Aggiunge i tag a tutti gli sku indicati (chi li ha gia' resta com'e').
export async function assegnaTag(skuIds: number[], tagIds: number[]): Promise<{ sku: number; tag: number; nuoveAssegnazioni: number }> {
  const sIds = [...new Set(skuIds)];
  const tIds = [...new Set(tagIds)];
  if (!sIds.length || !tIds.length) return { sku: sIds.length, tag: tIds.length, nuoveAssegnazioni: 0 };
  const valori = sIds.flatMap((skuId) => tIds.map((tagId) => ({ skuId, tagId })));
  let nuove = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < valori.length; i += 500) {
      const r = await tx.insert(skuTag).values(valori.slice(i, i + 500)).onConflictDoNothing().returning();
      nuove += r.length;
    }
  });
  return { sku: sIds.length, tag: tIds.length, nuoveAssegnazioni: nuove };
}

// Toglie i tag da tutti gli sku indicati.
export async function togliTag(skuIds: number[], tagIds: number[]): Promise<{ tolte: number }> {
  const sIds = [...new Set(skuIds)];
  const tIds = [...new Set(tagIds)];
  if (!sIds.length || !tIds.length) return { tolte: 0 };
  let tolte = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < sIds.length; i += 500) {
      const r = await tx
        .delete(skuTag)
        .where(and(inArray(skuTag.skuId, sIds.slice(i, i + 500)), inArray(skuTag.tagId, tIds)))
        .returning();
      tolte += r.length;
    }
  });
  return { tolte };
}

// Scheda sku: sostituisce l'insieme dei tag dello sku con quello scelto.
export async function impostaTagDiSku(skuId: number, tagIds: number[]): Promise<void> {
  const tIds = [...new Set(tagIds)];
  await db.transaction(async (tx) => {
    await tx.delete(skuTag).where(eq(skuTag.skuId, skuId));
    if (tIds.length) await tx.insert(skuTag).values(tIds.map((tagId) => ({ skuId, tagId })));
  });
}

export async function getTagIdsDiSku(skuId: number): Promise<number[]> {
  const r = await db.select({ tagId: skuTag.tagId }).from(skuTag).where(eq(skuTag.skuId, skuId)).orderBy(asc(skuTag.tagId));
  return r.map((x) => x.tagId);
}

// Per le tabelle dei portali statici: tag di tutti gli sku (id sku -> id dei tag).
export async function getTagIdsPerSku(): Promise<Record<number, number[]>> {
  const r = await db.select({ skuId: skuTag.skuId, tagId: skuTag.tagId }).from(skuTag);
  const mappa: Record<number, number[]> = {};
  for (const x of r) (mappa[x.skuId] ??= []).push(x.tagId);
  return mappa;
}

// Famiglie gia' usate dagli altri sku dello stesso artista: servono da suggerimento
// nel form Nuovo sku. Contano solo se l'artista ha almeno 2 sku e la famiglia e' su
// almeno meta' di essi (un artista con temi misti non da' nessun suggerimento).
export async function suggerisciTagIdsPerArtista(artista: string, massimo = 2): Promise<number[]> {
  const nome = artista.trim();
  if (!nome) return [];
  const [tot] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(sku)
    .where(sql`lower(trim(${sku.artista})) = lower(${nome})`);
  if (!tot || tot.n < 2) return [];
  const righe = await db
    .select({ tagId: skuTag.tagId, n: sql<number>`count(distinct ${sku.id})`.mapWith(Number) })
    .from(skuTag)
    .innerJoin(sku, eq(sku.id, skuTag.skuId))
    .innerJoin(tag, eq(tag.id, skuTag.tagId))
    .where(sql`lower(trim(${sku.artista})) = lower(${nome}) and ${tag.tipo} = 'soggetto'`)
    .groupBy(skuTag.tagId);
  return righe
    .filter((r) => r.n * 2 >= tot.n)
    .sort((a, b) => b.n - a.n)
    .slice(0, massimo)
    .map((r) => r.tagId);
}
