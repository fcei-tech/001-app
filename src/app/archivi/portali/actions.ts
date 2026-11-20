"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canali } from "@/db/schema";
import { coloriDelCanale, erroreColoriPortale } from "@/lib/colori-canali";
import { creaCanale } from "@/db/pubblicazione-queries";

export async function setCanaleAttivoAction(canaleId: number, attivo: boolean): Promise<{ ok: boolean; errore?: string }> {
  try {
    await db.update(canali).set({ attivo, updatedAt: new Date() }).where(eq(canali.id, canaleId));
    revalidatePath("/archivi/portali");
    revalidatePath("/pubblicazione");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// ---------------------------------------------------------------------------
// Release 12 (2026-11-20): colori del portale (da 1 a 4) e creazione portale.
// ---------------------------------------------------------------------------

async function altriColori(escludiId?: number) {
  const tutti = await db.query.canali.findMany();
  return tutti
    .filter((c) => c.id !== escludiId)
    .map((c) => ({ nome: c.nome, colori: coloriDelCanale(c) }));
}

export async function salvaColoriCanaleAction(canaleId: number, colori: string[]): Promise<{ ok: boolean; errore?: string }> {
  try {
    const puliti = colori.map((c) => c.trim().toUpperCase());
    const errore = erroreColoriPortale(puliti, await altriColori(canaleId));
    if (errore) return { ok: false, errore };
    await db.update(canali).set({ colori: puliti, updatedAt: new Date() }).where(eq(canali.id, canaleId));
    revalidatePath("/archivi/portali");
    revalidatePath("/pubblicazione", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function creaPortaleAction(dati: {
  nome: string;
  tipo: "statico" | "asta_online" | "asta_fisica";
  esclusivo: boolean;
  colori: string[];
}): Promise<{ ok: boolean; errore?: string }> {
  try {
    const nome = dati.nome.trim();
    if (!nome) return { ok: false, errore: "Scrivi il nome del portale." };
    const esiste = await db.query.canali.findFirst({ where: (c, { eq: uguale }) => uguale(c.nome, nome) });
    if (esiste) return { ok: false, errore: "Esiste gia' un portale con questo nome." };
    const puliti = dati.colori.map((c) => c.trim().toUpperCase());
    const errore = erroreColoriPortale(puliti, await altriColori());
    if (errore) return { ok: false, errore };
    await creaCanale({
      nome,
      tipo: dati.tipo,
      // Le aste fisiche e online lavorano un pezzo alla volta; per i portali
      // statici si sceglie nel modulo.
      esclusivo: dati.tipo === "statico" ? dati.esclusivo : true,
      colori: puliti,
    });
    revalidatePath("/archivi/portali");
    revalidatePath("/pubblicazione", "layout");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}
