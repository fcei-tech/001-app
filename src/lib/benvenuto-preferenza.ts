// Preferenza della guida iniziale ("Cosa vuoi fare?"): vale per questo Mac
// (come la scelta delle colonne), non e' un dato del database.
export const CHIAVE_NASCONDI_BENVENUTO = "posterclub.benvenuto.nascondi.v1";
export const CHIAVE_MOSTRATO_SESSIONE = "posterclub.benvenuto.mostrato.v1";
export const EVENTO_MOSTRA_BENVENUTO = "posterclub:mostra-benvenuto";
export const EVENTO_PREFERENZA_BENVENUTO = "posterclub:preferenza-benvenuto";

export function benvenutoNascosto(): boolean {
  try {
    return window.localStorage.getItem(CHIAVE_NASCONDI_BENVENUTO) === "1";
  } catch {
    return false;
  }
}

export function impostaBenvenutoNascosto(nascosto: boolean): void {
  try {
    if (nascosto) window.localStorage.setItem(CHIAVE_NASCONDI_BENVENUTO, "1");
    else window.localStorage.removeItem(CHIAVE_NASCONDI_BENVENUTO);
  } catch {
    // Archivio del browser non disponibile: la scelta vale solo finche' l'app resta aperta.
  }
  window.dispatchEvent(new Event(EVENTO_PREFERENZA_BENVENUTO));
}
