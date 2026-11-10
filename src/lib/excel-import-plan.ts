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
//   un valore gia' presente nel software
// - REGOLA DEI TRE VALORI (Release 10, 2026-11-10, CAMBIO DI ROTTA rispetto
//   a "aggiorna se Excel non vuoto e diverso"): per ogni sku si ricorda
//   l'ultimo valore letto da Excel (sku.valoriExcel). Alla reimportazione, per
//   ciascun campo: Excel invariato dall'ultimo import -> resta il valore di
//   BATCH; Excel cambiato e campo non toccato in BATCH -> si aggiorna;
//   cambiati entrambi (e diversi) -> CONFLITTO, lo decide l'utente in anteprima
//   (di base: tieni BATCH)
// - CODICE GIA' PRESENTE ma con artista/opera diversi (stesso codice usato per
//   un altro poster): conflitto di codice, l'utente sceglie per ciascuno
//   Sovrascrivi / Rinomina (nuovo codice libero) / Ignora; finche' non e'
//   deciso non si scrive nulla
// - va sempre mostrata un'anteprima completa PRIMA di scrivere, con
//   conferma esplicita dell'utente (nessuna scrittura silenziosa)

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { impostazioniApp, movimentiMagazzino, proprietari, sku } from "@/db/schema";
import { CHIAVE_CODICI_PRENOTATI, formattaCodice, normalizzaBlocchi, primoNumeroLibero } from "./codici-sku";
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
  valoriExcel: unknown;
};

export type OperazioneNuovoSku = {
  tipo: "nuovo_sku";
  skuCode: string;
  // Valorizzato se lo sku nasce da "Rinomina": il codice vero si assegna in scrittura.
  rinominaDa?: string;
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

export type ConflittoCampo = {
  chiave: string; // `${skuCode}:${campo}`
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  campo: string;
  etichetta: string;
  valoreBatch: string | null;
  valoreExcel: string;
};

export type ConflittoCodice = {
  skuCode: string;
  esistente: { artista: string; opera: string };
  excel: { artista: string; opera: string };
};

export type DecisioniImport = {
  codici: Record<string, "sovrascrivi" | "rinomina" | "ignora">;
  campi: Record<string, "excel" | "batch">;
};

export type ScritturaValoriExcel = { skuId: number; valori: Record<string, string> };

export type AnteprimaImport = {
  nuoviSku: OperazioneNuovoSku[];
  movimenti: OperazioneMovimento[];
  aggiornamenti: OperazioneAggiornamentoCampi[];
  conflittiCampi: ConflittoCampo[];
  conflittiCodice: ConflittoCodice[];
  // Codici scelti con "Rinomina": il vecchio resta nel file Excel, lo sku nuovo ha un codice libero.
  rinominati: { vecchio: string }[];
  // Interno: valori Excel da memorizzare per sku (regola dei tre valori).
  valoriExcelDaSalvare: ScritturaValoriExcel[];
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
      valoriExcel: sku.valoriExcel,
    })
    .from(sku);
  const mappaSku = new Map<string, SkuEsistente>(tuttiSku.map((s) => [s.skuCode, s]));

  const somme = await db
    .select({
      skuId: movimentiMagazzino.skuId,
      tipoProprietario: proprietari.tipo,
      totale: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
    })
    .from(movimentiMagazzino)
    .innerJoin(proprietari, eq(movimentiMagazzino.proprietarioId, proprietari.id))
    .groupBy(movimentiMagazzino.skuId, proprietari.tipo);
  // Foglio FP = proprietari di tipo "azienda", foglio CV = tipo "soci"
  // (robusto ai rinomini). I proprietari "terzo" non esistono in Excel e
  // non entrano nel confronto.
  const mappaQuantita = new Map<string, number>();
  for (const s of somme) {
    const foglio = s.tipoProprietario === "azienda" ? "FP" : s.tipoProprietario === "soci" ? "CV" : null;
    if (!foglio) continue;
    const chiave = `${s.skuId}:${foglio}`;
    mappaQuantita.set(chiave, (mappaQuantita.get(chiave) ?? 0) + s.totale);
  }

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

function normalizzaTesto(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function bigrammi(t: string): Map<string, number> {
  const m = new Map<string, number>();
  const x = ` ${t} `;
  for (let i = 0; i < x.length - 1; i++) {
    const b = x.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

// Somiglianza 0..1 fra due testi (coefficiente di Dice sui bigrammi).
export function somiglianzaTesti(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizzaTesto(a);
  const y = normalizzaTesto(b);
  if (x === y) return 1;
  if (!x || !y) return 1; // un lato vuoto non e' una prova di poster diverso
  const bx = bigrammi(x);
  const by = bigrammi(y);
  let comuni = 0;
  let tx = 0;
  let ty = 0;
  for (const v of bx.values()) tx += v;
  for (const v of by.values()) ty += v;
  for (const [k, v] of bx) comuni += Math.min(v, by.get(k) ?? 0);
  return (2 * comuni) / (tx + ty);
}

const SOGLIA_STESSO_POSTER = 0.5;

function valoriExcelDi(s: SkuEsistente): Record<string, string> {
  const v = s.valoriExcel;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

function uguali(decimale: boolean, a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return decimale ? !decimaleDiverso(a, b) : !testoDiverso(a, b);
}

export async function calcolaAnteprima(righe: RigaGrezza[], decisioni?: DecisioniImport): Promise<AnteprimaImport> {
  const { mappaSku, mappaQuantita } = await caricaContestoDb();
  const conflittiCampi: ConflittoCampo[] = [];
  const conflittiCodice: ConflittoCodice[] = [];
  const rinominati: { vecchio: string }[] = [];
  const valoriExcelDaSalvare: ScritturaValoriExcel[] = [];

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

    // Conflitto di codice: stesso codice, ma artista/opera di un altro poster.
    let forzaExcel = false;
    let comeRinomina = false;
    if (esistente) {
      const valoriRiga = unisciValoriCampi(righeSku);
      const exArtista = valoriRiga.get("artista")?.valore ?? null;
      const exOpera = valoriRiga.get("opera")?.valore ?? null;
      const salvati = valoriExcelDi(esistente);
      const excelInvariato =
        (exArtista === null || salvati.artista === exArtista) && (exOpera === null || salvati.opera === exOpera);
      const diverso =
        !excelInvariato &&
        (somiglianzaTesti(exArtista, esistente.artista) < SOGLIA_STESSO_POSTER ||
          somiglianzaTesti(exOpera, esistente.opera) < SOGLIA_STESSO_POSTER);
      if (diverso) {
        const scelta = decisioni?.codici[skuCode];
        if (!scelta) {
          conflittiCodice.push({
            skuCode,
            esistente: { artista: esistente.artista, opera: esistente.opera },
            excel: { artista: exArtista ?? "", opera: exOpera ?? "" },
          });
          continue;
        }
        if (scelta === "ignora") continue;
        if (scelta === "sovrascrivi") forzaExcel = true;
        if (scelta === "rinomina") comeRinomina = true;
      }
    }

    if (!esistente || comeRinomina) {
      // Sku mai visto: stessa fusione FP+CV usata per gli aggiornamenti
      // (vedi unisciValoriCampi), cosi' uno sku presente su entrambi i
      // fogli fin dal primo import nasce gia' con tutti i dati disponibili
      // invece di richiedere un aggiornamento al giro successivo.
      const valori = unisciValoriCampi(righeSku);
      const campo = (nome: string): string | null => valori.get(nome)?.valore ?? null;
      if (comeRinomina) rinominati.push({ vecchio: skuCode });
      nuoviSku.push({
        tipo: "nuovo_sku",
        skuCode: comeRinomina ? `__rinomina__${skuCode}` : skuCode,
        rinominaDa: comeRinomina ? skuCode : undefined,
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
    const salvati = valoriExcelDi(esistente);
    const nuoviSalvati: Record<string, string> = {};
    for (const [campo, { decimale, valore }] of valoriFinali) {
      const attuale = esistente[campo as keyof SkuEsistente] as string | null;
      // Ultimo valore letto da Excel; per gli sku mai importati con questa
      // regola si parte dal valore attuale (= comportamento di prima).
      const ultimo = (salvati[campo] ?? null) !== null ? salvati[campo] : attuale;
      if (salvati[campo] !== valore) nuoviSalvati[campo] = valore;
      if (uguali(decimale, ultimo, valore)) continue; // Excel invariato: resta BATCH
      if (uguali(decimale, attuale, valore)) continue; // gia' uguale
      const batchToccato = !uguali(decimale, attuale, ultimo);
      if (forzaExcel || !batchToccato) {
        campi.push({ campo, etichetta: ETICHETTE_CAMPI[campo], da: attuale, a: valore });
        continue;
      }
      // Cambiati entrambi e diversi: lo decide l'utente (di base tieni BATCH).
      const chiave = `${skuCode}:${campo}`;
      const scelta = decisioni?.campi[chiave];
      if (scelta === "excel") campi.push({ campo, etichetta: ETICHETTE_CAMPI[campo], da: attuale, a: valore });
      else if (scelta !== "batch") {
        conflittiCampi.push({
          chiave,
          skuId: esistente.id,
          skuCode,
          artista: esistente.artista,
          opera: esistente.opera,
          campo,
          etichetta: ETICHETTE_CAMPI[campo],
          valoreBatch: attuale,
          valoreExcel: valore,
        });
      }
    }
    valoriExcelDaSalvare.push({ skuId: esistente.id, valori: nuoviSalvati });

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
    conflittiCampi,
    conflittiCodice,
    rinominati,
    valoriExcelDaSalvare,
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
  rinominati: { vecchio: string; nuovo: string }[];
}> {
  if (anteprima.conflittiCampi.length > 0 || anteprima.conflittiCodice.length > 0) {
    throw new Error("Ci sono conflitti non ancora decisi: scegli per ciascuno cosa fare.");
  }
  const tipoPoster = await db.query.tipiOggetto.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.nome, "Poster"),
  });
  // Deposito di default dell'import: il primo deposito aziendale attivo
  // (per id, non per nome: i nomi sono modificabili in Manutenzione).
  const depositoDefault = await db.query.ubicazioni.findFirst({
    where: (u, { and: andFn, eq: eqFn }) => andFn(eqFn(u.tipo, "deposito"), eqFn(u.attivo, true)),
    orderBy: (u, { asc }) => asc(u.id),
  });
  const propFP = await db.query.proprietari.findFirst({
    where: (p, { and: andFn, eq: eqFn }) => andFn(eqFn(p.tipo, "azienda"), eqFn(p.attivo, true)),
    orderBy: (p, { asc }) => asc(p.id),
  });
  const propCV = await db.query.proprietari.findFirst({
    where: (p, { and: andFn, eq: eqFn }) => andFn(eqFn(p.tipo, "soci"), eqFn(p.attivo, true)),
    orderBy: (p, { asc }) => asc(p.id),
  });
  if (!propFP || !propCV) {
    throw new Error('Servono un proprietario attivo di tipo "azienda" (foglio FP) e uno di tipo "soci" (foglio CV): controlla Manutenzione.');
  }
  const proprietarioDelFoglio = (f: ProprietaImport) => (f === "FP" ? propFP.id : propCV.id);

  if (!tipoPoster) throw new Error('Tipo oggetto "Poster" non trovato - impostazioni vocabolari da verificare.');
  if (!depositoDefault) throw new Error("Nessun deposito aziendale attivo per registrare i movimenti di import.");

  let movimentiCreati = 0;
  const rinominatiFatti: { vecchio: string; nuovo: string }[] = [];
  const adesso = new Date();
  const CAMPI_EXCEL = ["artista", "opera", "larghezza", "altezza", "supporto", "anno", "note", "valoreCarico", "prezzoEbay", "prezzoCatawiki", "riservaCatawiki"] as const;

  await db.transaction(async (tx) => {
    // I "rinominati" per ultimi: il codice libero si calcola dopo aver creato
    // gli sku con codice proprio del file.
    const ordinati = [...anteprima.nuoviSku].sort((a, b) => Number(!!a.rinominaDa) - Number(!!b.rinominaDa));
    for (const op of ordinati) {
      let skuCodeFinale = op.skuCode;
      if (op.rinominaDa) {
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(cast(substring(${sku.skuCode} from 3) as integer)), 0)`.mapWith(Number) })
          .from(sku)
          .where(sql`${sku.skuCode} ~ '^Z-[0-9]+$'`);
        const riga = await tx.query.impostazioniApp.findFirst({ where: eq(impostazioniApp.chiave, CHIAVE_CODICI_PRENOTATI) });
        skuCodeFinale = formattaCodice(primoNumeroLibero(max ?? 0, normalizzaBlocchi(riga?.valore)));
        rinominatiFatti.push({ vecchio: op.rinominaDa, nuovo: skuCodeFinale });
      }
      const valoriExcel: Record<string, string> = {};
      for (const c of CAMPI_EXCEL) {
        const v = op[c];
        if (v !== null && v !== undefined) valoriExcel[c] = v;
      }
      const [nuovo] = await tx
        .insert(sku)
        .values({
          valoriExcel,
          riportatoExcelAt: adesso,
          skuCode: skuCodeFinale,
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
          proprietarioId: proprietarioDelFoglio(m.proprieta),
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
        proprietarioId: proprietarioDelFoglio(op.proprieta),
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

    // Regola dei tre valori: memorizza l'ultimo valore letto da Excel e
    // segna come "riportati" gli sku che nel file ci sono davvero.
    for (const w of anteprima.valoriExcelDaSalvare) {
      await tx
        .update(sku)
        .set({
          valoriExcel: sql`${sku.valoriExcel} || ${JSON.stringify(w.valori)}::jsonb`,
          riportatoExcelAt: sql`coalesce(${sku.riportatoExcelAt}, now())`,
        })
        .where(eq(sku.id, w.skuId));
    }
  });

  return {
    skuCreati: anteprima.nuoviSku.length,
    movimentiCreati,
    skuAggiornati: anteprima.aggiornamenti.length,
    rinominati: rinominatiFatti,
  };
}
