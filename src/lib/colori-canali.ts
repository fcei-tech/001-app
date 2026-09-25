// Palette colori brand per canale (modulo Pubblicazione) - 2026-09-25.
// Richiesta esplicita utente 2026-09-24 ("mettici i colori o almeno cercali
// online e mettili [...] vedi tu"), palette scelta/verificata via ricerca web
// nella sessione 2026-09-24, FINALIZZATA nella sessione 2026-09-25 (vedi
// palette_colori_canali_2026_09_24 in claude/09c_python_pubblicazione.yaml).
// Riuso 1:1 dei colori gia' scelti/verificati per il vecchio Master Excel
// (03_master_excel_struttura.yaml/schema_colori_intestazioni_colonne_di_
// stato_2026_08_12) piu' Bidspirit (canale non esistente all'epoca).
//
// Applicazione UI (decisione presa in fase di costruzione, come lasciato
// aperto nella nota): bordo/accento colorato + badge testo sul colore (15%
// di opacita' come sfondo, stesso pattern gia' in uso per le varianti
// success/warning di Badge), MAI riempimento pieno del bottone/card - rischio
// di contrasto/leggibilita' su colori chiari come il giallo eBay statico o il
// verde Shopify.
//
// Chiavi = "nome" esatto del canale come seminato in src/db/seed.ts. Bidspirit
// e Libero (quarto slot aste fisiche): vedi note puntuali sotto.
export const COLORE_CANALE: Record<string, string> = {
  // Statici (ufficiali, verificati 2026-08-12)
  Shopify: "#95BF47",
  eBay: "#F5AF02", // eBay statico - giallo, distinto da eBay Asta (rosso)
  Etsy: "#F1641E",
  Subito: "#B01030", // NON ufficiale, nessun hex pubblico trovato - scelto in famiglia rosso, distinto da eBay Asta

  // Aste online (ufficiali dove trovati)
  Catawiki: "#0033FF",
  "eBay Asta": "#E53238", // ufficiale, distinto apposta da eBay statico
  Bidspirit: "#1B6B63", // NON ufficiale (nessuna fonte affidabile trovata) - PROPOSTA, il cliente puo' correggerla a vista

  // Aste fisiche (nessun brand color pubblico trovato, scelti a discrezione 2026-08-13)
  Cambi: "#1B3A5C",
  Bolaffi: "#8B6914",
  Wannenes: "#5B3256",
  // "Libero" (quarto slot aste fisiche, segnaposto senza casa d'asta reale
  // nominata): NESSUN colore assegnato di proposito - vedi nota in
  // palette_colori_canali_2026_09_24. coloreCanale() ritorna undefined.
};

export function coloreCanale(nomeCanale: string): string | undefined {
  return COLORE_CANALE[nomeCanale];
}

// Sfondo tenue (~15% opacita', stesso principio delle varianti success/
// warning di Badge) per badge/accenti testo sul colore canale, senza
// riempimento pieno - vedi nota applicazione UI sopra.
export function sfondoTenueCanale(nomeCanale: string): string | undefined {
  const hex = coloreCanale(nomeCanale);
  if (!hex) return undefined;
  return `${hex}26`; // 26 hex = ~15% alpha
}
