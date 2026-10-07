// Lettura dal Master Excel (foglio MASTER) dello stato dei portali statici:
//  - colonne PUB_<PORTALE> = 0  -> sku BLOCCATO su quel portale
//  - colonne CARICATO_<PORTALE> = 1 (o data / SI) -> sku gia' ONLINE su quel
//    portale
// Verificato sul file reale v31 (2026-10-07): foglio "MASTER", colonne PUB_*
// con 0 oppure vuoto, CARICATO_* con 1 oppure vuoto. Le colonne si cercano
// per NOME (le lettere cambiano nel tempo), come in excel-import.ts.
import * as XLSX from "xlsx";

export const PORTALI_MASTER = [
  { nome: "Shopify", pub: "PUB_SHOPIFY", caricato: "CARICATO_SHOPIFY" },
  { nome: "eBay", pub: "PUB_EBAY", caricato: "CARICATO_EBAY" },
  { nome: "Etsy", pub: "PUB_ETSY", caricato: "CARICATO_ETSY" },
  { nome: "Subito", pub: "PUB_SUBITO", caricato: "CARICATO_SUBITO" },
] as const;

export type StatoSkuMaster = {
  skuCode: string;
  // nome portale -> true
  bloccato: Record<string, boolean>;
  caricato: Record<string, boolean>;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function eZero(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return v === 0;
  const s = norm(v);
  return s === "0" || s === "NO" || s === "FALSE";
}

function eAcceso(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return v > 0;
  if (v instanceof Date) return true;
  const s = norm(v);
  return s !== "" && s !== "0" && s !== "NO" && s !== "FALSE";
}

export function leggiStatoPortaliMaster(buffer: Buffer): StatoSkuMaster[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nome = wb.SheetNames.find((n) => norm(n) === "MASTER");
  if (!nome) throw new Error('Nel file non c\'e\' il foglio "MASTER".');
  const righe = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, defval: null });
  if (righe.length < 2) throw new Error("Il foglio MASTER e' vuoto.");
  const header = righe[0].map(norm);
  const colSku = header.indexOf("SKU");
  if (colSku < 0) throw new Error('Nel foglio MASTER manca la colonna "SKU".');
  const colonne = PORTALI_MASTER.map((p) => ({
    nome: p.nome,
    pub: header.indexOf(p.pub),
    caricato: header.indexOf(p.caricato),
  }));
  if (colonne.every((c) => c.pub < 0 && c.caricato < 0)) {
    throw new Error("Nel foglio MASTER non trovo le colonne PUB_* / CARICATO_*.");
  }

  // Lo stesso sku puo' comparire su due righe (foglio FP e foglio CV): vale
  // "bloccato se almeno una riga e' 0", "caricato se almeno una riga e' acceso".
  const perSku = new Map<string, StatoSkuMaster>();
  for (const r of righe.slice(1)) {
    const codice = String(r[colSku] ?? "").trim();
    if (!codice || norm(codice) === "IGNORA") continue;
    let st = perSku.get(codice);
    if (!st) {
      st = { skuCode: codice, bloccato: {}, caricato: {} };
      perSku.set(codice, st);
    }
    for (const c of colonne) {
      if (c.pub >= 0 && eZero(r[c.pub])) st.bloccato[c.nome] = true;
      if (c.caricato >= 0 && eAcceso(r[c.caricato])) st.caricato[c.nome] = true;
    }
  }
  return Array.from(perSku.values());
}
