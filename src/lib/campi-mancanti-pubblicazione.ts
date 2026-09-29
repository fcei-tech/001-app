// Indicatore "dati mancanti" in Magazzino generale (2026-09-29, richiesta
// esplicita del cliente dopo il test su batch #58: "vorrei avere delle
// condizioni di allarme visivo se gli articoli a magazzino sono mancanti di
// informazioni necessarie"). I 4 campi qui sotto sono stati confermati dopo
// aver ricostruito, dai file di knowledge del progetto (fogli FP/CV -> campi
// calcolati su Master -> fogli portale, vedi
// claude/03c_master_config_formule_regole.yaml/doppio_cancello_*), quali
// dati mancanti impediscono davvero la pubblicazione: prezzo eBay, prezzo
// Catawiki (soglia minima import), anno/epoca, foto. Proposta confermata dal
// cliente ("proposta concreta ok").
//
// NOTA IMPORTANTE sulla soglia Catawiki: qui si verifica il prezzo Catawiki
// GREZZO di Magazzino (RigaMagazzino.prezzoCatawiki), PRIMA di qualsiasi
// modificatore percentuale di batch - a livello di Magazzino generale
// nessun batch e' ancora in vista, quindi nessun modificatore esiste ancora.
// Dal 2026-09-29 la soglia vera usata in fase di generazione file
// (risolviLottoCatawiki in catawiki-resolver.ts) si applica invece DOPO il
// modificatore di batch (cambio di rotta li' documentato). Un badge qui puo'
// quindi segnalare "sotto soglia" per uno sku che in un batch con
// modificatore positivo risulterebbe comunque valido - e' un indicatore di
// massima a livello Magazzino, non la validazione finale per canale/batch
// (quella resta e resterà solo risolviLottoCatawiki).
import { CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT } from "@/lib/catawiki-config";
import type { RigaMagazzino } from "@/db/queries";

export type CampoMancante = "prezzoEbay" | "prezzoCatawiki" | "anno" | "foto";

// Etichette brevi (per il badge in tabella) ed estese (per il tooltip) -
// separate cosi' la cella non diventa larghissima quando mancano piu' campi.
export const ETICHETTA_CAMPO_MANCANTE: Record<CampoMancante, string> = {
  prezzoEbay: "Prezzo eBay",
  prezzoCatawiki: "Prezzo Catawiki",
  anno: "Anno / epoca",
  foto: "Foto",
};

export const SPIEGAZIONE_CAMPO_MANCANTE: Record<CampoMancante, string> = {
  prezzoEbay: "Prezzo eBay mancante",
  prezzoCatawiki: `Prezzo Catawiki mancante o sotto la soglia minima di importazione (€ ${CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT})`,
  anno: "Anno / epoca mancante",
  foto: "Nessuna foto salvata",
};

function parseNumero(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Stessa forma minima richiesta dei campi coinvolti, cosi' la funzione resta
// utilizzabile anche fuori da RigaMagazzino se mai servisse in futuro.
export function campiMancanti(
  r: Pick<RigaMagazzino, "prezzoEbay" | "prezzoCatawiki" | "anno" | "numeroFoto">
): CampoMancante[] {
  const mancanti: CampoMancante[] = [];
  if (parseNumero(r.prezzoEbay) === null) mancanti.push("prezzoEbay");
  const prezzoCatawiki = parseNumero(r.prezzoCatawiki);
  if (prezzoCatawiki === null || prezzoCatawiki < CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT) {
    mancanti.push("prezzoCatawiki");
  }
  if (!r.anno || !r.anno.trim()) mancanti.push("anno");
  if (r.numeroFoto <= 0) mancanti.push("foto");
  return mancanti;
}
