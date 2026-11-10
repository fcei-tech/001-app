// Regole dei prezzi in un posto solo (2026-10-19, rifatto in Release 9 il
// 2026-11-10): da dove viene il prezzo di ogni portale e quali soglie valgono.
// Sono TESTI e calcoli di spiegazione per l'interfaccia (righe sotto i campi
// prezzo nella scheda sku, pagina "Regole prezzi"). I numeri arrivano dalle
// regole in vigore (RegolePrezzi, modificabili da Impostazioni), le stesse
// usate per generare i file: spiegazione e file non possono divergere.

import { prezzoPerPortaleConOrigine } from "@/lib/esposizione";
import { REGOLE_PREZZI_STANDARD, type RegolePrezzi } from "@/lib/regole-prezzi-config";

// Valore standard (la regola in uso e' RegolePrezzi.offertaMinimaEbayPercentuale).
export const EBAY_OFFERTA_MINIMA_PERCENTUALE = REGOLE_PREZZI_STANDARD.offertaMinimaEbayPercentuale;

export function formatEuroTesto(n: number): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function formatNumeroTesto(n: number): string {
  return String(n).replace(".", ",");
}

function numero(v: string | undefined): number | null {
  const t = (v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ValoriPrezziScheda = {
  prezzoEbay: string;
  prezzoCatawiki: string;
  riservaCatawiki: string;
  prezzoShopify?: string;
  prezzoSubito?: string;
  prezzoBidspirit?: string;
  riservaBidspirit?: string;
};

// Righe di spiegazione sotto i campi prezzo (valori calcolati sul testo che
// l'utente sta scrivendo).
export function righeSpiegazionePrezzi(
  valori: ValoriPrezziScheda,
  regole: RegolePrezzi = REGOLE_PREZZI_STANDARD
): {
  ebay: string;
  shopify: string;
  subito: string;
  catawiki: string;
  riserva: string;
  bidspirit: string;
  riservaBidspirit: string;
} {
  const pe = numero(valori.prezzoEbay);
  const pc = numero(valori.prezzoCatawiki);
  const rc = numero(valori.riservaCatawiki);
  const pb = numero(valori.prezzoBidspirit);
  const rb = numero(valori.riservaBidspirit);
  const soglia = regole.sogliaMinimaCatawiki;
  const pctRiserva = Math.round(regole.moltiplicatoreRiservaCatawiki * 100);

  const ebay =
    pe === null
      ? "Senza prezzo eBay lo sku non va su eBay. Shopify e Subito vanno solo se hanno un loro prezzo."
      : `Offerta minima eBay ${formatEuroTesto(Math.round(pe * regole.offertaMinimaEbayPercentuale) / 100)} (${formatNumeroTesto(regole.offertaMinimaEbayPercentuale)}%). Se Shopify o Subito sono vuoti, partono da questo prezzo.`;

  const sh = prezzoPerPortaleConOrigine("Shopify", { prezzoEbay: valori.prezzoEbay, prezzoShopify: valori.prezzoShopify }, regole);
  const shopify =
    sh.origine === "campo"
      ? `Nel file Shopify va questo prezzo (${formatEuroTesto(sh.prezzo ?? 0)}).`
      : sh.prezzo !== null
        ? `Campo vuoto: nel file va ${formatEuroTesto(sh.prezzo)} (prezzo eBay × ${formatNumeroTesto(regole.scontoShopify)}, arrotondato all'euro per eccesso).`
        : "Campo vuoto e manca il prezzo eBay: lo sku non va su Shopify.";

  const su = prezzoPerPortaleConOrigine("Subito", { prezzoEbay: valori.prezzoEbay, prezzoSubito: valori.prezzoSubito }, regole);
  const subito =
    su.origine === "campo"
      ? `Su Subito va questo prezzo (${formatEuroTesto(su.prezzo ?? 0)}).`
      : su.prezzo !== null
        ? `Campo vuoto: su Subito va ${formatEuroTesto(su.prezzo)} (prezzo eBay così com'è).`
        : "Campo vuoto e manca il prezzo eBay: lo sku non va su Subito.";

  const catawiki =
    pc === null
      ? "Senza prezzo Catawiki lo sku non va su Catawiki."
      : pc < soglia
        ? `Stima del lotto. Sotto ${formatNumeroTesto(soglia)} € Catawiki scarta il lotto (la soglia si controlla dopo l'eventuale % del batch).`
        : `Stima del lotto: ${formatEuroTesto(pc)} (il batch può aggiungere una percentuale). Sotto ${formatNumeroTesto(soglia)} € Catawiki scarta il lotto.`;

  const riserva =
    rc !== null
      ? `Nel file Catawiki la riserva sarà ${formatEuroTesto(rc)} (se non ne scrivi un'altra sul lotto nel batch).`
      : pc !== null && pc >= soglia
        ? `Campo vuoto: nel file la riserva sarà il ${pctRiserva}% della stima (${formatEuroTesto(Math.round(pc * regole.moltiplicatoreRiservaCatawiki * 100) / 100)}), a meno che la scrivi sul lotto nel batch.`
        : `Campo vuoto: nel file la riserva sarà il ${pctRiserva}% della stima, a meno che la scrivi sul lotto nel batch.`;

  const bidspirit =
    pb !== null
      ? `Nel file Bidspirit va questo prezzo (${formatEuroTesto(pb)}).`
      : pc !== null
        ? `Campo vuoto: Bidspirit usa il prezzo Catawiki (${formatEuroTesto(pc)}).`
        : "Campo vuoto e manca il prezzo Catawiki: lo sku non va su Bidspirit.";

  const riservaBidspirit =
    rb !== null
      ? `Nel file Bidspirit la riserva sarà ${formatEuroTesto(rb)} (se non ne scrivi un'altra sul lotto nel batch).`
      : rc !== null
        ? `Campo vuoto: Bidspirit usa la riserva Catawiki (${formatEuroTesto(rc)}).`
        : `Campo vuoto: Bidspirit usa la riserva Catawiki, altrimenti il ${pctRiserva}% della stima.`;

  return { ebay, shopify, subito, catawiki, riserva, bidspirit, riservaBidspirit };
}
