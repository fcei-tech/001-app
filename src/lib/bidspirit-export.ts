// Generatore file Bidspirit (Release 4) - .xlsx, foglio "data", 47 colonne
// fisse nell'ordine reale (vedi 10_spec_bidspirit.yaml). Prezzi e riserva
// seguono le stesse regole di Catawiki (decisione del cliente): stima =
// prezzo base (+ modificatore batch), riserva = lotto ?? sku ?? stima x 0,5.
// Differenze: nessuna soglia minima 200; startPrice = meta' della riserva
// (arrotondata per eccesso, mai sopra la riserva); maxEstimate = stima +20%.
// fullPriceVat sempre FALSE (TRUE aggiunge il 22% in piu', vedi spec).
// Bidspirit NON sovrascrive: ogni caricamento crea lotti nuovi.
import * as XLSX from "xlsx";
import { FRASE_CONDIZIONI_STANDARD, FRASE_TELATURA, TESTO_GARANZIA, TESTO_SPEDIZIONE } from "./catawiki-config";
import type { RigaCatawikiRisolta } from "./catawiki-resolver";

export const BIDSPIRIT_HEADER = [
  "itemIndex", "inventoryId", "sellerNumber", "startPrice", "reservedPrice", "minEstimate", "maxEstimate",
  "buyoutPrice", "postSalePrice", "mainLangName", "mainLangDesc", "mainLangAuthor", "mainLangDetails",
  "mainLangConditionReport", "mainLangCategory", "secondLangName", "secondLangDesc", "secondLangAuthor",
  "secondLangDetails", "secondLangConditionReport", "secondLangCategory", "condition", "width", "height",
  "depth", "widthWithFrame", "heightWithFrame", "lengthUnit", "weight", "weightUnit", "numberOfUnits",
  "tag1", "tag2", "eroticContent", "location", "extraInfo", "largeDisplay", "fullPriceVat",
  "notForNormalShipment", "postSaleDisabled", "hidden", "removedFromAuction", "picsBase", "pics",
  "videoUrl", "lotUrl", "adminNotes",
] as const;

export const BIDSPIRIT_PERCENTUALE_START_SU_RISERVA = 50;
export const BIDSPIRIT_PERCENTUALE_MAX_ESTIMATE = 20;
export const BIDSPIRIT_TAG1 = "Pubblicitaria";
export const BIDSPIRIT_TAG2 = "Stampe e multipli";
const CONDIZIONE_EN = "GOOD (AS SHOWN IN PHOTOS)";

export type SkuDettagliBidspirit = {
  artista: string;
  opera: string;
  tipo: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string;
  note: string | null;
};

function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function buildDescrizioneBidspirit(sku: SkuDettagliBidspirit): string {
  const misure = `${num(Number(sku.larghezza ?? 0))}x${num(Number(sku.altezza ?? 0))}`;
  const telatura = sku.supporto === "T" ? FRASE_TELATURA : "";
  const righe = [
    sku.tipo,
    `circa ${sku.anno}`,
    `circa ${misure} cm${telatura}`,
    sku.note?.trim() ?? "",
    `Garanzia: ${TESTO_GARANZIA}`,
    `Spedizione: ${TESTO_SPEDIZIONE}`,
  ].filter((r) => r);
  return righe.join("\n");
}

export function generaRigaBidspirit(
  riga: RigaCatawikiRisolta,
  sku: SkuDettagliBidspirit,
  foto: string[]
): (string | number)[] {
  const c: (string | number)[] = new Array(BIDSPIRIT_HEADER.length).fill("");
  const set = (nome: (typeof BIDSPIRIT_HEADER)[number], v: string | number) => {
    c[BIDSPIRIT_HEADER.indexOf(nome)] = v;
  };
  const stima = riga.stimaLotto ?? 0;
  const riserva = riga.riservaFinale ?? 0;
  set("itemIndex", riga.skuCode);
  set("inventoryId", riga.skuCode);
  set("startPrice", Math.ceil((riserva * BIDSPIRIT_PERCENTUALE_START_SU_RISERVA) / 100));
  set("reservedPrice", riserva);
  set("minEstimate", stima);
  set("maxEstimate", Math.round(stima * (1 + BIDSPIRIT_PERCENTUALE_MAX_ESTIMATE / 100) * 100) / 100);
  set("mainLangName", `${sku.artista} - ${sku.opera}`);
  set("mainLangDesc", riga.descrizioneOverride ?? buildDescrizioneBidspirit(sku));
  set("mainLangAuthor", sku.artista);
  set("mainLangConditionReport", FRASE_CONDIZIONI_STANDARD);
  set("secondLangName", `${sku.artista} - ${sku.opera}`);
  set("secondLangAuthor", sku.artista);
  set("secondLangConditionReport", CONDIZIONE_EN);
  set("lengthUnit", "cm");
  set("tag1", BIDSPIRIT_TAG1);
  set("tag2", BIDSPIRIT_TAG2);
  set("fullPriceVat", "FALSE");
  set("pics", foto.join(","));
  return c;
}

// Ritorna il file .xlsx in base64 (i Server Actions restituiscono valori
// serializzabili; il download lo costruisce il componente client).
export function generaXlsxBidspiritBase64(
  righe: { risolta: RigaCatawikiRisolta; sku: SkuDettagliBidspirit; foto: string[] }[]
): string {
  const aoa = [
    [...BIDSPIRIT_HEADER] as (string | number)[],
    ...righe.map((r) => generaRigaBidspirit(r.risolta, r.sku, r.foto)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
