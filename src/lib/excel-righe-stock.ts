// File "righe da riportare" per STOCK FP / STOCK FOGLI CV (Release 10).
// BATCH non tocca il file Excel dell'utente: produce un .xlsx con due fogli,
// colonne nello STESSO ORDINE delle intestazioni reali, con le sole righe
// degli sku nuovi; chi usa Excel le copia sui suoi fogli. Le colonne che nei
// file reali sono formule restano vuote (VALORE STOCK, STIMA VENDITA ...,
// RISERVA_CATAWIKI si/no, # CATA EBAY DISP): ci pensa il suo Excel.
import * as XLSX from "xlsx";

export const NOME_FOGLIO_FP = "STOCK FP";
export const NOME_FOGLIO_CV = "STOCK FOGLI CV";

export const INTESTAZIONI_FP = [
  "INV", "ARTISTA", "OPERA", "L", "H", "S", "COSTO UNITARIO", "VALORE STOCK", "STIMA VENDITA CAD",
  "STIMA VENDITA TOT", "NOTE", "SKU", "RISERVA_CATAWIKI_VALORE", "PREZZO_CATAWIKI", "RISERVA_CATAWIKI",
  "PREZZO_EBAY", "PREZZO_SUBITO", "ANNO",
] as const;

export const INTESTAZIONI_CV = [
  "QTY", "ARTISTA", "OPERA", "L", "H", "S", "#", "CATA", "EBAY", "DISP", "STIMA VENDITA CAD",
  "STIMA VENDITA TOT", "NOTE", "SKU", "RISERVA_CATAWIKI_VALORE", "PREZZO_CATAWIKI", "RISERVA_CATAWIKI",
  "PREZZO_EBAY", "PREZZO_SUBITO", "ANNO",
] as const;

export type RigaStock = {
  foglio: "FP" | "CV";
  skuCode: string;
  quantita: number;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  note: string | null;
  valoreCarico: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
  prezzoEbay: string | null;
  prezzoSubito: string | null;
};

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function valoriRiga(r: RigaStock): Record<string, string | number | null> {
  const comune = {
    ARTISTA: r.artista,
    OPERA: r.opera,
    L: num(r.larghezza),
    H: num(r.altezza),
    S: r.supporto,
    NOTE: r.note,
    SKU: r.skuCode,
    RISERVA_CATAWIKI_VALORE: num(r.riservaCatawiki),
    PREZZO_CATAWIKI: num(r.prezzoCatawiki),
    PREZZO_EBAY: num(r.prezzoEbay),
    PREZZO_SUBITO: num(r.prezzoSubito),
    ANNO: r.anno,
  };
  return r.foglio === "FP" ? { INV: r.quantita, "COSTO UNITARIO": num(r.valoreCarico), ...comune } : { QTY: r.quantita, ...comune };
}

function foglio(intestazioni: readonly string[], righe: RigaStock[]): XLSX.WorkSheet {
  const matrice: (string | number | null)[][] = [[...intestazioni]];
  for (const r of righe) {
    const v = valoriRiga(r);
    matrice.push(intestazioni.map((h) => v[h] ?? null));
  }
  const ws = XLSX.utils.aoa_to_sheet(matrice);
  ws["!cols"] = intestazioni.map((h) => ({ wch: h === "OPERA" ? 40 : h === "ARTISTA" ? 24 : h === "NOTE" ? 28 : 14 }));
  return ws;
}

export function costruisciFileRighe(righe: RigaStock[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio(INTESTAZIONI_FP, righe.filter((r) => r.foglio === "FP")), NOME_FOGLIO_FP);
  XLSX.utils.book_append_sheet(wb, foglio(INTESTAZIONI_CV, righe.filter((r) => r.foglio === "CV")), NOME_FOGLIO_CV);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
