// Elenco condiviso dei campi sku editabili inline da tabella Magazzino
// (2026-09-23). Vive fuori da actions.ts perche' un file "use server" puo'
// esportare solo funzioni async - questa costante (usata anche lato client,
// per popolare la barra di modifica in blocco) e i tipi associati stanno
// qui, neutri, importabili sia dal server action sia dal componente client.
export const CAMPI_EDITABILI_INLINE = [
  "artista",
  "opera",
  "larghezza",
  "altezza",
  "supporto",
  "anno",
  "tipoId",
  "condizione",
  "tag",
  "note",
  "bloccatoVendita",
  "valoreCarico",
  "prezzoEbay",
  "prezzoCatawiki",
  "riservaCatawiki",
] as const;

export type CampoEditabileInline = (typeof CAMPI_EDITABILI_INLINE)[number];
export type ValoreCampoInline = string | number | boolean | null;
export type VoceModificaInline = { id: number; campi: Partial<Record<CampoEditabileInline, ValoreCampoInline>> };
export type PrecedentiModificaInline = { id: number; campi: Partial<Record<CampoEditabileInline, ValoreCampoInline>> };
