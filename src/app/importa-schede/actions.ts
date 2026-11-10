"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { movimentiMagazzino, sku, skuTag, tag } from "@/db/schema";
import { prossimoSkuLibero } from "@/db/codici-sku-queries";
import { leggiFileSchede, type SchedaTelefono } from "@/lib/schede-telefono";
import { somiglianzaTesti } from "@/lib/excel-import-plan";

export type StatoScheda = "nuova" | "gia_presente" | "conflitto";
export type VoceAnteprimaScheda = {
  codice: string;
  stato: StatoScheda;
  esistente?: { artista: string; opera: string };
};

// Passo 1: nessuna scrittura. Per ogni scheda dice se il codice e' libero,
// se e' lo stesso poster gia' in BATCH (si salta) o se e' un altro poster.
export async function anteprimaSchede(json: string): Promise<{ ok: true; voci: VoceAnteprimaScheda[] } | { ok: false; errore: string }> {
  try {
    const file = leggiFileSchede(JSON.parse(json));
    const voci: VoceAnteprimaScheda[] = [];
    for (const s of file.schede) {
      const e = await db.query.sku.findFirst({ where: eq(sku.skuCode, s.codice) });
      if (!e) voci.push({ codice: s.codice, stato: "nuova" });
      else {
        const stesso = somiglianzaTesti(s.artista, e.artista) >= 0.5 && somiglianzaTesti(s.opera, e.opera) >= 0.5;
        voci.push({ codice: s.codice, stato: stesso ? "gia_presente" : "conflitto", esistente: { artista: e.artista, opera: e.opera } });
      }
    }
    return { ok: true, voci };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore nella lettura delle schede." };
  }
}

function dec(v: string, decimali: number): string | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n.toFixed(decimali) : null;
}

// Passo 2, una scheda per volta: crea lo sku, il carico e segna lo sku come
// gia' riportato su Excel (il file righe e' uscito dal telefono). Con
// rinomina=true la scheda prende il primo codice libero.
export async function creaSkuDaScheda(
  json: string,
  codice: string,
  depositoId: number,
  tipoId: number,
  rinomina: boolean,
  proprietarioId: number | null = null
): Promise<{ ok: boolean; errore?: string; skuId?: number; codice?: string; codiceOriginale?: string; tagNonTrovati?: string[] }> {
  try {
    const file = leggiFileSchede(JSON.parse(json));
    const s: SchedaTelefono | undefined = file.schede.find((x) => x.codice === codice);
    if (!s) return { ok: false, errore: "Scheda non trovata." };

    // Proprietario scelto in anteprima; se manca, regola di sempre: FP = primo attivo azienda, CV = primo attivo soci.
    const proprietario = proprietarioId
      ? await db.query.proprietari.findFirst({ where: (p, { and, eq: e }) => and(e(p.id, proprietarioId), e(p.attivo, true)) })
      : await db.query.proprietari.findFirst({
          where: (p, { and, eq: e }) => and(e(p.tipo, s.proprieta === "FP" ? "azienda" : "soci"), e(p.attivo, true)),
          orderBy: (p, { asc }) => asc(p.id),
        });
    if (!proprietario) return { ok: false, errore: `Manca un proprietario attivo di tipo ${s.proprieta === "FP" ? "azienda" : "soci"}.` };

    const esiste = await db.query.sku.findFirst({ where: eq(sku.skuCode, s.codice) });
    if (esiste && !rinomina) return { ok: false, errore: `Il codice ${s.codice} esiste gia'.` };
    const codiceFinale = rinomina ? await prossimoSkuLibero() : s.codice;

    const valori = {
      larghezza: dec(s.larghezza, 1),
      altezza: dec(s.altezza, 1),
      valoreCarico: s.proprieta === "FP" ? dec(s.costo, 2) : null,
      prezzoEbay: dec(s.prezzoEbay, 2),
      prezzoCatawiki: dec(s.prezzoCatawiki, 2),
      riservaCatawiki: dec(s.riservaCatawiki, 2),
      prezzoShopify: dec(s.prezzoShopify, 2),
      prezzoSubito: dec(s.prezzoSubito, 2),
      prezzoBidspirit: dec(s.prezzoBidspirit, 2),
      riservaBidspirit: dec(s.riservaBidspirit, 2),
    };
    const valoriExcel: Record<string, string> = { artista: s.artista, opera: s.opera };
    const NEL_FILE_RIGHE = ["larghezza", "altezza", "valoreCarico", "prezzoEbay", "prezzoCatawiki", "riservaCatawiki"];
    for (const [k, v] of Object.entries(valori)) if (v !== null && NEL_FILE_RIGHE.includes(k)) valoriExcel[k] = v;
    if (s.supporto) valoriExcel.supporto = s.supporto;
    if (s.anno) valoriExcel.anno = s.anno;
    if (s.note) valoriExcel.note = s.note;

    const nomiTag = s.tag.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const tuttiITag = nomiTag.length ? await db.select({ id: tag.id, nome: tag.nome }).from(tag) : [];
    const tagNonTrovati: string[] = [];
    const skuId = await db.transaction(async (tx) => {
      const [n] = await tx
        .insert(sku)
        .values({
          skuCode: codiceFinale,
          artista: s.artista,
          opera: s.opera,
          ...valori,
          supporto: s.supporto || null,
          anno: s.anno || null,
          note: s.note || null,
          condizione: s.condizione as "A" | "A-" | "B+" | "B" | "B-" | "C",
          tipoId,
          valoriExcel,
          riportatoExcelAt: new Date(),
        })
        .returning();
      // Tag scritti sul telefono (separati da virgola): quelli che esistono già in BATCH vengono assegnati.
      for (const nome of nomiTag) {
        const trovato = tuttiITag.find((x) => x.nome.trim().toLowerCase() === nome.toLowerCase());
        if (trovato) await tx.insert(skuTag).values({ skuId: n.id, tagId: trovato.id }).onConflictDoNothing();
        else tagNonTrovati.push(nome);
      }
      await tx.insert(movimentiMagazzino).values({
        skuId: n.id,
        proprietarioId: proprietario.id,
        ubicazioneId: depositoId,
        causale: "carico",
        quantitaDelta: s.quantita,
        note: "Scheda da telefono",
      });
      return n.id;
    });
    revalidatePath("/");
    return { ok: true, skuId, codice: codiceFinale, codiceOriginale: s.codice, tagNonTrovati };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore nella creazione dello sku." };
  }
}
