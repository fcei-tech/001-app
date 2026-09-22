import * as XLSX from "xlsx";

export type RigaFotoMaster = { skuCode: string; urls: string[] };
export type ErroreFotoMaster = { skuCode: string | null; motivo: string };

const NOME_FOGLIO = "MASTER";
const SEPARATORE_URL = "|";

function normalizzaHeader(h: unknown): string {
  return String(h ?? "").trim().toUpperCase();
}
function trovaFoglio(wb: XLSX.WorkBook, nomeCercato: string): XLSX.WorkSheet | null {
  const target = normalizzaHeader(nomeCercato);
  const nomeReale = wb.SheetNames.find((n) => normalizzaHeader(n) === target);
  return nomeReale ? wb.Sheets[nomeReale] : null;
}
function testoONull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function estraiUrlDaMaster(buffer: Buffer): { righe: RigaFotoMaster[]; errori: ErroreFotoMaster[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const errori: ErroreFotoMaster[] = [];
  const sheet = trovaFoglio(wb, NOME_FOGLIO);
  if (!sheet) {
    errori.push({ skuCode: null, motivo: `Foglio "${NOME_FOGLIO}" non trovato nel file caricato.` });
    return { righe: [], errori };
  }
  const righeGrezze = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (righeGrezze.length === 0) return { righe: [], errori };

  const header = righeGrezze[0].map(normalizzaHeader);
  const colSku = header.indexOf("SKU");
  const colUrl = header.indexOf("URL_STORICA");
  if (colSku < 0 || colUrl < 0) {
    errori.push({ skuCode: null, motivo: `Foglio "${NOME_FOGLIO}": colonne SKU/URL_STORICA non trovate nell'header.` });
    return { righe: [], errori };
  }

  const urlPerSku = new Map<string, string>();
  for (let i = 1; i < righeGrezze.length; i++) {
    const r = righeGrezze[i];
    if (!r) continue;
    const skuRaw = testoONull(r[colSku]);
    if (!skuRaw || skuRaw.toUpperCase() === "IGNORA") continue;
    const urlRaw = testoONull(r[colUrl]);
    if (!urlRaw) continue;
    const esistente = urlPerSku.get(skuRaw);
    if (esistente !== undefined && esistente !== urlRaw) {
      errori.push({ skuCode: skuRaw, motivo: "URL_STORICA diversa tra due righe Master dello stesso sku - presa la prima, verificare manualmente." });
      continue;
    }
    urlPerSku.set(skuRaw, urlRaw);
  }

  const righe: RigaFotoMaster[] = [...urlPerSku.entries()].map(([skuCode, urlConcat]) => ({
    skuCode,
    urls: urlConcat.split(SEPARATORE_URL).map((u) => u.trim()).filter((u) => u.length > 0),
  }));
  return { righe, errori };
}
