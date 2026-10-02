// Tipi e costanti condivisi fra server e client per la giacenza di uno sku
// (dove stanno i pezzi, di chi sono). Nessuna dipendenza dal database.

// Ogni modifica di quantita', deposito o proprietario ha una scelta:
// "Scrivi nel registro" si/no (casella, sempre spuntata di default).
// - SI: il movimento ha la sua causale normale ("modifica_quantita",
//   "spostamento", "carico") e compare nella lista Movimenti.
// - NO: il movimento ha causale CAUSALE_CORREZIONE. Conta nei totali, ma non
//   compare in nessuna schermata ne' esportazione. Nessun interruttore per
//   rivederli (decisione 2026-10-02).
export const CAUSALE_CORREZIONE = "correzione_quantita";
export const CAUSALE_MODIFICA = "modifica_quantita";

// Nome leggibile della causale per la lista Movimenti.
export function etichettaCausale(causale: string): string {
  if (causale === CAUSALE_MODIFICA) return "Modifica quantità";
  return causale;
}

export type GiacenzaRiga = {
  proprietarioId: number;
  proprietarioNome: string;
  ubicazioneId: number;
  ubicazioneNome: string;
  ubicazioneTipo: string;
  saldo: number;
};
