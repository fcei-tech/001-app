// Regole dei prezzi in un posto solo (2026-10-19): da dove viene il prezzo di
// ogni portale e quali soglie valgono. Sono TESTI e calcoli di spiegazione per
// l'interfaccia (righe sotto i campi prezzo nella scheda sku, pagina "Regole
// prezzi"): i numeri vengono dalle stesse costanti usate dai file prodotti,
// cosi' se una costante cambia, cambia anche la spiegazione.

import { CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK, CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT } from "@/lib/catawiki-config";
import { SHOPIFY_SCONTO_SU_EBAY } from "@/lib/shopify-export";
import { prezzoPerPortale } from "@/lib/esposizione";

// Offerta minima accettata su eBay: percentuale del prezzo (regola del Master;
// l'output eBay del software non e' ancora costruito).
export const EBAY_OFFERTA_MINIMA_PERCENTUALE = 50;

export function formatEuroTesto(n: number): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function numero(v: string): number | null {
  const t = (v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Righe di spiegazione sotto i campi prezzo (valori calcolati sul testo che
// l'utente sta scrivendo).
export function righeSpiegazionePrezzi(valori: { prezzoEbay: string; prezzoCatawiki: string; riservaCatawiki: string }): {
  ebay: string;
  catawiki: string;
  riserva: string;
} {
  const pe = numero(valori.prezzoEbay);
  const pc = numero(valori.prezzoCatawiki);
  const rc = numero(valori.riservaCatawiki);

  const ebay =
    pe === null
      ? "Senza prezzo eBay lo sku non va su eBay, Shopify né Subito (non c'è nessun prezzo di ripiego)."
      : `Da questo prezzo: Shopify ${formatEuroTesto(prezzoPerPortale("Shopify", pe) ?? 0)} (×${String(SHOPIFY_SCONTO_SU_EBAY).replace(".", ",")}, arrotondato all'euro per eccesso) · Subito ${formatEuroTesto(pe)} · offerta minima eBay ${formatEuroTesto(Math.round(pe * EBAY_OFFERTA_MINIMA_PERCENTUALE) / 100)} (${EBAY_OFFERTA_MINIMA_PERCENTUALE}%).`;

  const catawiki =
    pc === null
      ? "Senza prezzo Catawiki lo sku non va su Catawiki."
      : pc < CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT
        ? `Stima del lotto. Sotto ${CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT} € Catawiki scarta il lotto (la soglia si controlla dopo l'eventuale % del batch).`
        : `Stima del lotto: ${formatEuroTesto(pc)} (il batch può aggiungere una percentuale). Sotto ${CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT} € Catawiki scarta il lotto.`;

  const riserva =
    rc !== null
      ? `Nel file Catawiki la riserva sarà ${formatEuroTesto(rc)} (se non ne scrivi un'altra sul lotto nel batch).`
      : pc !== null && pc >= CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT
      ? `Campo vuoto: nel file la riserva sarà il ${Math.round(CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK * 100)}% della stima (${formatEuroTesto(Math.round(pc * CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK * 100) / 100)}), a meno che la scrivi sul lotto nel batch.`
      : `Campo vuoto: nel file la riserva sarà il ${Math.round(CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK * 100)}% della stima, a meno che la scrivi sul lotto nel batch.`;

  return { ebay, catawiki, riserva };
}
