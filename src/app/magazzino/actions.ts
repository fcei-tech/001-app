"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { fotoSku, movimentiMagazzino, sku } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { cercaCandidatiDuplicati } from "@/db/queries";
import { caricaFotoSuShopify } from "@/lib/shopify";

export async function cercaCandidati(query: string) {
  return cercaCandidatiDuplicati(query);
}

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"] as const;
const PROPRIETA = ["FP", "CV"] as const;

function testoOVuoto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}
function numeroOVuoto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim().replace(",", ".");
  return s.length ? s : null;
}

async function prossimoSkuCode(): Promise<string> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(cast(substring(${sku.skuCode} from 3) as integer)), 0)`.mapWith(Number) })
    .from(sku)
    .where(sql`${sku.skuCode} ~ '^Z-[0-9]+$'`);
  const prossimo = (max ?? 0) + 1;
  return `Z-${String(prossimo).padStart(5, "0")}`;
}

export async function creaNuovoSku(formData: FormData) {
  const artista = testoOVuoto(formData.get("artista"));
  const opera = testoOVuoto(formData.get("opera"));
  const proprieta = formData.get("proprieta")?.toString();
  const ubicazioneId = Number(formData.get("ubicazioneId"));
  const quantita = Number(formData.get("quantita"));

  if (!artista || !opera) throw new Error("Artista e opera sono obbligatori");
  if (!proprieta || !PROPRIETA.includes(proprieta as (typeof PROPRIETA)[number])) {
    throw new Error("Proprieta' non valida");
  }
  if (!ubicazioneId || !Number.isFinite(quantita) || quantita < 0) {
    throw new Error("Ubicazione o quantita' non valide");
  }

  const skuCode = await prossimoSkuCode();
  const condizioneRaw = formData.get("condizione")?.toString() || "A-";
  if (!CONDIZIONI.includes(condizioneRaw as (typeof CONDIZIONI)[number])) {
    throw new Error("Condizione non valida");
  }
  const condizione = condizioneRaw as (typeof CONDIZIONI)[number];

  const [nuovo] = await db
    .insert(sku)
    .values({
      skuCode,
      artista,
      opera,
      larghezza: numeroOVuoto(formData.get("larghezza")),
      altezza: numeroOVuoto(formData.get("altezza")),
      supporto: testoOVuoto(formData.get("supporto")),
      anno: testoOVuoto(formData.get("anno")),
      condizione,
      tipoId: Number(formData.get("tipoId")),
      valoreCarico: numeroOVuoto(formData.get("valoreCarico")),
      prezzoEbay: numeroOVuoto(formData.get("prezzoEbay")),
      prezzoCatawiki: numeroOVuoto(formData.get("prezzoCatawiki")),
      riservaCatawiki: numeroOVuoto(formData.get("riservaCatawiki")),
    })
    .returning();

  if (quantita > 0) {
    await db.insert(movimentiMagazzino).values({
      skuId: nuovo.id,
      proprieta: proprieta as (typeof PROPRIETA)[number],
      ubicazioneId,
      causale: "carico",
      quantitaDelta: quantita,
      note: "Carico iniziale",
    });
  }

  revalidatePath("/");
  redirect(`/magazzino/${nuovo.id}?creato=1`);
}

export async function aggiungiCaricoSkuEsistente(formData: FormData) {
  const skuId = Number(formData.get("skuId"));
  const proprieta = formData.get("proprieta")?.toString();
  const ubicazioneId = Number(formData.get("ubicazioneId"));
  const quantita = Number(formData.get("quantita"));

  if (!skuId) throw new Error("Sku non valido");
  if (!proprieta || !PROPRIETA.includes(proprieta as (typeof PROPRIETA)[number])) {
    throw new Error("Proprieta' non valida");
  }
  if (!ubicazioneId || !Number.isFinite(quantita) || quantita <= 0) {
    throw new Error("Ubicazione o quantita' non valide");
  }

  await db.insert(movimentiMagazzino).values({
    skuId,
    proprieta: proprieta as (typeof PROPRIETA)[number],
    ubicazioneId,
    causale: "carico",
    quantitaDelta: quantita,
    note: "Carico su sku esistente (da ricerca duplicati)",
  });

  revalidatePath("/");
  redirect(`/magazzino/${skuId}?carico=1`);
}

export async function modificaSku(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Sku non valido");

  const condizioneRaw = formData.get("condizione")?.toString() || "A-";
  if (!CONDIZIONI.includes(condizioneRaw as (typeof CONDIZIONI)[number])) {
    throw new Error("Condizione non valida");
  }

  await db
    .update(sku)
    .set({
      artista: testoOVuoto(formData.get("artista")) ?? "",
      opera: testoOVuoto(formData.get("opera")) ?? "",
      larghezza: numeroOVuoto(formData.get("larghezza")),
      altezza: numeroOVuoto(formData.get("altezza")),
      supporto: testoOVuoto(formData.get("supporto")),
      anno: testoOVuoto(formData.get("anno")),
      condizione: condizioneRaw as (typeof CONDIZIONI)[number],
      tipoId: Number(formData.get("tipoId")),
      tag: testoOVuoto(formData.get("tag")),
      note: testoOVuoto(formData.get("note")),
      bloccatoVendita: formData.get("bloccatoVendita") === "on",
      valoreCarico: numeroOVuoto(formData.get("valoreCarico")),
      prezzoEbay: numeroOVuoto(formData.get("prezzoEbay")),
      prezzoCatawiki: numeroOVuoto(formData.get("prezzoCatawiki")),
      riservaCatawiki: numeroOVuoto(formData.get("riservaCatawiki")),
      updatedAt: new Date(),
    })
    .where(eq(sku.id, id));

  revalidatePath("/");
  revalidatePath(`/magazzino/${id}`);
  redirect(`/magazzino/${id}?salvato=1`);
}

export async function aggiungiMovimento(formData: FormData) {
  const skuId = Number(formData.get("skuId"));
  const proprieta = formData.get("proprieta")?.toString();
  const ubicazioneId = Number(formData.get("ubicazioneId"));
  const causale = testoOVuoto(formData.get("causale")) ?? "correzione";
  const quantitaDelta = Number(formData.get("quantitaDelta"));
  const note = testoOVuoto(formData.get("note"));

  if (!skuId) throw new Error("Sku non valido");
  if (!proprieta || !PROPRIETA.includes(proprieta as (typeof PROPRIETA)[number])) {
    throw new Error("Proprieta' non valida");
  }
  if (!ubicazioneId || !Number.isFinite(quantitaDelta) || quantitaDelta === 0) {
    throw new Error("Ubicazione o quantita' non valide");
  }

  await db.insert(movimentiMagazzino).values({
    skuId,
    proprieta: proprieta as (typeof PROPRIETA)[number],
    ubicazioneId,
    causale,
    quantitaDelta,
    note,
  });

  revalidatePath("/");
  revalidatePath(`/magazzino/${skuId}`);
  redirect(`/magazzino/${skuId}?movimento=1`);
}

export async function caricaFotoSku(formData: FormData) {
  const skuId = Number(formData.get("skuId"));
  if (!skuId) throw new Error("Sku non valido");

  const files = formData.getAll("foto").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Nessuna foto selezionata");

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${fotoSku.ordine}), -1)`.mapWith(Number) })
    .from(fotoSku)
    .where(eq(fotoSku.skuId, skuId));

  let prossimoOrdine = (max ?? -1) + 1;
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await caricaFotoSuShopify(bytes, file.name, file.type || "image/jpeg");
    await db.insert(fotoSku).values({ skuId, url, ordine: prossimoOrdine });
    prossimoOrdine += 1;
  }

  revalidatePath(`/magazzino/${skuId}`);
  redirect(`/magazzino/${skuId}?foto=1`);
}

export async function eliminaFotoSku(formData: FormData) {
  const fotoId = Number(formData.get("fotoId"));
  const skuId = Number(formData.get("skuId"));
  if (!fotoId || !skuId) throw new Error("Riferimento foto non valido");

  await db.delete(fotoSku).where(eq(fotoSku.id, fotoId));

  revalidatePath(`/magazzino/${skuId}`);
  redirect(`/magazzino/${skuId}?fotoeliminata=1`);
}

// Sposta una foto su/giu' nella galleria scambiando l'ordine con la foto
// adiacente - cambia la copertina (ordine=0) senza cancellare/ricaricare.
export async function spostaFotoSku(formData: FormData) {
  const fotoId = Number(formData.get("fotoId"));
  const skuId = Number(formData.get("skuId"));
  const direzione = formData.get("direzione")?.toString();
  if (!fotoId || !skuId || (direzione !== "su" && direzione !== "giu")) {
    throw new Error("Parametri non validi");
  }

  const foto = await db
    .select({ id: fotoSku.id, ordine: fotoSku.ordine })
    .from(fotoSku)
    .where(eq(fotoSku.skuId, skuId))
    .orderBy(asc(fotoSku.ordine));

  const indice = foto.findIndex((f) => f.id === fotoId);
  if (indice < 0) throw new Error("Foto non trovata");

  const indiceVicino = direzione === "su" ? indice - 1 : indice + 1;
  if (indiceVicino >= 0 && indiceVicino < foto.length) {
    const corrente = foto[indice];
    const vicino = foto[indiceVicino];
    await db.transaction(async (tx) => {
      await tx.update(fotoSku).set({ ordine: vicino.ordine }).where(eq(fotoSku.id, corrente.id));
      await tx.update(fotoSku).set({ ordine: corrente.ordine }).where(eq(fotoSku.id, vicino.id));
    });
  }

  revalidatePath(`/magazzino/${skuId}`);
}

export async function eliminaSku(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Sku non valido");

  await db.transaction(async (tx) => {
    await tx.delete(fotoSku).where(eq(fotoSku.skuId, id));
    await tx.delete(movimentiMagazzino).where(eq(movimentiMagazzino.skuId, id));
    await tx.delete(sku).where(eq(sku.id, id));
  });

  revalidatePath("/");
  redirect("/?skueliminato=1");
}
