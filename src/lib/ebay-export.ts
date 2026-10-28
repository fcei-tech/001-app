// File per eBay (File Exchange, 2026-10-27). Funzioni pure, nessun database.
// Formato e valori = quelli gia' verificati con caricamenti reali (vedi
// 04_spec_ebay.yaml): template fx_category_template_EBAY_IT a 66 colonne,
// separatore ";", UTF-8, virgolette SOLO se il campo contiene ; o ".
//  - ADD (verificato con caricamenti reali): crea gli annunci nuovi
//  - REVISE (DA PROVARE su 1-2 annunci): cambia pezzi e prezzo di un annuncio gia' online
//  - REVISE-TESTI (DA PROVARE): cambia la descrizione di un annuncio gia' online
// Gli annunci da chiudere NON hanno file: si chiudono a mano (End + Add
// consuma gli spazi mensili del negozio).

import { annoSenzaCirca } from "@/lib/shopify-export";

export const EBAY_CONFIG = {
  categoryId: "121859",
  format: "FixedPrice",
  duration: "GTC",
  conditionId: "3000",
  location: "Torino",
  shippingProfileName: "prima tabella creata con assistenza",
  returnProfileName: "14 days - International 14 days (252640134014)",
  paymentProfileName: "eBay Managed Payments (282184349014)",
  bestOfferEnabled: "1", // DEVE essere il numero 1, non TRUE (TRUE fa rifiutare tutte le righe)
  minimoBestOffer: 0.5,
  tagChiusura: "[OFFER WELCOME]",
  testoGaranzia:
    "Come società professionale, garantiamo il pieno rispetto dei Diritti del Consumatore dell'Unione Europea (Direttiva 2011/83/UE).",
  testoSpedizione: "Professionale in tubo rigido. Firmare con riserva in caso di danni visibili.",
  frasePredefinitaCondizioni: "BUONE (COME DA FOTO)",
  fraseTelatura: " LINEN BACKED",
  lunghezzaMaxTitolo: 80,
} as const;

export const EBAY_HEADER = [
  "*Action(SiteID=Italy|Country=IT|Currency=EUR|Version=1193|CC=UTF-8)", "CustomLabel", "*Category", "StoreCategory", "*Title",
  "Subtitle", "Relationship", "RelationshipDetails", "ScheduleTime", "*ConditionID", "VAT%", "C:Paese di origine", "PicURL",
  "GalleryType", "VideoID", "*Description", "*Format", "*Duration", "*StartPrice", "BuyItNowPrice", "BestOfferEnabled",
  "BestOfferAutoAcceptPrice", "MinimumBestOfferPrice", "*Quantity", "ImmediatePayRequired", "*Location", "ShippingType",
  "ShippingService-1:Option", "ShippingService-1:Cost", "ShippingService-2:Option", "ShippingService-2:Cost", "*DispatchTimeMax",
  "PromotionalShippingDiscount", "ShippingDiscountProfileID", "DomesticRateTable", "*ReturnsAcceptedOption", "ReturnsWithinOption",
  "RefundOption", "ShippingCostPaidByOption", "AdditionalDetails", "ShippingProfileName", "ReturnProfileName", "PaymentProfileName",
  "ProductCompliancePolicyID", "Regional ProductCompliancePolicies", "Manufacturer Name", "Manufacturer AddressLine1",
  "Manufacturer AddressLine2", "Manufacturer City", "Manufacturer Country", "Manufacturer PostalCode", "Manufacturer StateOrProvince",
  "Manufacturer Phone", "Manufacturer Email", "Manufacturer ContactURL", "Responsible Person 1", "Responsible Person 1 Type",
  "Responsible Person 1 AddressLine1", "Responsible Person 1 AddressLine2", "Responsible Person 1 City", "Responsible Person 1 Country",
  "Responsible Person 1 PostalCode", "Responsible Person 1 StateOrProvince", "Responsible Person 1 Phone", "Responsible Person 1 Email",
  "Responsible Person 1 ContactURL",
] as const;

const ACTION = EBAY_HEADER[0];
export const EBAY_HEADER_REVISE = [ACTION, "ItemID", "CustomLabel", "StartPrice", "MinimumBestOfferPrice", "*Quantity"] as const;
export const EBAY_HEADER_END = [ACTION, "ItemID", "EndCode"] as const;
export const EBAY_HEADER_REVISE_TESTI = [ACTION, "ItemID", "CustomLabel", "*Description"] as const;

export type SkuPerEbay = {
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
};
export type TestoEbay = { condizione?: string | null; descrizione?: string | null };

function pulisci(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function num(v: string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function misura(n: number): string {
  return String(Math.round(n * 10) / 10);
}
function eTela(s: string | null): boolean {
  return (s ?? "").trim().toUpperCase().startsWith("T");
}

// Blocco VeRO: davanti a OGNI "CAMPARI" si scrive "per" (non per CAMPARINO).
export function perCampari(testo: string): string {
  return testo.replace(/CAMPARINO/g, "§§§").replace(/CAMPARI/g, "per CAMPARI").replace(/§§§/g, "CAMPARINO");
}

export function titoloEbay(s: SkuPerEbay): string {
  const l = num(s.larghezza);
  const a = num(s.altezza);
  const dim = l && a ? ` ${misura(l)}x${misura(a)}` : "";
  const t = `${perCampari(pulisci(s.artista))} ${perCampari(pulisci(s.opera))} POSTER VINTAGE${dim}`;
  return pulisci(t.replace(/per CAMPARI per CAMPARI/g, "per CAMPARI"));
}

export function descrizioneEbay(s: SkuPerEbay, testo?: TestoEbay | null): string {
  const c = EBAY_CONFIG;
  const coda = `<br><br><b>Garanzia: </b>${c.testoGaranzia}<br><br><b>Spedizione: </b>${c.testoSpedizione}<br><br>${c.tagChiusura}`;
  const libera = testo?.descrizione?.trim();
  if (libera) return libera.split(/\r?\n/).map((r) => escapeHtml(r.trim())).filter((r) => r !== "").join("<br>") + coda;
  const l = num(s.larghezza);
  const a = num(s.altezza);
  const anno = annoSenzaCirca(s.anno);
  const cond = testo?.condizione?.trim() ? escapeHtml(pulisci(testo.condizione)) : c.frasePredefinitaCondizioni;
  const righe = [
    `<b>Artista: </b>${escapeHtml(perCampari(pulisci(s.artista)))}`,
    `<b>Opera: </b>${escapeHtml(perCampari(pulisci(s.opera)))}`,
  ];
  if (anno) righe.push(`<b>Epoca: </b>circa ${escapeHtml(anno)}`);
  if (l && a) righe.push(`<b>Dimensioni: </b>circa ${misura(l)}x${misura(a)} cm`);
  righe.push(`<b>Condizioni: </b>${cond}${eTela(s.supporto) ? c.fraseTelatura : ""}`);
  return righe.join("<br>") + coda;
}

// Prezzi eBay: punto decimale, niente ".00" sugli interi (come il Master).
export function prezzoEbayTesto(x: number): string {
  const centesimi = Math.round(x * 100);
  return centesimi % 100 === 0 ? String(centesimi / 100) : (centesimi / 100).toFixed(2);
}
export function minimoOffertaTesto(prezzo: number): string {
  return prezzoEbayTesto(prezzo * EBAY_CONFIG.minimoBestOffer);
}

export type MotivoScartoEbay = "prezzo_mancante" | "zero_foto" | "titolo_lungo";
export const ETICHETTA_SCARTO_EBAY: Record<MotivoScartoEbay, string> = {
  prezzo_mancante: "Prezzo eBay mancante",
  zero_foto: "Nessuna foto",
  titolo_lungo: "Titolo oltre 80 caratteri",
};
export function motivoScartoEbay(s: SkuPerEbay, prezzo: number | null, numeroFoto: number): MotivoScartoEbay | null {
  if (prezzo === null || prezzo <= 0) return "prezzo_mancante";
  if (numeroFoto === 0) return "zero_foto";
  if (titoloEbay(s).length > EBAY_CONFIG.lunghezzaMaxTitolo) return "titolo_lungo";
  return null;
}

function campo(v: string): string {
  return v.includes(";") || v.includes('"') || v.includes("\n") || v.includes("\r") ? `"${v.replace(/"/g, '""')}"` : v;
}
// Prima riga del template: Info;Version=1.0.0;Template=... completata fino al numero di colonne.
function csvEbay(intestazione: readonly string[], righe: string[][]): string {
  const info = ["Info", "Version=1.0.0", "Template=fx_category_template_EBAY_IT"];
  while (info.length < intestazione.length) info.push("");
  return [info, [...intestazione], ...righe].map((r) => r.map(campo).join(";")).join("\r\n") + "\r\n";
}

export type NuovoEbay = { sku: SkuPerEbay; quantita: number; prezzo: number; foto: string[]; testo?: TestoEbay | null };

export function generaCsvEbayAdd(nuovi: NuovoEbay[]): string {
  const c = EBAY_CONFIG;
  const col = (n: (typeof EBAY_HEADER)[number]) => EBAY_HEADER.indexOf(n);
  const righe = nuovi.map((n) => {
    const r: string[] = new Array(EBAY_HEADER.length).fill("");
    r[col(ACTION)] = "Add";
    r[col("CustomLabel")] = n.sku.skuCode;
    r[col("*Category")] = c.categoryId;
    r[col("*Title")] = titoloEbay(n.sku);
    r[col("*ConditionID")] = c.conditionId;
    r[col("PicURL")] = n.foto.join("|");
    r[col("*Description")] = descrizioneEbay(n.sku, n.testo);
    r[col("*Format")] = c.format;
    r[col("*Duration")] = c.duration;
    r[col("*StartPrice")] = prezzoEbayTesto(n.prezzo);
    r[col("BestOfferEnabled")] = c.bestOfferEnabled;
    r[col("MinimumBestOfferPrice")] = minimoOffertaTesto(n.prezzo);
    r[col("*Quantity")] = String(n.quantita);
    r[col("*Location")] = c.location;
    r[col("ShippingProfileName")] = c.shippingProfileName;
    r[col("ReturnProfileName")] = c.returnProfileName;
    r[col("PaymentProfileName")] = c.paymentProfileName;
    return r;
  });
  return csvEbay(EBAY_HEADER, righe);
}

export type ReviseEbay = { itemId: string; skuCode: string; pezzi: number; prezzo: number };
export function generaCsvEbayRevise(rev: ReviseEbay[]): string {
  return csvEbay(
    EBAY_HEADER_REVISE,
    rev.map((r) => ["Revise", r.itemId, r.skuCode, prezzoEbayTesto(r.prezzo), minimoOffertaTesto(r.prezzo), String(r.pezzi)])
  );
}

export type ReviseTestoEbay = { itemId: string; sku: SkuPerEbay; testo: TestoEbay };
export function generaCsvEbayReviseTesti(rev: ReviseTestoEbay[]): string {
  return csvEbay(EBAY_HEADER_REVISE_TESTI, rev.map((r) => ["Revise", r.itemId, r.sku.skuCode, descrizioneEbay(r.sku, r.testo)]));
}

// Chiusura annunci (2026-10-28): eBay RIFIUTA Quantity 0 (errore 515, provato dal
// vivo), quindi esauriti e archiviati si chiudono con Action End. DA PROVARE.
export type ChiudiEbay = { itemId: string };
export function generaCsvEbayEnd(voci: ChiudiEbay[]): string {
  return csvEbay(EBAY_HEADER_END, voci.map((v) => ["End", v.itemId, "NotAvailable"]));
}

export type TipoFileEbay = "ADD" | "REVISE" | "REVISE-TESTI" | "END";
export const NUMERO_FILE_EBAY: Record<TipoFileEbay, number> = { ADD: 1, REVISE: 2, "REVISE-TESTI": 3, END: 4 };
export function nomeFileEbay(tipo: TipoFileEbay, marca: string): string {
  return `ebay_${NUMERO_FILE_EBAY[tipo]}-${tipo}${tipo === "REVISE-TESTI" || tipo === "END" ? "_[DA-PROVARE]" : ""}_${marca}.csv`;
}
