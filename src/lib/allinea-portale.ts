// "Allinea con il portale" (2026-10-27): legge i file che il portale stesso
// produce e li riduce a una lista compatta di voci. Funzioni pure: vengono
// eseguite nel browser (il file Shopify e' grosso, al server arrivano solo le voci).
import { leggiCsv } from "@/lib/csv";

export type VoceAllineamento = {
  sku: string;
  idPortale: string; // Shopify: handle. eBay: numero oggetto
  titolo: string | null;
  quantita: number;
  prezzo: number | null;
  attivo: boolean; // online e visibile (Shopify: stato active; eBay: annuncio attivo)
};

export type LetturaAllineamento = { voci: VoceAllineamento[]; avvisi: string[]; errore?: string };

function numero(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function indiciColonne(intestazione: string[], nomi: string[]): number[] | null {
  const idx = nomi.map((n) => intestazione.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase()));
  return idx.every((i) => i >= 0) ? idx : null;
}

// Esportazione prodotti di Shopify (Prodotti → Esporta → tutti i prodotti, CSV).
export function leggiExportShopify(testo: string): LetturaAllineamento {
  const righe = leggiCsv(testo, ",");
  if (righe.length < 2) return { voci: [], avvisi: [], errore: "Il file e' vuoto." };
  const ix = indiciColonne(righe[0], ["Handle", "Title", "Variant SKU", "Variant Inventory Qty", "Variant Price", "Status"]);
  if (!ix) return { voci: [], avvisi: [], errore: "Questo non sembra l'export prodotti di Shopify (mancano Handle, Variant SKU, Status...)." };
  const [hH, hT, hS, hQ, hP, hSt] = ix;
  const titoli = new Map<string, string>();
  const statoProdotto = new Map<string, string>();
  for (const r of righe.slice(1)) {
    const h = (r[hH] ?? "").trim();
    if (!h) continue;
    if ((r[hT] ?? "").trim()) titoli.set(h, r[hT].trim());
    if ((r[hSt] ?? "").trim()) statoProdotto.set(h, r[hSt].trim().toLowerCase());
  }
  const voci: VoceAllineamento[] = [];
  const avvisi: string[] = [];
  const visti = new Set<string>();
  for (const r of righe.slice(1)) {
    const codice = (r[hS] ?? "").trim();
    const handle = (r[hH] ?? "").trim();
    if (!codice || !handle) continue;
    const chiave = codice.toLowerCase();
    if (visti.has(chiave)) {
      avvisi.push(`Sku ${codice} compare piu' volte: uso la prima.`);
      continue;
    }
    visti.add(chiave);
    voci.push({
      sku: codice,
      idPortale: handle,
      titolo: titoli.get(handle) ?? null,
      quantita: Math.max(0, Math.trunc(numero(r[hQ]) ?? 0)),
      prezzo: numero(r[hP]),
      attivo: (statoProdotto.get(handle) ?? "active") === "active",
    });
  }
  return { voci, avvisi };
}

// Rapporto "Tutti gli annunci attivi" di eBay (separatore ;). Solo il sito IT:
// gli altri siti sono copie gestite a parte.
export function leggiReportEbay(testo: string): LetturaAllineamento {
  const righe = leggiCsv(testo, ";");
  if (righe.length < 2) return { voci: [], avvisi: [], errore: "Il file e' vuoto." };
  const ix = indiciColonne(righe[0], ["Item number", "Custom label (SKU)", "Available quantity", "Current price", "Listing site"]);
  if (!ix) return { voci: [], avvisi: [], errore: "Questo non sembra il rapporto annunci attivi di eBay (mancano Item number, Custom label (SKU)...)." };
  const [iN, iS, iQ, iP, iL] = ix;
  const iT = righe[0].findIndex((h) => h.trim().toLowerCase() === "title");
  const voci: VoceAllineamento[] = [];
  const avvisi: string[] = [];
  const visti = new Set<string>();
  let senzaSku = 0;
  for (const r of righe.slice(1)) {
    if ((r[iL] ?? "").trim().toUpperCase() !== "IT") continue;
    const codice = (r[iS] ?? "").trim();
    if (!codice) {
      senzaSku++;
      continue;
    }
    const chiave = codice.toLowerCase();
    if (visti.has(chiave)) {
      avvisi.push(`Sku ${codice} ha piu' annunci attivi su eBay: uso il primo.`);
      continue;
    }
    visti.add(chiave);
    voci.push({
      sku: codice,
      idPortale: (r[iN] ?? "").trim(),
      titolo: iT >= 0 ? (r[iT] ?? "").trim() || null : null,
      quantita: Math.max(0, Math.trunc(numero(r[iQ]) ?? 0)),
      prezzo: numero(r[iP]),
      attivo: true,
    });
  }
  if (senzaSku > 0) avvisi.push(`${senzaSku} annunci eBay IT senza Custom label (SKU): ignorati.`);
  return { voci, avvisi };
}
