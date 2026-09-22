// Import Excel -> Magazzino: calcolo dell'anteprima (diff) e scrittura in
// database. Logica confermata da Federico (chat progetto "Database
// Posterclub", 2026-09-22):
// - fonte = i due fogli grezzi STOCK FP / STOCK FOGLI CV (vedi excel-import.ts)
// - un movimento reale gia' avvenuto ma mai visto dal software (quantita'
//   Excel diversa dalla quantita' tracciata) genera un movimento nel
//   registro: aumento -> causale "carico", diminuzione -> causale
//   "vendita_esterna"
// - sku creati/gestiti nel software ma assenti da questo file NON vengono
//   mai toccati/orfanati
// - un campo (prezzo, anagrafica) non compilato in Excel non cancella mai
//   un valore gia' presente nel software - si aggiorna un campo SOLO se il
//   valore Excel e' non vuoto e diverso da quello attuale
// - va sempre mostrata un'anteprima completa PRIMA di scrivere, con
//   conferma esplicita dell'utente (nessuna scrittura silenziosa)

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { movimentiMagazzino, sku } from "@/db/schema";
import type { ProprietaImport, RigaGrezza } from "./excel-import";

type SkuEsistente = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  note: string | null;
  valoreCarico: string | null;
  prezzoEbay: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
};

export type OperazioneNuovoSku = {
  tipo: "nuovo_sku";
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  note: string | null;
  valoreCarico: string | null;
  prezzoEbay: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
  movimenti: { proprieta: ProprietaImport; quantita: number }[];
};

export type OperazioneMovimento = {
  tipo: "movimento";
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  proprieta: ProprietaImport;
  quantitaAttuale: number;
  quantitaExcel: number;
  delta: number;
  causale: "carico" | "vendita_esterna";
};

export type CampoCambiato = { campo: string; etichetta: string; da: string | null; a: string };

export type OperazioneAggiornamentoCampi = {
  tipo: "aggiornamento_campi";
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  campi: CampoCambiato[];
};

export type AnteprimaImport = {
  nuoviSku: OperazioneNuovoSku[];
  movimenti: OperazioneMovimento[];
  aggiornamenti: OperazioneAggiornamentoCampi[];
  skuNonToccatiCount: number;
  righeLetteCount: number;
};

function formatoDecimale(n: number | null, decimali: number): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  return n.toFixed(decimali);
}

// Confronta un valore stringa gia' presente in DB con uno nuovo (gia'
// formattato allo stesso numero di decimali) - normalizza via parseFloat
// per evitare falsi "cambiati" dovuti solo a formattazione (es. "60" vs
// "60.0").
function decimaleDiverso(attuale: string | null, nuovo: string | null): boolean {
  if (nuovo === null) return false;
  if (attuale === null) return true;
  const a = Number.parseFloat(attuale);
  const b = Number.parseFloat(nuovo);
  if (Number.isFinite(a) && Number.isFinite(b)) return a !== b;
  return attuale !== nuovo;
}

function testoDiverso(attuale: string | null, nuovo: string | null): boolean {
  if (nuovo === null) return false;
  return (attuale ?? "").trim() !== nuovo.trim();
}

const TESTO_KEYS = ["artista", "opera", "supporto", "anno", "note"] as const;
const DECIMALE_KEYS = ["larghezza", "altezza", "valoreCarico", "prezzoEbay", "prezzoCatawiki", "riservaCatawiki"] as const;

type ValoreCampo = { decimale: boolean; valore: string };

// Unisce le righe FP/CV di uno stesso sku in un unico set di valori per
// campo: CV prima, FP dopo, cosi' un valore compilato su entrambi vince a
// favore di FP in caso di conflitto (stessa priorita' storica RANK_SKU=1
// del vecchio Master) - ma SOLO se FP ha davvero un valore per quel campo,
// altrimenti resta quello di CV. Usata sia per creare un sku nuovo visto la
// prima volta su entrambi i fogli, sia per calcolare gli aggiornamenti su
// uno sku gia' esistente - stessa logica in entrambi i casi.
function unisciValoriCampi(righeSku: RigaGrezza[]): Map<string, ValoreCampo> {
  const ordinate = [...righeSku].sort((a) => (a.foglio === "FP" ? 1 : -1));
  const valoriFinali = new Map<string, ValoreCampo>();

  for (const r of ordinate) {
    const candidatiTesto: Record<(typeof TESTO_KEYS)[number], string | null> = {
      artista: r.artista,
      opera: r.opera,
      supporto: r.supporto,
      anno: r.anno,
      note: r.note,
    };
    for (const campo of TESTO_KEYS) {
      const v = candidatiTesto[campo];
      if (v !== null) valoriFinali.set(campo, { decimale: false, valore: v });
    }

    const candidatiDecimale: Record<(typeof DECIMALE_KEYS)[number], string | null> = {
      larghezza: formatoDecimale(r.larghezza, 1),
      altezza: formatoDecimale(r.altezza, 1),
      valoreCarico: r.foglio === "FP" ? formatoDecimale(r.valoreCarico, 2) : null,
      prezzoEbay: formatoDecimale(r.prezzoEbay, 2),
      prezzoCatawiki: formatoDecimale(r.prezzoCatawiki, 2),
      riservaCatawiki: formatoDecimale(r.riservaCatawiki, 2),
    };
    for (const campo of DECIMALE_KEYS) {
      const v = candidatiDecimale[campo];
      if (v !== null) valoriFinali.set(campo, { decimale: true, valore: v });
    }
  }

  return valoriFinali;
}

async function caricaContestoDb() {
  const tuttiSku = await db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      larghezza: sku.larghezza,
      altezza: sku.altezza,
      supporto: sku.supporto,
      anno: sku.anno,
      note: sku.note,
      valoreCarico: sku.valoreCarico,
      prezzoEbay: sku.prezzoEbay,
      prezzoCatawiki: sku.prezzoCatawiki,
      riservaCatawiki: sku.riservaCatawiki,
    })
    .from(sku);
  const mappaSku = new Map<string, SkuEsistente>(tuttiSku.map((s) => [s.skuCode, s]));

  const somme = await db
    .select({
      skuId: movimentiMagazzino.skuId,
      proprieta: movimentiMagazzino.proprieta,
      totale: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
    })
    .from(movimentiMagazzino)
    .groupBy(movimentiMagazzino.skuId, movimentiMagazzino.proprieta);
  const mappaQuantita = new Map<string, number>(
    somme.map((s) => [`${s.skuId}:${s.proprieta}`, s.totale])
  );

  return { mappaSku, mappaQuantita, totaleSkuEsistenti: tuttiSku.length };
}

// Etichette leggibili per la UI di anteprima.
const ETICHETTE_CAMPI: Record<string, string> = {
  artista: "Artista",
  opera: "Opera",
  larghezza: "Larghezza (cm)",
  altezza: "Altezza (cm)",
  supporto: "Supporto",
  anno: "Anno / epoca",
  note: "Note",
  valoreCarico: "Valore di carico",
  prezzoEbay: "Prezzo eBay",
  prezzoCatawiki: "Prezzo Catawiki",
  riservaCatawiki: "Riserva Catawiki",
};

export async function calcolaAnteprima(righe: RigaGrezza[]): Promise<AnteprimaImport> {
  const { mappaSku, mappaQuantita } = await caricaContestoDb();

  const perSku = new Map<string, RigaGrezza[]>();
  for (const r of righe) {
    const lista = perSku.get(r.skuCode) ?? [];
    lista.push(r);
    perSku.set(r.skuCode, lista);
  }

  const nuoviSku: OperazioneNuovoSku[] = [];
  const movimenti: OperazioneMovimento[] = [];
  const aggiornamenti: OperazioneAggiornamentoCampi[] = [];

  for (const [skuCode, righeSku] of perSku) {
    const esistente = mappaSku.get(skuCode);

    if (!esistente) {
      // Sku mai visto: stessa fusione FP+CV usata per gli aggiornamenti
      // (vedi unisciValoriCampi), cosi' uno sku presente su entrambi i
      // fogli fin dal primo import nasce gia' con tutti i dati disponibili
      // invece di richiedere un aggiornamento al giro successivo.
      const valori = unisciValoriCampi(righeSku);
      const campo = (nome: string): string | null => valori.get(nome)?.valore ?? null;
      nuoviSku.push({
        tipo: "nuovo_sku",
        skuCode,
        artista: campo("artista")!,
        opera: campo("opera")!,
        larghezza: campo("larghezza"),
        altezza: campo("altezza"),
        supporto: campo("supporto"),
        anno: campo("anno"),
        note: campo("note"),
        valoreCarico: campo("valoreCarico"),
        prezzoEbay: campo("prezzoEbay"),
        prezzoCatawiki: campo("prezzoCatawiki"),
        riservaCatawiki: campo("riservaCatawiki"),
        movimenti: righeSku
          .filter((r) => r.quantita !== 0)
          .map((r) => ({ proprieta: r.foglio, quantita: r.quantita })),
      });
      continue;
    }

    // Sku esistente: un movimento per ogni proprieta' presente in questo
    // import, se la quantita' Excel non coincide con quella gia' tracciata.
    for (const r of righeSku) {
      const attuale = mappaQuantita.get(`${esistente.id}:${r.foglio}`) ?? 0;
      const delta = r.quantita - attuale;
      if (delta !== 0) {
        movimenti.push({
          tipo: "movimento",
          skuId: esistente.id,
          skuCode,
          artista: esistente.artista,
          opera: esistente.opera,
          proprieta: r.foglio,
          quantitaAttuale: attuale,
          quantitaExcel: r.quantita,
          delta,
          causale: delta > 0 ? "carico" : "vendita_esterna",
        });
      }
    }

    // Aggiornamento campi: stessa fusione FP+CV di sopra. Un campo Excel
    // vuoto non cancella MAI un valore gia' presente (regola esplicita
    // cliente) - unisciValoriCampi gia' ignora i valori nulli.
    const valoriFinali = unisciValoriCampi(righeSku);
    const campi: CampoCambiato[] = [];
    for (const [campo, { decimale, valore }] of valoriFinali) {
      const attuale = esistente[campo as keyof SkuEsistente] as string | null;
      const cambiato = decimale ? decimaleDiverso(attuale, valore) : testoDiverso(attuale, valore);
      if (cambiato) {
        campi.push({ campo, etichetta: ETICHETTE_CAMPI[campo], da: attuale, a: valore });
      }
    }

    if (campi.length > 0) {
      aggiornamenti.push({
        tipo: "aggiornamento_campi",
        skuId: esistente.id,
        skuCode,
        artista: esistente.artista,
        opera: esistente.opera,
        campi,
      });
    }
  }

  const skuCodesNelFile = new Set(perSku.keys());
  const skuNonToccatiCount = [...mappaSku.keys()].filter((c) => !skuCodesNelFile.has(c)).length;

  return {
    nuoviSku,
    movimenti,
    aggiornamenti,
    skuNonToccatiCount,
    righeLetteCount: righe.length,
  };
}

// Scrive in database quanto calcolato da calcolaAnteprima, in
// un'unica transazione. Va chiamata SOLO dopo conferma esplicita
// dell'utente (vedi pagina /importa-excel).
export async function eseguiImport(anteprima: AnteprimaImport): Promise<{
  skuCreati: number;
  movimentiCreati: number;
  skuAggiornati: number;
}> {
  const tipoPoster = await db.query.tipiOggetto.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.nome, "Poster"),
  });
  const depositoDefault =
    (await db.query.ubicazioni.findFirst({ where: (u, { eq: eqFn }) => eqFn(u.nome, "Deposito") })) ??
    (await db.query.ubicazioni.findFirst({ where: (u, { eq: eqFn }) => eqFn(u.attivo, true) }));

  if (!tipoPoster) throw new Error('Tipo oggetto "Poster" non trovato - impostazioni vocabolari da verificare.');
  if (!depositoDefault) throw new Error("Nessuna ubicazione disponibile per registrare i movimenti di import.");

  let movimentiCreati = 0;

  await db.transaction(async (tx) => {
    for (const op of anteprima.nuoviSku) {
      const [nuovo] = await tx
        .insert(sku)
        .values({
          skuCode: op.skuCode,
          artista: op.artista,
          opera: op.opera,
          larghezza: op.larghezza,
          altezza: op.altezza,
          supporto: op.supporto,
          anno: op.anno,
          note: op.note,
          tipoId: tipoPoster.id,
          valoreCarico: op.valoreCarico,
          prezzoEbay: op.prezzoEbay,
          prezzoCatawiki: op.prezzoCatawiki,
          riservaCatawiki: op.riservaCatawiki,
        })
        .returning();

      for (const m of op.movimenti) {
        await tx.insert(movimentiMagazzino).values({
          skuId: nuovo.id,
          proprieta: m.proprieta,
          ubicazioneId: depositoDefault.id,
          causale: "carico",
          quantitaDelta: m.quantita,
          note: "Import Excel: sku nuovo",
        });
        movimentiCreati++;
      }
    }

    for (const op of anteprima.movimenti) {
      await tx.insert(movimentiMagazzino).values({
        skuId: op.skuId,
        proprieta: op.proprieta,
        ubicazioneId: depositoDefault.id,
        causale: op.causale,
        quantitaDelta: op.delta,
        note: `Import Excel: allineamento quantita' (da ${op.quantitaAttuale} a ${op.quantitaExcel})`,
      });
      movimentiCreati++;
    }

    for (const op of anteprima.aggiornamenti) {
      const set: Record<string, string> = {};
      for (const c of op.campi) set[c.campo] = c.a;
      await tx
        .update(sku)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(sku.id, op.skuId));
    }
  });

  return {
    skuCreati: anteprima.nuoviSku.length,
    movimentiCreati,
    skuAggiornati: anteprima.aggiornamenti.length,
  };
}
