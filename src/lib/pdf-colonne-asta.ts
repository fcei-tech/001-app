// Colonne del PDF "lista lotti" delle aste fisiche (2026-11-25). La scelta e'
// per PORTALE (Cambi, Bolaffi, Wannenes, Conto esposizione...) e sta in
// canali.impostazioni.pdfColonne. Nessuna dipendenza dal database: la usano
// sia la finestra (client) sia la generazione del PDF (server).
//
// Foto e' sempre la prima colonna. "Riserva proposta" e le colonne libere sono
// campi da compilare nel PDF (a video o a mano dopo la stampa).

export type IdColonnaPdf = "sku" | "artista" | "opera" | "misure" | "anno" | "supporto" | "condizione" | "riserva";

export const COLONNE_PDF: { id: IdColonnaPdf; etichetta: string; peso: number; compilabile?: boolean }[] = [
  { id: "sku", etichetta: "Sku", peso: 80 },
  { id: "artista", etichetta: "Artista", peso: 130 },
  { id: "opera", etichetta: "Opera", peso: 170 },
  { id: "misure", etichetta: "Misure", peso: 85 },
  { id: "anno", etichetta: "Anno", peso: 70 },
  { id: "supporto", etichetta: "Supporto", peso: 90 },
  { id: "condizione", etichetta: "Condizione", peso: 65 },
  { id: "riserva", etichetta: "Riserva proposta", peso: 110, compilabile: true },
];

export const MASSIMO_COLONNE_LIBERE = 3;
export const PESO_COLONNA_LIBERA = 100;

export type ConfigColonnePdf = {
  /** Colonne standard scelte, nell'ordine fisso di COLONNE_PDF. */
  colonne: IdColonnaPdf[];
  /** Colonne libere compilabili: solo il titolo. */
  libere: string[];
};

// Le sei colonne di prima (decisione 2026-09-29), usate finche' il portale non sceglie.
export const CONFIG_PDF_PREDEFINITA: ConfigColonnePdf = {
  colonne: ["sku", "artista", "opera", "misure", "riserva"],
  libere: [],
};

export function normalizzaConfigPdf(grezzo: unknown): ConfigColonnePdf {
  const g = (grezzo ?? {}) as { colonne?: unknown; libere?: unknown };
  const valide = new Set<string>(COLONNE_PDF.map((c) => c.id));
  const libere = Array.isArray(g.libere) ? pulisciLibere(g.libere) : [];
  if (!Array.isArray(g.colonne)) return { colonne: CONFIG_PDF_PREDEFINITA.colonne, libere };
  const scelte = g.colonne.filter((x): x is IdColonnaPdf => typeof x === "string" && valide.has(x));
  return { colonne: COLONNE_PDF.map((c) => c.id).filter((id) => scelte.includes(id)), libere };
}

function pulisciLibere(v: unknown[]): string[] {
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, MASSIMO_COLONNE_LIBERE);
}

// Legge la scelta salvata nelle impostazioni del canale.
export function configPdfDaImpostazioni(impostazioni: unknown): ConfigColonnePdf {
  const i = (impostazioni ?? {}) as { pdfColonne?: unknown };
  return i.pdfColonne ? normalizzaConfigPdf(i.pdfColonne) : CONFIG_PDF_PREDEFINITA;
}
