// Regole pure (nessun database) del registro "esposto" dei portali statici:
// quanti pezzi caricare su un portale in base al disponibile libero.
//
// Obiettivo (2026-10-05): non mostrare disponibilita' elevate al cliente
// finale (la rarita' percepita sostiene vendite e prezzi) e ridurre la
// manutenzione dei portali. Le fasce sono quelle gia' in uso nel Master
// (CONFIG_GENERALE: qty_soglia_1_pezzo_max=4, qty_soglia_2_pezzi_min=5,
// qty_soglia_2_pezzi_max=8, qty_soglia_3_pezzi_min=9).

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
export function quantitaDaCaricare(libero: number, impostazioniCanale: unknown): number {
  if (libero <= 0) return 0;
  const fissa =
    impostazioniCanale && typeof impostazioniCanale === "object"
      ? (impostazioniCanale as Record<string, unknown>).quantitaFissa
      : undefined;
  if (typeof fissa === "number" && fissa > 0) return Math.min(fissa, libero);
  for (const f of FASCE_QUANTITA) {
    if (libero <= f.fino) return Math.min(f.pezzi, libero);
  }
  return QUANTITA_MASSIMA_VISIBILE;
}

export type MotivoDaFare = "nuovo" | "tornato" | "esaurito" | "bloccato" | "abbassare";
export type TipoDaFare = "aggiungere" | "togliere" | "abbassare";

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
};

export const ETICHETTA_MOTIVO: Record<MotivoDaFare, string> = {
  nuovo: "Nuovo",
  tornato: "Di nuovo disponibile",
  esaurito: "Esaurito",
  bloccato: "Bloccato su questo portale",
  abbassare: "Quantità sopra il disponibile",
};

// --- Annulla (2026-10-07) --------------------------------------------------
// Ogni conferma / blocco in blocco restituisce lo "stato prima e dopo" degli
// sku toccati: serve al bottone Annulla. Annulla e' tutto-o-niente e viene
// rifiutato se nel frattempo uno di quegli sku e' stato cambiato da altri.
export type ModificaEsposizione = { skuId: number; prima: number | null; dopo: number }; // prima null = nessuna riga
export type ModificaBlocco = { skuId: number; prima: boolean; dopo: boolean };
export type Annullabile =
  | { tipo: "esposizione"; canaleId: number; modifiche: ModificaEsposizione[] }
  | { tipo: "blocco"; canaleId: number; modifiche: ModificaBlocco[] };
