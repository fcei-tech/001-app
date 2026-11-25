// Spostare/duplicare un batch tra aste di tipo diverso (online <-> fisica).
// Funzioni pure: nessun accesso al database.
//
// Online (Catawiki, Bidspirit, eBay Asta): lotto "attivo", override { prezzo, riserva, ... }.
// Fisica (Cambi, Bolaffi, Wannenes, Conto esposizione): lotto "candidato" -> "accettato",
// override { riservaProposta, ... }.

export type TipoCanale = "statico" | "asta_online" | "asta_fisica";
export type StatoLotto = "attivo" | "candidato" | "accettato";

export const TIPI_ASTA: TipoCanale[] = ["asta_online", "asta_fisica"];

export function eAsta(tipo: string): boolean {
  return tipo === "asta_online" || tipo === "asta_fisica";
}

// Si puo' spostare/duplicare dal portale A al portale B?
// Stesso tipo (come prima) oppure qualunque asta verso qualunque asta.
export function conversionePossibile(da: string, a: string): boolean {
  return da === a || (eAsta(da) && eAsta(a));
}

export function statoLottoIniziale(tipo: string): "attivo" | "candidato" {
  return tipo === "asta_fisica" ? "candidato" : "attivo";
}

// Override del lotto portato nel nuovo tipo. Il valore di riserva segue il lotto:
// - fisica -> online: riservaProposta diventa "riserva" e la chiave fisica sparisce
//   (altrimenti, nei totali, vincerebbe su una riserva modificata dopo).
// - online -> fisica: "riserva" diventa riservaProposta. prezzo/riserva restano (non si perdono se si torna).
// Condizione e descrizione non dipendono dal tipo e restano.
export function convertiOverride(override: unknown, da: string, a: string): Record<string, unknown> | null {
  if (override === null || override === undefined) return null;
  const ov = { ...(override as Record<string, unknown>) };
  if (da === a) return ov;
  if (da === "asta_fisica" && a === "asta_online") {
    if (ov.riservaProposta !== undefined && ov.riservaProposta !== null && ov.riservaProposta !== "") {
      ov.riserva = ov.riservaProposta;
    }
    delete ov.riservaProposta;
  } else if (da === "asta_online" && a === "asta_fisica") {
    const r = ov.riservaProposta ?? ov.riserva;
    if (r !== undefined && r !== null && r !== "") ov.riservaProposta = r;
  }
  return Object.keys(ov).length > 0 ? ov : null;
}
