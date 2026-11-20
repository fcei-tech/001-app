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
  // "Libero": dal 2026-11-20 ha un grigio proposto (tutti i portali hanno un
  // colore e sono modificabili da Archivi > Portali).
  Libero: "#6B7280",
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

// Spessore bordo/fascia colore canale (2026-09-29, richiesta esplicita
// cliente: "almeno 3 volte piu' spesso" del precedente border-l-4/4px, senza
// compromettere le info mostrate - opzione C proposta in chat via mockup,
// confermata "ok va bene": 20px, 5x il precedente). Tailwind richiede nomi
// di classe statici (non puo' leggere una costante JS a runtime): questo
// valore e' duplicato come classi Tailwind nei 3 punti d'uso
// (border-l-[20px] / pl-5 / pl-9 in src/app/pubblicazione/page.tsx,
// src/app/pubblicazione/[canaleId]/page.tsx,
// src/app/pubblicazione/[canaleId]/[batchId]/page.tsx, e w-5 in
// barra-canale.tsx) - se questo numero cambia, aggiornare anche quelle
// classi a mano.
export const SPESSORE_BORDO_CANALE_PX = 20;

// Fasce orizzontali eBay (2026-09-29, richiesta esplicita cliente: "ebay 4
// fasce horiz, ordine colori come vuoi, resto dei canali uguale"): eBay
// statico ed eBay Asta condividono la stessa famiglia di colori brand (il
// giallo #F5AF02/rosso #E53238 finora usati come colore canale unico sono
// solo 2 dei 4 colori del logo eBay) - invece di un bordo a colore singolo,
// 4 fasce orizzontali con tutti e 4 i colori, in ordine invertito fra i due
// canali per distinguerli a colpo d'occhio nella lista. Rosso #E53238 e
// giallo #F5AF02: verificati nella knowledge di progetto (12/08). Blu
// #0064D2 e verde #86B817: colori standard del logo eBay, non verificati in
// precedenza nella knowledge - accettati dal cliente in questa sessione
// (mockup "opzione C", "ok va bene").
const FASCE_EBAY_STATICO = ["#E53238", "#0064D2", "#F5AF02", "#86B817"];
export const FASCE_CANALE: Record<string, string[]> = {
  eBay: FASCE_EBAY_STATICO,
  "eBay Asta": [...FASCE_EBAY_STATICO].reverse(),
};

// Canali con fascia multicolore invece di un bordo a colore singolo - vedi
// BarraCanale in src/components/pubblicazione/barra-canale.tsx. Ritorna
// undefined per tutti gli altri canali (coloreCanale() resta la fonte per
// quelli, es. il pallino colore nella lista canali) - stesso pattern di
// coloreCanale sopra.
export function fasceCanale(nomeCanale: string): string[] | undefined {
  return FASCE_CANALE[nomeCanale];
}

// ---------------------------------------------------------------------------
// Release 12 (2026-11-20): i colori vivono nella colonna "colori" della
// tabella canali (da 1 a 4 colori hex, modificabili da Archivi > Portali).
// La tabella per nome sopra resta SOLO come ripiego per i canali con la
// colonna vuota (database nuovo prima della migrazione dei dati). Le pagine
// usano queste funzioni, non piu' coloreCanale/fasceCanale per nome.
// ---------------------------------------------------------------------------
export type CanaleConColori = { nome: string; colori?: string[] | null };

export const HEX_COLORE = /^#[0-9a-fA-F]{6}$/;

// Tutti i colori del portale (1-4), mai vuoto se il canale ha un colore noto.
export function coloriDelCanale(canale: CanaleConColori): string[] {
  const propri = (canale.colori ?? []).filter((c) => HEX_COLORE.test(c)).slice(0, 4);
  if (propri.length > 0) return propri;
  const fasce = FASCE_CANALE[canale.nome];
  if (fasce) return fasce;
  const uno = COLORE_CANALE[canale.nome];
  return uno ? [uno] : [];
}

// Colore principale (pallino, bordo pieno, sfondo tenue).
export function colorePrincipale(canale: CanaleConColori): string | undefined {
  return coloriDelCanale(canale)[0];
}

// Fasce orizzontali: solo se i colori sono 2 o piu'.
export function fasceDelCanale(canale: CanaleConColori): string[] | undefined {
  const c = coloriDelCanale(canale);
  return c.length > 1 ? c : undefined;
}

// Sfondo ESTERNO della pagina del portale: primo colore al 12% di opacita'
// (1F esadecimale = 12%). Le schede restano bianche.
export function sfondoPaginaCanale(canale: CanaleConColori): string | undefined {
  const c = colorePrincipale(canale);
  return c ? `${c}1F` : undefined;
}

// Distanza fra due colori (euclidea su RGB, 0-441). Sotto SOGLIA_COLORI_SIMILI
// il programma rifiuta il colore: "uguale o troppo simile a uno in uso".
export const SOGLIA_COLORI_SIMILI = 45;

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function distanzaColori(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Controlla i colori scelti per un portale contro quelli degli altri portali
// (confronto sul colore PRINCIPALE di ciascuno, che e' quello che colora lo
// sfondo; i colori interni a una fascia multipla sono liberi) e fra di loro.
// Ritorna il messaggio di errore o null.
export function erroreColoriPortale(
  colori: string[],
  altri: { nome: string; colori: string[] }[]
): string | null {
  if (colori.length < 1 || colori.length > 4) return "Servono da 1 a 4 colori.";
  if (colori.some((c) => !HEX_COLORE.test(c))) return "Colore non valido (formato #RRGGBB).";
  for (let i = 0; i < colori.length; i++) {
    for (let j = i + 1; j < colori.length; j++) {
      if (distanzaColori(colori[i], colori[j]) < 20) return "Due colori del portale sono praticamente uguali.";
    }
  }
  for (const altro of altri) {
    const principale = altro.colori[0];
    if (!principale) continue;
    if (distanzaColori(colori[0], principale) < SOGLIA_COLORI_SIMILI) {
      return `Il primo colore e' troppo simile a quello di ${altro.nome}: scegline uno piu' diverso.`;
    }
  }
  return null;
}
