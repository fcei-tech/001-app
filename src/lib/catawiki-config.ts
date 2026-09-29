// Costanti fisse Catawiki (modulo Pubblicazione, generazione output,
// 2026-09-28) - livello 1 del modello a 3 livelli canale/batch/override
// (vedi claude/09c_python_pubblicazione.yaml). Valori tutti verificati
// direttamente sul file MASTER_FINALE_FINALE_v31.xlsx reale (foglio
// CONFIG_GENERALE/CONFIG_CATAWIKI, celle vere, non le note) o confermati a
// voce dal cliente in questa stessa sessione - non un'ipotesi.
//
// Deliberatamente NON una UI di impostazioni canale: nel vecchio Master
// questi erano valori "costante quasi mai da toccare" (badge bianco in
// CONFIG_GENERALE/CONFIG_CATAWIKI) - un editor dedicato avrebbe senso solo
// se cambiassero spesso, oggi non e' cosi'. Per cambiarli: modifica questo
// file e rigenera una build (stesso principio operativo di prima, solo
// senza dover riaprire un file Excel).

// --- Costanti Auction Type / Object type / Language (CONFIG_CATAWIKI righe
// 12/13/15, valori globali fissi, vocabolario/tassonomia chiusa Catawiki,
// non personalizzabili per riga) ---
export const CATAWIKI_AUCTION_TYPE = "Posters";
export const CATAWIKI_OBJECT_TYPE = "Poster";
export const CATAWIKI_LANGUAGE = "Italian";

// Start bidding from: fisso per tutti i lotti, deciso esplicitamente di non
// renderlo personalizzabile per lotto (CONFIG_CATAWIKI riga 20). Deve essere
// uno dei 3 valori testuali esatti ammessi da Catawiki ('1 euro'/'RP'/'60%')
// - vedi 06_spec_catawiki.yaml/start_bidding_from_formato_2026_08_12.
export const CATAWIKI_START_BIDDING_FROM = "1 euro";

// Soglia minima "Estimated lot value" per essere visibile nell'import -
// CONFIRMATA da due caricamenti reali il 2026-08-12 (non 75 come si credeva
// prima). Verificata sul PREZZO base PRIMA del modificatore percentuale di
// batch (vedi risolviLottoCatawiki in catawiki-resolver.ts).
export const CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT = 200;

// Moltiplicatore di fallback per la riserva quando non c'e' un override
// esplicito per il lotto: riserva = stima_finale * questo valore (poi il
// modificatore batch in euro si applica sopra, vedi resolver). Confermato
// 0.5 - il vecchio vincolo "serve un rapporto 50% fisso" e' stato
// disprovato con un test reale Catawiki (vedi
// 06_spec_catawiki.yaml/riserva_CORREZIONE_IMPORTANTE), 0.5 resta solo il
// valore di default quando non specifichi altro.
export const CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK = 0.5;

// 3 profili di spedizione reali confermati per iscritto dal cliente il
// 2026-08-14 ("questi e solo questi... tutti gli altri sono da cancellare").
// Scelta a livello di BATCH (impostazioniBatch.profiloSpedizione), non piu'
// per riga: la colonna SPEDIZIONE_CATAWIKI del vecchio Master non esiste nel
// nuovo schema sku (decisione esplicita "colonna eliminata dal design",
// vedi claude/03c_master_config_formule_regole.yaml).
export const CATAWIKI_PROFILI_SPEDIZIONE = {
  standard: { id: "1531591", etichetta: "Standard" },
  high_value: { id: "1531593", etichetta: "High value" },
  freeshipping: { id: "1531586", etichetta: "Free shipping" },
} as const;
export type ProfiloSpedizioneCatawiki = keyof typeof CATAWIKI_PROFILI_SPEDIZIONE;

// --- Testi fissi Description (CONFIG_GENERALE, celle vere lette da
// MASTER_FINALE_FINALE_v31.xlsx via openpyxl - non dalla documentazione) ---
// testo_garanzia: CONFIG_GENERALE!B2
export const TESTO_GARANZIA =
  "Come società professionale, garantiamo il pieno rispetto dei Diritti del Consumatore dell'Unione Europea (Direttiva 2011/83/UE).";
// testo_spedizione: CONFIG_GENERALE!B3
export const TESTO_SPEDIZIONE =
  "Professionale in tubo rigido. Firmare con riserva in caso di danni visibili.";
// frase_condizioni_standard: CONFIG_GENERALE!B4 - frase fissa uguale su ogni
// lotto (mai stata legata alla condizione reale del pezzo, nemmeno nel
// vecchio Master), confermata invariata dal cliente il 2026-09-28.
export const FRASE_CONDIZIONI_STANDARD = "BUONE (COME DA FOTO)";
// frase_telatura: CONFIG_GENERALE!B5 - concatenata in coda alla riga
// Condizioni SOLO se sku.supporto === "T" (telato).
export const FRASE_TELATURA = " LINEN BACKED";

// --- Vocabolario D:Condition (Posters_dictionary.csv, colonna "D:
// Condition" - 6 valori applicabili a un pezzo singolo, stesso ordine del
// vocabolario interno A/A-/B+/B/B-/C del Magazzino). Confermato 2026-09-14
// (condizione_traduzione_reale_per_riga): a differenza del vecchio Master
// (che scriveva un valore fisso CONFIG_CATAWIKI!$B$14 su ogni riga), il
// software nuovo traduce la condizione REALE per riga - il vecchio
// comportamento fisso non e' mai stato una regola di business, solo un
// limite del foglio Excel.
export const CATAWIKI_CONDIZIONE_TESTO: Record<string, string> = {
  A: "A (excellent - mint condition)",
  "A-": "A- (fine - tiny imperfections)",
  "B+": "B+ (good - small imperfections)",
  B: "B (reasonable - obvious imperfections)",
  "B-": "B- (fair - notable defects)",
  C: "C (poor - significant defects)",
};

// Etichette italiane generiche note che indicano "nessun artista reale" -
// mappate sul valore minuscolo richiesto da Catawiki ("anonymous"). Nessuna
// lista esaustiva esiste nella knowledge del progetto (confermato: "si
// applica caso per caso quando emerge", vedi
// 06_spec_catawiki.yaml/d_designer_artist) - questo e' un elenco di
// default ragionevole, non una fonte verificata: estendilo liberamente se
// emergono altre etichette usate in Magazzino.
export const ETICHETTE_ARTISTA_GENERICO = [
  "anonimo",
  "sconosciuto",
  "ignoto",
  "non identificato",
  "autore sconosciuto",
  "anonymous",
];

export function normalizzaArtistaCatawiki(artista: string): string {
  const pulito = artista.trim();
  if (ETICHETTE_ARTISTA_GENERICO.includes(pulito.toLowerCase())) return "anonymous";
  return pulito;
}

// Minimo foto richiesto da Catawiki ("Public photo URL minimum 5 photos are
// required") - se ce ne sono meno ma almeno 1, si completa ripetendo la
// prima (regola padding universale, confermata identica al vecchio Master).
export const CATAWIKI_MINIMO_FOTO = 5;
export const CATAWIKI_SEPARATORE_FOTO = ";";
