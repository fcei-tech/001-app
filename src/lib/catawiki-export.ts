// Generatore CSV Catawiki (modulo Pubblicazione, generazione output,
// 2026-09-28) - 45 colonne esatte nell'ordine ufficiale del template
// Catawiki (Posters_template.csv, verificato colonna per colonna anche
// sull'header reale del foglio CATAWIKI in MASTER_FINALE_FINALE_v31.xlsx).
// Delimitatore virgola, punto come separatore decimale SEMPRE (indipendente
// da locale: qui non c'e' nessun LibreOffice/Excel di mezzo, il testo e'
// costruito byte per byte). Solo le colonne popolate dal vecchio Master
// (piu' Message to Expert, riattivato il 13/8) sono valorizzate - le altre
// 28 restano stringa vuota, mai state compilate da nessuna formula reale.
import {
  CATAWIKI_AUCTION_TYPE,
  CATAWIKI_CONDIZIONE_TESTO,
  CATAWIKI_LANGUAGE,
  CATAWIKI_MINIMO_FOTO,
  CATAWIKI_OBJECT_TYPE,
  CATAWIKI_PROFILI_SPEDIZIONE,
  CATAWIKI_SEPARATORE_FOTO,
  CATAWIKI_START_BIDDING_FROM,
  FRASE_CONDIZIONI_STANDARD,
  FRASE_TELATURA,
  TESTO_GARANZIA,
  TESTO_SPEDIZIONE,
  normalizzaArtistaCatawiki,
} from "./catawiki-config";
import type { ImpostazioniBatchCatawiki, RigaCatawikiRisolta } from "./catawiki-resolver";

export const CATAWIKI_CSV_HEADER = [
  "Your Reference Number (optional)",
  "Your Reference Colour (optional)",
  "Auction Type (1145) (optional)",
  "Object type (16073)",
  "Language",
  "Description",
  "D: Era",
  "D: Poster title",
  "D: Estimated period (optional)",
  "D: Condition",
  "D: Number of objects (optional)",
  "D: Height",
  "D: Width",
  "D: Autographed by a famous person (optional)",
  "D: Manufacturer/brand (optional)",
  "D: Designer/artist",
  "D: Subject (optional)",
  "D: Country of origin (optional)",
  "D: Specific region of origin (optional)",
  "D: Artist",
  "D: Movie/TV series",
  "D: Cast/production (optional)",
  "D: Additional information (optional)",
  "D: Brand (optional)",
  "D: Artist/band",
  "D: Features (optional)",
  "D: Type",
  "D: Team (optional)",
  "D: Athlete (optional)",
  "D: Sports event (optional)",
  "D: Series",
  "D: Publisher/brand (optional)",
  "D: Authenticity",
  "Public photo URL",
  "Estimated lot value",
  "Reserve price (optional)",
  "Start bidding from (optional)",
  "Pick up (optional)",
  "Combined shipping (optional)",
  "Shipping costs - Italy",
  "Shipping costs - Europe",
  "Shipping costs - Rest of World",
  "Country specific shipping price (optional)",
  "Shipping profile (optional)",
  "Message to Expert (optional)",
] as const;

export type SkuDettagliCatawiki = {
  artista: string;
  opera: string;
  larghezza: string | null; // numeric(6,1) come stringa, letto da Drizzle
  altezza: string | null;
  supporto: string | null;
  anno: string; // gia' verificato non vuoto dal resolver (anno_mancante)
};

function escapiCampoCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// Sempre punto come decimale, senza zeri finali superflui (70 -> "70",
// 61.6 -> "61.6") - stesso principio del fix storico su D:Height/D:Width
// (bug id 37), qui pero' costruito nativamente, mai a rischio locale.
function formatNumero(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function formatMisuraCm(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${formatNumero(n)}_cm`;
}

function formatPrezzo(n: number | null): string {
  return n === null ? "" : n.toFixed(2);
}

function calcolaEra(anno: string): string {
  const n = Number(anno.trim().slice(0, 4));
  if (!Number.isFinite(n)) return "";
  if (n < 1400) return "Before 1400";
  if (n < 1900) return "1400-1900";
  if (n < 2000) return "1900-2000";
  return "After 2000";
}

// Description: template confermato (claude/03c_master_config_formule_
// regole.yaml/formula_descrizione/template_catawiki_CORRETTO), minuscolo
// SU TUTTO IL BLOCCO (Catawiki segnala un avviso reale se il testo ha
// troppe maiuscole) - a differenza di D:Poster title/D:Designer/artist qui
// SOTTO, che restano nel case originale (correzione esplicita del cliente
// 2026-09-28: il vecchio Master li metteva minuscoli anche li', ma non era
// corretto).
function buildDescription(sku: SkuDettagliCatawiki): string {
  const misure = `${formatNumero(Number(sku.larghezza ?? 0))}x${formatNumero(Number(sku.altezza ?? 0))}`;
  const telatura = sku.supporto === "T" ? FRASE_TELATURA : "";
  const righe = [
    `Artista: ${sku.artista}`,
    `Opera: ${sku.opera}`,
    `Epoca: circa ${sku.anno}`,
    `Dimensioni: circa ${misure} cm`,
    `Condizioni: ${FRASE_CONDIZIONI_STANDARD}${telatura}`,
    "",
    `Garanzia: ${TESTO_GARANZIA}`,
    "",
    `Spedizione: ${TESTO_SPEDIZIONE}`,
  ];
  return righe.join("\n").toLowerCase();
}

// Foto: minimo 5, se ce ne sono meno si completa ripetendo la PRIMA foto
// (regola padding universale, identica al vecchio Master) - il chiamante
// garantisce gia' almeno 1 foto (righe a 0 foto sono scartate a monte,
// errore "zero_foto"). Nessun tetto massimo per Catawiki (a differenza del
// tetto 6 storico di Subito, mai esteso qui).
function buildElencoFotoUrl(fotoOrdinate: string[]): string {
  if (fotoOrdinate.length === 0) return "";
  const elenco = [...fotoOrdinate];
  while (elenco.length < CATAWIKI_MINIMO_FOTO) elenco.push(fotoOrdinate[0]);
  return elenco.join(CATAWIKI_SEPARATORE_FOTO);
}

export function generaRigaCatawiki(
  riga: RigaCatawikiRisolta,
  sku: SkuDettagliCatawiki,
  fotoOrdinate: string[],
  impostazioni: ImpostazioniBatchCatawiki
): string[] {
  const condizioneTesto = CATAWIKI_CONDIZIONE_TESTO[riga.condizioneCodice] ?? "";
  const profilo = CATAWIKI_PROFILI_SPEDIZIONE[impostazioni.profiloSpedizione];

  const colonne: string[] = new Array(45).fill("");
  colonne[2] = CATAWIKI_AUCTION_TYPE; // C: Auction Type
  colonne[3] = CATAWIKI_OBJECT_TYPE; // D: Object type
  colonne[4] = CATAWIKI_LANGUAGE; // E: Language
  colonne[5] = buildDescription(sku); // F: Description
  colonne[6] = calcolaEra(sku.anno); // G: D:Era
  colonne[7] = sku.opera; // H: D:Poster title (case originale, vedi nota buildDescription)
  colonne[9] = condizioneTesto; // J: D:Condition
  colonne[11] = formatMisuraCm(sku.altezza); // L: D:Height
  colonne[12] = formatMisuraCm(sku.larghezza); // M: D:Width
  colonne[15] = normalizzaArtistaCatawiki(sku.artista); // P: D:Designer/artist
  colonne[33] = buildElencoFotoUrl(fotoOrdinate); // AH: Public photo URL
  colonne[34] = formatPrezzo(riga.stimaLotto); // AI: Estimated lot value
  colonne[35] = formatPrezzo(riga.riservaFinale); // AJ: Reserve price
  colonne[36] = CATAWIKI_START_BIDDING_FROM; // AK: Start bidding from
  colonne[43] = profilo.id; // AR: Shipping profile
  colonne[44] = impostazioni.messaggioEsperto.trim(); // AS: Message to Expert

  return colonne;
}

export function generaCsvCatawiki(
  righeValide: { risolta: RigaCatawikiRisolta; sku: SkuDettagliCatawiki; foto: string[] }[],
  impostazioni: ImpostazioniBatchCatawiki
): string {
  const righe = [
    CATAWIKI_CSV_HEADER.map(escapiCampoCsv).join(","),
    ...righeValide.map(({ risolta, sku, foto }) =>
      generaRigaCatawiki(risolta, sku, foto, impostazioni).map(escapiCampoCsv).join(",")
    ),
  ];
  return righe.join("\r\n") + "\r\n";
}
