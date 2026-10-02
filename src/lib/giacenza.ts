// Tipi e costanti condivisi fra server e client per la giacenza di uno sku
// (dove stanno i pezzi, di chi sono). Nessuna dipendenza dal database.

// Causale dei movimenti di correzione quantita' (Release 3): scritti quando
// si digita il numero giusto direttamente da tabella o scheda. Sono NASCOSTI
// in tutte le schermate (elenco Movimenti della scheda sku incluso) e senza
// data visibile; la riga a database ha comunque un timestamp tecnico. Il
// futuro "Consolida" (Release 4) le fonde nei movimenti normali.
export const CAUSALE_CORREZIONE = "correzione_quantita";

export type GiacenzaRiga = {
  proprietarioId: number;
  proprietarioNome: string;
  ubicazioneId: number;
  ubicazioneNome: string;
  ubicazioneTipo: string;
  saldo: number;
};
