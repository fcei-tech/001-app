// Regole prezzi MODIFICABILI dall'app (Release 9, 2026-11-10). Modulo puro
// (nessun database, usabile anche nei componenti client): i valori standard
// sono quelli di sempre; la riga "regole_prezzi" di impostazioni_app (vedi
// src/db/impostazioni-app-queries.ts) li sovrascrive uno per uno.
//
// Valori standard = quelli che prima erano costanti nel codice:
//  - scontoShopify 0,9: prezzo Shopify = ROUNDUP(prezzo eBay x 0,9)
//  - offertaMinimaEbayPercentuale 50: offerta minima eBay = 50% del prezzo
//  - sogliaMinimaCatawiki 200: sotto questa stima il lotto Catawiki e' scartato
//  - moltiplicatoreRiservaCatawiki 0,5: riserva di ripiego = 50% della stima
//  - fasceQuantita: disponibile libero -> pezzi da caricare sui portali fissi

export type FasciaQuantita = { fino: number | null; pezzi: number }; // fino null = senza limite

export type RegolePrezzi = {
  scontoShopify: number;
  offertaMinimaEbayPercentuale: number;
  sogliaMinimaCatawiki: number;
  moltiplicatoreRiservaCatawiki: number;
  fasceQuantita: FasciaQuantita[];
};

export const REGOLE_PREZZI_STANDARD: RegolePrezzi = {
  scontoShopify: 0.9,
  offertaMinimaEbayPercentuale: 50,
  sogliaMinimaCatawiki: 200,
  moltiplicatoreRiservaCatawiki: 0.5,
  fasceQuantita: [
    { fino: 4, pezzi: 1 },
    { fino: 8, pezzi: 2 },
    { fino: null, pezzi: 3 },
  ],
};

export const CHIAVE_REGOLE_PREZZI = "regole_prezzi";

function numeroValido(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= min && v <= max ? v : null;
}

function fasceValide(v: unknown): FasciaQuantita[] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out: FasciaQuantita[] = [];
  let precedente = 0;
  for (let i = 0; i < 3; i++) {
    const f = v[i] as Record<string, unknown> | null;
    if (!f || typeof f !== "object") return null;
    const pezzi = numeroValido(f.pezzi, 1, 99);
    if (pezzi === null || !Number.isInteger(pezzi)) return null;
    if (i < 2) {
      const fino = numeroValido(f.fino, 1, 100000);
      if (fino === null || !Number.isInteger(fino) || fino <= precedente) return null;
      precedente = fino;
      out.push({ fino, pezzi });
    } else {
      out.push({ fino: null, pezzi });
    }
  }
  return out;
}

// Legge il valore salvato (qualunque cosa ci sia nel database) e restituisce
// SEMPRE regole complete e valide: ogni campo mancante o fuori misura torna
// al valore standard, mai un errore.
export function normalizzaRegole(grezzo: unknown): RegolePrezzi {
  const g = grezzo && typeof grezzo === "object" ? (grezzo as Record<string, unknown>) : {};
  const s = REGOLE_PREZZI_STANDARD;
  return {
    scontoShopify: numeroValido(g.scontoShopify, 0.01, 1) ?? s.scontoShopify,
    offertaMinimaEbayPercentuale: numeroValido(g.offertaMinimaEbayPercentuale, 1, 100) ?? s.offertaMinimaEbayPercentuale,
    sogliaMinimaCatawiki: numeroValido(g.sogliaMinimaCatawiki, 0, 1000000) ?? s.sogliaMinimaCatawiki,
    moltiplicatoreRiservaCatawiki: numeroValido(g.moltiplicatoreRiservaCatawiki, 0.01, 10) ?? s.moltiplicatoreRiservaCatawiki,
    fasceQuantita: fasceValide(g.fasceQuantita) ?? s.fasceQuantita,
  };
}

export function eRegoleStandard(r: RegolePrezzi): boolean {
  return JSON.stringify(r) === JSON.stringify(REGOLE_PREZZI_STANDARD);
}
