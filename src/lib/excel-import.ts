// Import Excel -> Magazzino: lettura dei due fogli grezzi STOCK FP e STOCK
// FOGLI CV (fonte di verita' del cliente, NON il Master con le sue formule).
// Vedi progetto Claude "Database Posterclub", 03_master_excel_struttura.yaml
// /fogli_fp_cv per le colonne reali confermate.
//
// Nota di robustezza: in passato (progetto Excel/openpyxl) questi file
// causavano un errore di apertura per uno stylesheet con family>14 - la
// libreria usata qui (xlsx/SheetJS) si e' verificata tollerante a questo
// problema (testato sul file reale del cliente), quindi nessun
// pre-processing dello stylesheet e' necessario.

import * as XLSX from "xlsx";

export type ProprietaImport = "FP" | "CV";

export type RigaGrezza = {
  foglio: ProprietaImport;
  numeroRiga: number; // 1-based, riga reale nel foglio Excel (header=1)
  skuCode: string;
  artista: string | null;
  opera: string | null;
  larghezza: number | null;
  altezza: number | null;
  supporto: string | null;
  anno: string | null;
  note: string | null;
  quantita: number;
  valoreCarico: number | null; // solo foglio FP (COSTO UNITARIO) - CV non ce l'ha
  prezzoEbay: number | null;
  prezzoCatawiki: number | null;
  riservaCatawiki: number | null; // RISERVA_CATAWIKI_VALORE (l'importo, non lo switch SI/NO)
};

export type ErroreRigaImport = {
  foglio: ProprietaImport;
  numeroRiga: number;
  skuCode: string | null;
  motivo: string;
};

const NOMI_FOGLIO: Record<ProprietaImport, string> = {
  FP: "STOCK FP",
  CV: "STOCK FOGLI CV",
};

function normalizzaHeader(h: unknown): string {
  return String(h ?? "").trim().toUpperCase();
}

function trovaFoglio(wb: XLSX.WorkBook, nomeCercato: string): XLSX.WorkSheet | null {
  const target = normalizzaHeader(nomeCercato);
  const nomeReale = wb.SheetNames.find((n) => normalizzaHeader(n) === target);
  return nomeReale ? wb.Sheets[nomeReale] : null;
}

function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function testoONull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Legge un foglio grezzo (STOCK FP o STOCK FOGLI CV) mappando le colonne per
// NOME (non per lettera/posizione) - le lettere di colonna sono note per
// andare alla deriva nel tempo in questo progetto (vedi
// nota_IMPORTANTE_lettere_di_colonna in 03_master_excel_struttura.yaml),
// il nome invece resta stabile.
function leggiFoglio(
  wb: XLSX.WorkBook,
  foglio: ProprietaImport,
  errori: ErroreRigaImport[]
): RigaGrezza[] {
  const nomeFoglio = NOMI_FOGLIO[foglio];
  const sheet = trovaFoglio(wb, nomeFoglio);
  if (!sheet) {
    errori.push({
      foglio,
      numeroRiga: 0,
      skuCode: null,
      motivo: `Foglio "${nomeFoglio}" non trovato nel file caricato.`,
    });
    return [];
  }

  const righeGrezze = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  if (righeGrezze.length === 0) return [];

  const header = righeGrezze[0].map(normalizzaHeader);
  const indiceColonna = (nome: string): number => header.indexOf(nome);

  const colQuantita = foglio === "FP" ? indiceColonna("INV") : indiceColonna("QTY");
  const colArtista = indiceColonna("ARTISTA");
  const colOpera = indiceColonna("OPERA");
  const colL = indiceColonna("L");
  const colH = indiceColonna("H");
  const colS = indiceColonna("S");
  const colNote = indiceColonna("NOTE");
  const colSku = indiceColonna("SKU");
  const colRiservaValore = indiceColonna("RISERVA_CATAWIKI_VALORE");
  const colPrezzoCatawiki = indiceColonna("PREZZO_CATAWIKI");
  const colPrezzoEbay = indiceColonna("PREZZO_EBAY");
  const colAnno = indiceColonna("ANNO");
  const colCostoUnitario = foglio === "FP" ? indiceColonna("COSTO UNITARIO") : -1;

  if (colQuantita < 0 || colArtista < 0 || colOpera < 0 || colSku < 0) {
    errori.push({
      foglio,
      numeroRiga: 1,
      skuCode: null,
      motivo: `Foglio "${nomeFoglio}": intestazioni attese non trovate (quantita'/artista/opera/sku). Struttura del file diversa dal previsto, verificare l'header prima di importare.`,
    });
    return [];
  }

  const risultato: RigaGrezza[] = [];
  const skuVistiInQuestoFoglio = new Set<string>();

  for (let i = 1; i < righeGrezze.length; i++) {
    const numeroRiga = i + 1; // 1-based reale nel foglio (riga 1 = header)
    const r = righeGrezze[i];
    if (!r || r.every((v) => v === null || v === "")) continue; // riga completamente vuota

    const skuRaw = testoONull(r[colSku]);
    // Sku vuoto (es. righe ETIC... etichette vintage) o sentinella IGNORA:
    // escluse sempre, vedi 02_sku_foto_2.yaml/sku.regole.
    if (!skuRaw || skuRaw.toUpperCase() === "IGNORA") continue;

    if (skuVistiInQuestoFoglio.has(skuRaw)) {
      errori.push({
        foglio,
        numeroRiga,
        skuCode: skuRaw,
        motivo: `SKU duplicato nello stesso foglio (${nomeFoglio}) - solo la prima occorrenza e' stata considerata.`,
      });
      continue;
    }
    skuVistiInQuestoFoglio.add(skuRaw);

    const quantita = numeroONull(r[colQuantita]);
    const artista = testoONull(r[colArtista]);
    const opera = testoONull(r[colOpera]);

    if (!artista || !opera) {
      errori.push({
        foglio,
        numeroRiga,
        skuCode: skuRaw,
        motivo: "Artista o Opera mancante - riga scartata.",
      });
      continue;
    }

    risultato.push({
      foglio,
      numeroRiga,
      skuCode: skuRaw,
      artista,
      opera,
      larghezza: colL >= 0 ? numeroONull(r[colL]) : null,
      altezza: colH >= 0 ? numeroONull(r[colH]) : null,
      supporto: colS >= 0 ? testoONull(r[colS]) : null,
      anno: colAnno >= 0 ? testoONull(r[colAnno]) : null,
      note: colNote >= 0 ? testoONull(r[colNote]) : null,
      quantita: quantita ?? 0,
      valoreCarico: colCostoUnitario >= 0 ? numeroONull(r[colCostoUnitario]) : null,
      prezzoEbay: colPrezzoEbay >= 0 ? numeroONull(r[colPrezzoEbay]) : null,
      prezzoCatawiki: colPrezzoCatawiki >= 0 ? numeroONull(r[colPrezzoCatawiki]) : null,
      riservaCatawiki: colRiservaValore >= 0 ? numeroONull(r[colRiservaValore]) : null,
    });
  }

  return risultato;
}

export function estraiRigheGrezze(buffer: Buffer): {
  righe: RigaGrezza[];
  errori: ErroreRigaImport[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const errori: ErroreRigaImport[] = [];
  const righeFp = leggiFoglio(wb, "FP", errori);
  const righeCv = leggiFoglio(wb, "CV", errori);
  return { righe: [...righeFp, ...righeCv], errori };
}
