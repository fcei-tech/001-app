import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campiPersonalizzati, sku } from "@/db/schema";
import {
  campoDaRiga,
  leggiValori,
  normalizzaValoreCampo,
  pianificaCopia,
  pulisciNomeCampo,
  type CampoPersonalizzato,
  type PianoCopia,
  type TipoCampo,
  type ValoreCampo,
} from "@/lib/campi-personalizzati";

export async function getCampiPersonalizzati(): Promise<CampoPersonalizzato[]> {
  try {
    const righe = await db.select().from(campiPersonalizzati).orderBy(asc(campiPersonalizzati.ordine), asc(campiPersonalizzati.id));
    return righe.map(campoDaRiga);
  } catch {
    return []; // tabella non ancora creata: nessun campo, mai un errore che blocchi il Magazzino
  }
}

export async function creaCampo(nome: string, tipo: TipoCampo, opzioni: string[]) {
  const pulito = pulisciNomeCampo(nome);
  if (tipo === "elenco" && opzioni.length === 0) throw new Error("Per una scelta da elenco scrivi almeno un'opzione.");
  const esistenti = await getCampiPersonalizzati();
  if (esistenti.some((c) => c.nome.toLowerCase() === pulito.toLowerCase())) throw new Error(`Esiste già un campo "${pulito}".`);
  const ordine = esistenti.reduce((m, c) => Math.max(m, c.ordine), 0) + 1;
  const [r] = await db
    .insert(campiPersonalizzati)
    .values({ nome: pulito, tipo, opzioni: tipo === "elenco" ? opzioni : [], ordine })
    .returning();
  return campoDaRiga(r);
}

export async function rinominaCampo(id: number, nome: string, opzioni?: string[]) {
  const pulito = pulisciNomeCampo(nome);
  const esistenti = await getCampiPersonalizzati();
  const campo = esistenti.find((c) => c.id === id);
  if (!campo) throw new Error("Campo non trovato.");
  if (esistenti.some((c) => c.id !== id && c.nome.toLowerCase() === pulito.toLowerCase())) throw new Error(`Esiste già un campo "${pulito}".`);
  const set: { nome: string; opzioni?: string[] } = { nome: pulito };
  if (campo.tipo === "elenco" && opzioni) {
    if (opzioni.length === 0) throw new Error("Per una scelta da elenco serve almeno un'opzione.");
    set.opzioni = opzioni;
  }
  await db.update(campiPersonalizzati).set(set).where(eq(campiPersonalizzati.id, id));
}

// Quanti sku hanno un valore in questo campo (per l'avviso prima di eliminare).
export async function contaValoriCampo(id: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(sku).where(sql`${sku.campiPersonalizzati} ? ${String(id)}`);
  return r?.n ?? 0;
}

export async function eliminaCampo(id: number) {
  await db.transaction(async (tx) => {
    await tx.update(sku).set({ campiPersonalizzati: sql`${sku.campiPersonalizzati} - ${String(id)}` }).where(sql`${sku.campiPersonalizzati} ? ${String(id)}`);
    await tx.delete(campiPersonalizzati).where(eq(campiPersonalizzati.id, id));
  });
}

// Scrive i valori di piu' campi su UNO sku. valori: id campo -> testo scritto
// ("" = svuota). Valida ogni valore sul tipo; un errore blocca tutto.
export async function impostaValoriSku(skuId: number, grezzi: Record<number, unknown>) {
  const campi = await getCampiPersonalizzati();
  const riga = await db.query.sku.findFirst({ where: eq(sku.id, skuId), columns: { campiPersonalizzati: true } });
  if (!riga) throw new Error("Sku non trovato.");
  const valori = { ...leggiValori(riga.campiPersonalizzati) };
  for (const [idTesto, grezzo] of Object.entries(grezzi)) {
    const campo = campi.find((c) => c.id === Number(idTesto));
    if (!campo) continue;
    const v = normalizzaValoreCampo(campo, grezzo);
    if (v === null) delete valori[String(campo.id)];
    else valori[String(campo.id)] = v;
  }
  await db.update(sku).set({ campiPersonalizzati: valori, updatedAt: new Date() }).where(eq(sku.id, skuId));
}

async function datiPerCopia(origine: string, destinazioneId: number) {
  const campi = await getCampiPersonalizzati();
  const destinazione = campi.find((c) => c.id === destinazioneId);
  if (!destinazione) throw new Error("Scegli il campo di destinazione.");
  const righe = await db.select().from(sku);
  const valoriOrigine = (r: (typeof righe)[number]): unknown => {
    if (origine.startsWith("cp:")) return leggiValori(r.campiPersonalizzati)[origine.slice(3)];
    if (origine.startsWith("std:")) return (r as unknown as Record<string, unknown>)[origine.slice(4)];
    throw new Error("Origine non valida.");
  };
  if (origine === `cp:${destinazioneId}`) throw new Error("Origine e destinazione sono lo stesso campo.");
  const lista = righe
    .filter((r) => r.skuCode !== "IGNORA")
    .map((r) => ({ id: r.id, skuCode: r.skuCode, origine: valoriOrigine(r), destinazione: leggiValori(r.campiPersonalizzati)[String(destinazioneId)] }));
  return { destinazione, lista };
}

export type AnteprimaCopia = {
  daCopiare: number;
  saltatiDestinazionePiena: number;
  origineVuota: number;
  nonConvertibili: number;
  esempi: { skuCode: string; valore: string; sostituisce: string | null }[];
  esempiNonConvertibili: { skuCode: string; valore: string }[];
};

export async function anteprimaCopia(origine: string, destinazioneId: number, soloDoveVuota: boolean): Promise<AnteprimaCopia> {
  const { destinazione, lista } = await datiPerCopia(origine, destinazioneId);
  const p: PianoCopia = pianificaCopia(lista, destinazione, soloDoveVuota);
  const testo = (v: ValoreCampo) => (typeof v === "boolean" ? (v ? "Sì" : "No") : String(v));
  return {
    daCopiare: p.daCopiare.length,
    saltatiDestinazionePiena: p.saltatiDestinazionePiena,
    origineVuota: p.origineVuota,
    nonConvertibili: p.nonConvertibili.length,
    esempi: p.daCopiare.slice(0, 8).map((d) => ({ skuCode: d.skuCode, valore: testo(d.valore), sostituisce: d.sostituisce === undefined ? null : testo(d.sostituisce) })),
    esempiNonConvertibili: p.nonConvertibili.slice(0, 5),
  };
}

export async function eseguiCopia(origine: string, destinazioneId: number, soloDoveVuota: boolean): Promise<number> {
  const { destinazione, lista } = await datiPerCopia(origine, destinazioneId);
  const p = pianificaCopia(lista, destinazione, soloDoveVuota);
  const chiave = String(destinazioneId);
  const BLOCCO = 300;
  await db.transaction(async (tx) => {
    for (let i = 0; i < p.daCopiare.length; i += BLOCCO) {
      const blocco = p.daCopiare.slice(i, i + BLOCCO);
      const valori = sql.join(
        blocco.map((d) => sql`(${d.skuId}::int, ${JSON.stringify(d.valore)}::jsonb)`),
        sql`, `
      );
      await tx.execute(
        sql`update sku set campi_personalizzati = jsonb_set(sku.campi_personalizzati, ${`{${chiave}}`}::text[], v.val, true), updated_at = now() from (values ${valori}) as v(id, val) where sku.id = v.id`
      );
    }
  });
  return p.daCopiare.length;
}


// Modifica in blocco (2026-11-10): imposta lo STESSO valore di UN campo su piu'
// sku, in una sola transazione. Restituisce i valori di prima (null = era
// vuoto) per il bottone Annulla. Un valore non valido non scrive niente.
export type PrecedenteCampoBlocco = { skuId: number; valore: ValoreCampo | null };

export async function impostaCampoInBlocco(skuIds: number[], campoId: number, grezzo: unknown): Promise<PrecedenteCampoBlocco[]> {
  const campi = await getCampiPersonalizzati();
  const campo = campi.find((c) => c.id === campoId);
  if (!campo) throw new Error("Campo non trovato.");
  const nuovo = normalizzaValoreCampo(campo, grezzo);
  const chiave = String(campoId);
  return db.transaction(async (tx) => {
    const righe = await tx.select({ id: sku.id, valori: sku.campiPersonalizzati }).from(sku).where(inArray(sku.id, skuIds));
    const precedenti: PrecedenteCampoBlocco[] = [];
    for (const r of righe) {
      const valori = { ...leggiValori(r.valori) };
      precedenti.push({ skuId: r.id, valore: valori[chiave] ?? null });
      if (nuovo === null) delete valori[chiave];
      else valori[chiave] = nuovo;
      await tx.update(sku).set({ campiPersonalizzati: valori, updatedAt: new Date() }).where(eq(sku.id, r.id));
    }
    return precedenti;
  });
}

export async function ripristinaCampoInBlocco(campoId: number, precedenti: PrecedenteCampoBlocco[]) {
  const chiave = String(campoId);
  await db.transaction(async (tx) => {
    for (const p of precedenti) {
      const riga = await tx.select({ valori: sku.campiPersonalizzati }).from(sku).where(eq(sku.id, p.skuId));
      if (!riga[0]) continue;
      const valori = { ...leggiValori(riga[0].valori) };
      if (p.valore === null) delete valori[chiave];
      else valori[chiave] = p.valore;
      await tx.update(sku).set({ campiPersonalizzati: valori, updatedAt: new Date() }).where(eq(sku.id, p.skuId));
    }
  });
}
