// Regole pure (nessun database) del registro "esposto" dei portali statici:
// quanti pezzi caricare su un portale in base al disponibile libero.
//
// Obiettivo (2026-10-05): non mostrare disponibilita' elevate al cliente
// finale (la rarita' percepita sostiene vendite e prezzi) e ridurre la
// manutenzione dei portali. Le fasce sono quelle gia' in uso nel Master
// (CONFIG_GENERALE: qty_soglia_1_pezzo_max=4, qty_soglia_2_pezzi_min=5,
// qty_soglia_2_pezzi_max=8, qty_soglia_3_pezzi_min=9).

import { calcolaPrezzoShopify } from "@/lib/shopify-export";
import { REGOLE_PREZZI_STANDARD, type FasciaQuantita, type RegolePrezzi } from "@/lib/regole-prezzi-config";

export const FASCE_QUANTITA = [
  { fino: 4, pezzi: 1 },
  { fino: 8, pezzi: 2 },
  { fino: Infinity, pezzi: 3 },
] as const;

export const QUANTITA_MASSIMA_VISIBILE = 3;

// Disponibile libero = totale a magazzino meno quanto e' impegnato nelle
// aste (mai negativo).
export function disponibileLibero(disponibile: number, impegnato: number): number {
  return Math.max(0, disponibile - impegnato);
}

// Impostazioni del canale (jsonb): "quantitaFissa" (numero > 0) forza lo
// stesso numero di pezzi qualunque sia il disponibile - usato da Subito (1).
export function quantitaDaCaricare(
  libero: number,
  impostazioniCanale: unknown,
  fasce: FasciaQuantita[] = REGOLE_PREZZI_STANDARD.fasceQuantita
): number {
  if (libero <= 0) return 0;
  const fissa =
    impostazioniCanale && typeof impostazioniCanale === "object"
      ? (impostazioniCanale as Record<string, unknown>).quantitaFissa
      : undefined;
  if (typeof fissa === "number" && fissa > 0) return Math.min(fissa, libero);
  for (const f of fasce) {
    if (f.fino === null || libero <= f.fino) return Math.min(f.pezzi, libero);
  }
  return QUANTITA_MASSIMA_VISIBILE;
}

// --- Prezzo per portale ------------------------------------------------------
// Release 9 (2026-11-10): ogni portale che di norma DERIVA il prezzo da un
// altro puo' avere il suo campo sullo sku. Se e' compilato (> 0) vale quello;
// se e' vuoto vale la regola di sempre:
//  - Shopify: campo "Prezzo Shopify", altrimenti ROUNDUP(prezzo eBay x sconto)
//    all'euro (sconto modificabile, standard 0,9)
//  - Subito: campo "Prezzo Subito", altrimenti prezzo eBay cosi' com'e'
//  - eBay, Etsy: prezzo eBay cosi' com'e'
// Mai un prezzo inventato: se manca anche il prezzo eBay, null (per quel
// portale non c'e' prezzo).
export type PrezziSkuPerPortale = {
  prezzoEbay: string | number | null | undefined;
  prezzoShopify?: string | number | null;
  prezzoSubito?: string | number | null;
};

export type OrigineFallbackPrezzo = "campo" | "regola" | null;

function numeroPositivo(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const testo = String(v).trim().replace(",", ".");
  const p = Number(testo);
  if (!testo || !Number.isFinite(p) || p <= 0) return null;
  return p;
}

export function prezzoPerPortaleConOrigine(
  nomePortale: string,
  prezzi: PrezziSkuPerPortale,
  regole: RegolePrezzi = REGOLE_PREZZI_STANDARD
): { prezzo: number | null; origine: OrigineFallbackPrezzo } {
  const proprio =
    nomePortale === "Shopify" ? numeroPositivo(prezzi.prezzoShopify) : nomePortale === "Subito" ? numeroPositivo(prezzi.prezzoSubito) : null;
  if (proprio !== null) return { prezzo: Math.round(proprio * 100) / 100, origine: "campo" };
  const pe = numeroPositivo(prezzi.prezzoEbay);
  if (pe === null) return { prezzo: null, origine: null };
  if (nomePortale === "Shopify") return { prezzo: calcolaPrezzoShopify(String(pe), regole.scontoShopify), origine: "regola" };
  return { prezzo: Math.round(pe * 100) / 100, origine: "regola" };
}

export function prezzoPerPortale(nomePortale: string, prezzi: PrezziSkuPerPortale, regole: RegolePrezzi = REGOLE_PREZZI_STANDARD): number | null {
  return prezzoPerPortaleConOrigine(nomePortale, prezzi, regole).prezzo;
}

export function prezziDiversi(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  return Math.round(a * 100) !== Math.round(b * 100);
}

export type MotivoDaFare = "nuovo" | "tornato" | "esaurito" | "bloccato" | "ritirato" | "abbassare" | "prezzo";
export type TipoDaFare = "aggiungere" | "togliere" | "abbassare" | "riprezzare";

export type RigaDaFare = {
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  tipo: TipoDaFare;
  motivo: MotivoDaFare;
  quantitaCaricata: number;
  disponibileLibero: number;
  quantitaTarget: number;
  // Prezzo registrato come online e prezzo di oggi per quel portale (null se non
  // disponibili). Si mostrano in "riprezzare"; alla conferma di aggiungere/
  // riprezzare il prezzo di oggi diventa quello registrato.
  prezzoCaricato: number | null;
  prezzoTarget: number | null;
};

export const ETICHETTA_MOTIVO: Record<MotivoDaFare, string> = {
  nuovo: "Nuovo",
  tornato: "Di nuovo disponibile",
  esaurito: "Esaurito",
  bloccato: "Bloccato su questo portale",
  ritirato: "Ritirato da te",
  abbassare: "Quantità sopra il disponibile",
  prezzo: "Prezzo cambiato",
};

// --- Annulla (2026-10-07) --------------------------------------------------
// Ogni conferma / blocco in blocco restituisce lo "stato prima e dopo" degli
// sku toccati: serve al bottone Annulla. Annulla e' tutto-o-niente e viene
// rifiutato se nel frattempo uno di quegli sku e' stato cambiato da altri.
// prezzoPrima/prezzoDopo: prezzo caricato registrato (assenti = non toccato).
export type ModificaEsposizione = {
  skuId: number;
  prima: number | null; // null = nessuna riga
  dopo: number;
  prezzoPrima?: number | null;
  prezzoDopo?: number | null;
};
// motivoPrima: "blocco" | "ritiro" com'era prima (serve a ripristinarlo).
export type ModificaBlocco = { skuId: number; prima: boolean; dopo: boolean; motivoPrima?: string };
export type Annullabile =
  | { tipo: "esposizione"; canaleId: number; modifiche: ModificaEsposizione[] }
  | { tipo: "blocco"; canaleId: number; modifiche: ModificaBlocco[] };
