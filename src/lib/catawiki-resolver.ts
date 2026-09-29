// Motore di risoluzione Catawiki (modulo Pubblicazione, generazione output,
// 2026-09-28) - funzione pura, nessuna query qui dentro: prende in ingresso
// i dati gia' letti dal chiamante (sku + override + impostazioni di batch)
// e restituisce i valori finali "come andrebbero nel CSV" + gli eventuali
// errori di validazione. Usata sia per il rendering della colonna "Stato
// export" nella pagina batch sia dal generatore CSV vero e proprio
// (catawiki-export.ts) - stessa fonte di verita' per i due usi, mai
// ricalcolata due volte con logiche leggermente diverse.
//
// Modello a 3 livelli (vedi claude/09c_python_pubblicazione.yaml):
// 1) canale (costanti fisse, catawiki-config.ts)
// 2) batch (ImpostazioniBatchCatawiki qui sotto - profilo spedizione,
//    riserva attiva si/no per tutti, modificatori prezzo%/riserva€,
//    messaggio esperto)
// 3) override per lotto (prezzo/riserva/condizione - vince sempre sul
//    livello 1, salvo il caso "riserva disattivata per tutto il batch" che
//    ha priorita' massima, vedi sotto)
import { CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK, CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT, type ProfiloSpedizioneCatawiki } from "./catawiki-config";

export type ImpostazioniBatchCatawiki = {
  profiloSpedizione: ProfiloSpedizioneCatawiki;
  // true (default) = riserva calcolata normalmente (override se presente,
  // altrimenti stima*0.5 + modificatore€). false = nessuna riserva su
  // NESSUN lotto del batch, qualunque sia l'override per lotto - equivalente
  // al vecchio FORZA_NESSUNA_RISERVA ("ignora la colonna"), priorita'
  // massima. NOTA: il vecchio terzo stato "FORZA_RISERVA_TUTTI" non esiste
  // piu' come opzione distinta - nel Master serviva a ignorare il flag
  // per-riga RISERVA_CATAWIKI SI/NO/vuoto, che non esiste piu' nel nuovo
  // schema sku (sostituito interamente dall'override per lotto). Con solo
  // override+fallback automatico, "per riga" e "forza tutti" sarebbero
  // stati funzionalmente identici - tenerli entrambi avrebbe significato
  // un selettore con due opzioni che fanno la stessa cosa.
  riservaAttiva: boolean;
  modificatorePrezzoPercentuale: number;
  modificatoreRiservaEur: number;
  messaggioEsperto: string;
};

export const IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT: ImpostazioniBatchCatawiki = {
  profiloSpedizione: "standard",
  riservaAttiva: true,
  modificatorePrezzoPercentuale: 0,
  modificatoreRiservaEur: 0,
  messaggioEsperto: "",
};

// Vocabolario aperto (testo libero, vincolato in applicazione) - stesso
// principio di movimentiMagazzino.causale. Estendibile senza migrazione se
// in futuro servono altri controlli.
export const TIPI_ERRORE_VALIDAZIONE = [
  "prezzo_mancante_o_sotto_soglia",
  "anno_mancante",
  "zero_foto",
] as const;
export type TipoErroreValidazione = (typeof TIPI_ERRORE_VALIDAZIONE)[number];

export const ETICHETTA_ERRORE_VALIDAZIONE: Record<TipoErroreValidazione, string> = {
  prezzo_mancante_o_sotto_soglia: `Prezzo mancante o sotto ${CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT}€`,
  anno_mancante: "Anno/epoca mancante",
  zero_foto: "Nessuna foto disponibile",
};

export type OverrideLottoCatawiki = {
  prezzo?: string;
  riserva?: string;
  condizione?: string;
};

export type LottoPerRisoluzioneCatawiki = {
  batchLottoId: number;
  skuId: number;
  skuCode: string;
  skuCondizione: string;
  skuAnno: string | null;
  skuPrezzoCatawiki: string | null;
  override: OverrideLottoCatawiki | null;
  numeroFoto: number;
};

export type RigaCatawikiRisolta = {
  batchLottoId: number;
  skuId: number;
  skuCode: string;
  prezzoBase: number | null;
  stimaLotto: number | null;
  riservaFinale: number | null;
  condizioneCodice: string;
  errori: TipoErroreValidazione[];
  valido: boolean;
};

// Accetta sia il punto sia la virgola come separatore decimale (l'utente
// digita nella cella editabile, non ha senso forzare un formato) - il CSV
// generato usa sempre il punto, indipendentemente da come e' stato
// digitato qui (vedi catawiki-export.ts).
function parseNumero(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const pulito = v.trim().replace(",", ".");
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function risolviLottoCatawiki(
  lotto: LottoPerRisoluzioneCatawiki,
  impostazioni: ImpostazioniBatchCatawiki
): RigaCatawikiRisolta {
  const errori: TipoErroreValidazione[] = [];

  // Prezzo base: override vince sempre sul dato Magazzino (livello 3 su
  // livello 1).
  //
  // CAMBIO DI ROTTA 2026-09-29 (richiesta esplicita del cliente dopo il primo
  // test reale sulla release): la soglia minima ora e' verificata sulla
  // STIMA FINALE (dopo il modificatore percentuale di batch), non piu' sul
  // prezzo grezzo prima del modificatore. Questo ribalta la regola
  // precedente (vedi 06_spec_catawiki.yaml/modificatori_batch_2026_08_12/
  // soglie_NON_considerate_nel_calcolo_modificatori), che era stata testata
  // e confermata due volte dal vivo su Catawiki il 12 agosto - lasciata qui
  // come riferimento storico, non piu' il comportamento attuale. Motivo del
  // cambio: un lotto a 180€ con modificatore +100% arriva a 360€ finali, ma
  // con la vecchia regola veniva scartato comunque perche' 180 < 200 -
  // risultato controintuitivo per chi usa lo strumento dal vivo. Se serve
  // tornare alla regola vecchia, ripristinare il controllo su prezzoBase
  // PRIMA di calcolare stimaLotto.
  const prezzoOverride = parseNumero(lotto.override?.prezzo);
  const prezzoMagazzino = parseNumero(lotto.skuPrezzoCatawiki);
  const prezzoBase = prezzoOverride ?? prezzoMagazzino;

  if (prezzoBase === null) errori.push("prezzo_mancante_o_sotto_soglia");

  if (!lotto.skuAnno || !lotto.skuAnno.trim()) errori.push("anno_mancante");

  if (lotto.numeroFoto <= 0) errori.push("zero_foto");

  const stimaLotto =
    prezzoBase === null ? null : round2(prezzoBase * (1 + impostazioni.modificatorePrezzoPercentuale / 100));

  if (stimaLotto !== null && stimaLotto < CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT) {
    errori.push("prezzo_mancante_o_sotto_soglia");
  }

  let riservaFinale: number | null = null;
  if (impostazioni.riservaAttiva && stimaLotto !== null) {
    const riservaOverride = parseNumero(lotto.override?.riserva);
    const base = riservaOverride ?? round2(stimaLotto * CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK);
    const conModificatore = round2(base + impostazioni.modificatoreRiservaEur);
    // Mai un valore <=0 (e mai 0 letterale, verrebbe letto come riserva
    // reale a 0 euro) - floor a vuoto, stessa regola del vecchio Master.
    riservaFinale = conModificatore > 0 ? conModificatore : null;
  }

  const condizioneCodice = lotto.override?.condizione?.trim() || lotto.skuCondizione;

  return {
    batchLottoId: lotto.batchLottoId,
    skuId: lotto.skuId,
    skuCode: lotto.skuCode,
    prezzoBase,
    stimaLotto,
    riservaFinale,
    condizioneCodice,
    errori,
    valido: errori.length === 0,
  };
}

export function risolviBatchCatawiki(
  lotti: LottoPerRisoluzioneCatawiki[],
  impostazioni: ImpostazioniBatchCatawiki
): RigaCatawikiRisolta[] {
  return lotti.map((l) => risolviLottoCatawiki(l, impostazioni));
}
