// Famiglie tematiche (tag di tipo "soggetto") e suggerimento automatico nel form
// Nuovo sku. Il suggerimento e' solo un punto di partenza, sempre modificabile.
//
// Regola per chi compila (stessa scritta nel form):
// - almeno una famiglia, al massimo due;
// - la prima e' cio' che si vede o cio' che si pubblicizza; la seconda solo se
//   e' evidente a colpo d'occhio (un animale, una citta', un'auto).

export const FAMIGLIE = [
  "Cibo e bevande",
  "Moda e glamour",
  "Auto e moto",
  "Sport",
  "Animali",
  "Arte e spettacolo",
  "Viaggi e turismo",
  "Casa e quotidiano",
] as const;
export type Famiglia = (typeof FAMIGLIE)[number];

export const MASSIMO_FAMIGLIE = 2;

export const REGOLE_FAMIGLIE: Record<Famiglia, string> = {
  "Cibo e bevande": "Si pubblicizza qualcosa da mangiare o da bere: alcolici, aperitivi, dolci, bibite.",
  "Moda e glamour": "Moda, profumi, cosmetici, pin-up, cura della persona.",
  "Auto e moto": "Auto, moto, pneumatici, benzina, gare automobilistiche.",
  "Sport": "Si vede un'attivita' sportiva: sci, tennis, golf, hockey.",
  "Animali": "Un animale e' ben visibile (di solito e' la seconda famiglia).",
  "Arte e spettacolo": "Artista noto, film, cabaret, musica, personaggi, TV.",
  "Viaggi e turismo": "Si pubblicizza un luogo o un viaggio: citta', localita', compagnie aeree.",
  "Casa e quotidiano": "Prodotti e servizi di casa o salute che non rientrano altrove.",
};

// Parole (su "ARTISTA OPERA" in maiuscolo) che indicano una famiglia.
const PAROLE: Record<Famiglia, RegExp> = {
  "Cibo e bevande": /CAMPARI|CINZANO|MARTINI|CARPANO|PUNT E MES|VERMOUTH|BITTER|APERITI|VODKA|CHAMPAGNE|MOET|TATTINGER|BIERE|BIRRA|BRINDISI|RICCADONNA|FERNET|CALVADOS|LIQUORE|CHIANTI|\bVINI|VALPOLICELLA|DRINK|COCKTAIL|BRANCA|MARSALA|PERUGINA|GORGONZOLA|POLENGHI|CARAMELLE|BISCOTT|BISCUIT|PASTA\b|ARANCIATA|ORANGINA|PERRIER|COCA COLA|CHIQUITA|CRODO|SANPELLEGRINO|FRUTTA|BARILLA|CIOCCOLAT|CAFFE|CASEIFICIO|LATTE\b|\bTEA\b|CHINOTTO|SAHIB/,
  "Moda e glamour": /CHANEL|BALLY|BEMBERG|JEANS|SCARPE|SHOES|MAGLIERIA|SAPONE|MONSAVON|PALMOLIVE|SHAMPOO|COPPERTONE|GRUAU|BARBISIO|CAPPELLO|CAPPELLI|CALZE|BINACRIN|OROLOGIO|PROFUM|PARFUM|GILLETTE|PLAYBOY|MANARA|BRILL\b/,
  "Auto e moto": /FERRARI|PORSCHE|MASERATI|LANCIA|\bFIAT|MORRIS|SHELL|CALTEX|MICHELIN|PIRELLI|LAMBRETTA|VESPA|INNOCENTI|RALL(Y|IES)|PNEUMATICI|GRAN ?PREMIO|MONACO|LE MANS|PROPELLENTE|CYCLES|\bAUTO\b|MOTO\b|MCQUEEN|CARS\b|BENZINA|CARBURANT/,
  "Sport": /\bSKI\b|\bSCI\b|SESTRIERE|CERVINIA|CORTINA|GOLF|TENNIS|ROLAND GARROS|SLALOM|SPORT|MORITZ|HOCKEY|CALCIO|OLIMPI/,
  "Animali": /CAVALLO|RINOCERONTE|TARTARUGA|PANDA|KING KONG|FENICOTTERO|GATTO|FARFALLE|\bORCA\b|\bLEONE\b|ELEFANT|\bCANE\b|MONKEY|SCIMMIA|TIGRE|ORSO\b/,
  "Arte e spettacolo": /WARHOL|HARING|LICHTENSTEIN|FONTANA|NESPOLO|\bBAJ\b|MUNARI|DEPERO|GLASER|CATTELAN|TOSCANI|MUSEE|MUSEUM|MOSTRA|SMAK|MOULIN ROUGE|LIDO|FOLIES|BATMAN|ELVIS|DYLAN|DISNEY|MICKEY|C3-P0|FALCON|STORMTROOPER|DARTH|MONSTERS|POWER RANGER|\bUFO\b|CANZON|DISCO PER|PEYNET|CINEMA|\bFILM\b|CONCERT|\bTOUR\b|FESTIVAL|TEATRO|OPERA LIRICA|CIRCO/,
  "Viaggi e turismo": /PARIS|PARIGI|NEW YORK|JAPAN|GIAPPONE|CHINA|LONDON|LONDRA|VALENCIA|FIERA|VICTORIA|\bENIT\b|VALLE D'AOSTA|GRAND HOTEL|\bHOTEL\b|ALASKA|DUBAI|\bROMA\b|MALAGA|CORTINA|MORITZ|CERVINIA|SESTRIER|TOURING|CANNES|TURIN|TORINO|PORTUGAL|SUD AMERICA|AIRLINES|AIR FRANCE|ALITALIA|\bTWA\b|COMPAGNIE AEREE|TURISM|VIAGGI|VACANZE/,
  "Casa e quotidiano": /ASSICURA|INSETTICID|FRIGO|STUFA|FARMAC|ELETTRODOM|PHILIPS|CALOR\b|\bLAMA\b|THERMOGENE|EUCESSINA|ARGENTIL|DETERSIV|LAVATRICE|FRIGORIFER/,
};

const ORDINE: Famiglia[] = [
  "Cibo e bevande",
  "Moda e glamour",
  "Auto e moto",
  "Sport",
  "Animali",
  "Arte e spettacolo",
  "Viaggi e turismo",
  "Casa e quotidiano",
];

// Suggerimento dalle sole parole di artista e titolo (al massimo MASSIMO_FAMIGLIE).
export function suggerisciDaTesto(artista: string, opera: string): Famiglia[] {
  const t = `${artista ?? ""} ${opera ?? ""}`.toUpperCase();
  if (!t.trim()) return [];
  const trovate = new Set<Famiglia>(ORDINE.filter((f) => PAROLE[f].test(t)));
  // Gare e pneumatici: solo Auto e moto.
  if (/MONACO|GRAN ?PREMIO|LE MANS|PNEUMATICI|PIRELLI ROSA/.test(t) && trovate.has("Auto e moto")) {
    return ["Auto e moto"];
  }
  // Compagnie aeree: solo Viaggi (non Auto e moto).
  if (/ALITALIA|AIR FRANCE|\bTWA\b|AIRLINES|COMPAGNIE AEREE/.test(t)) trovate.delete("Auto e moto");
  // Tennis e golf non sono una destinazione.
  if (/ROLAND GARROS|\bGOLF\b/.test(t) && !/PARIS|PARIGI|TOUQUET/.test(t)) trovate.delete("Viaggi e turismo");
  // Un animale dentro un film/personaggio: resta anche Arte e spettacolo (seconda famiglia).
  return ORDINE.filter((f) => trovate.has(f)).slice(0, MASSIMO_FAMIGLIE);
}
