// Generazione del CSV prodotti per Shopify (2026-10-19). Funzioni pure, nessun
// database: ricevono i dati gia' letti dal chiamante. Formato = quello
// "classico" a 51 colonne (Handle, Body (HTML), Variant SKU...) identico
// all'export reale del negozio e gia' importato con successo nei test del
// 2026-08-09. Regole (vedi 05_spec_shopify.yaml e prodotti live osservati il
// 2026-10-19):
// - una riga per foto, stesso Handle; i dati prodotto solo sulla prima riga;
// - CSV con virgola, UTF-8 SENZA BOM (il BOM fa importare 0 prodotti);
// - prezzo = ROUNDUP(prezzo eBay * 0.9) all'euro, mai un ripiego sul prezzo
//   base: senza prezzo eBay il lotto viene scartato;
// - colonna Condizione (metafield) VUOTA: rompeva l'import;
// - virgola mai nei decimali di Dim (sempre il punto).

export const SHOPIFY_HEADER = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
  "Option1 Name", "Option1 Value", "Option1 Linked To", "Option2 Name", "Option2 Value", "Option2 Linked To",
  "Option3 Name", "Option3 Value", "Option3 Linked To", "Variant SKU", "Variant Grams",
  "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service",
  "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable",
  "Unit Price Total Measure", "Unit Price Total Measure Unit", "Unit Price Base Measure", "Unit Price Base Measure Unit",
  "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title", "SEO Description",
  "Color (product.metafields.shopify.color-pattern)",
  "Condizione (product.metafields.shopify.condition)",
  "Finitura della carta (product.metafields.shopify.paper-finish)",
  "Tema (product.metafields.shopify.theme)",
  "Prodotti complementari (product.metafields.shopify--discovery--product_recommendation.complementary_products)",
  "Prodotti correlati (product.metafields.shopify--discovery--product_recommendation.related_products)",
  "Impostazioni dei prodotti correlati (product.metafields.shopify--discovery--product_recommendation.related_products_display)",
  "Boost dei prodotti per la ricerca (product.metafields.shopify--discovery--product_search_boost.queries)",
  "Variant Image", "Variant Weight Unit", "Variant Tax Code", "Cost per item", "Status",
] as const;

export const SHOPIFY_VENDOR = "POSTERCLUB";
export const SHOPIFY_TIPO = "POSTER VINTAGE";
export const SHOPIFY_SCONTO_SU_EBAY = 0.9;
const TESTO_CONDIZIONI = "BUONE (COME DA FOTO)";
const TESTO_GARANZIA =
  "Come società professionale, garantiamo il pieno rispetto dei Diritti del Consumatore dell'Unione Europea (Direttiva 2011/83/UE).";
const TESTO_SPEDIZIONE = "Professionale in tubo rigido. Firmare con riserva in caso di danni visibili.";

export type SkuPerShopify = {
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  prezzoEbay: string | null;
};

export type MotivoScartoShopify = "prezzo_ebay_mancante" | "zero_foto";
export const ETICHETTA_SCARTO_SHOPIFY: Record<MotivoScartoShopify, string> = {
  prezzo_ebay_mancante: "Prezzo eBay mancante (serve per calcolare il prezzo Shopify)",
  zero_foto: "Nessuna foto",
};

function numero(v: string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 70 -> "70", 61.6 -> "61.6" (sempre il punto, mai zeri finali)
function formatMisura(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function pulisci(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// L'anno puo' essere scritto "1950" oppure "circa 1950" (il form suggerisce
// anche questo): nella descrizione e nei tag il "circa" lo aggiunge il
// software, quindi un "circa" iniziale gia' scritto si toglie (niente
// "circa Circa 1950").
export function annoSenzaCirca(anno: string | null): string {
  return pulisci(anno ?? "").replace(/^(circa|ca\.?)\s*/i, "").trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function eTela(supporto: string | null): boolean {
  return (supporto ?? "").trim().toUpperCase().startsWith("T");
}

export function calcolaPrezzoShopify(prezzoEbay: string | null): number | null {
  const p = numero(prezzoEbay);
  if (p === null) return null;
  // ROUNDUP(x, 0): sempre per eccesso all'euro intero (arrotondo prima a 6
  // decimali per non farsi ingannare dai residui di virgola mobile).
  return Math.ceil(Math.round(p * SHOPIFY_SCONTO_SU_EBAY * 1e6) / 1e6);
}

export function handleShopify(skuCode: string): string {
  return skuCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildTitolo(sku: SkuPerShopify): string {
  const l = numero(sku.larghezza);
  const a = numero(sku.altezza);
  const dim = l && a ? ` ${formatMisura(l)}x${formatMisura(a)}` : "";
  return pulisci(`${sku.artista} ${sku.opera} POSTER VINTAGE`) + dim;
}

export function buildBodyHtml(sku: SkuPerShopify): string {
  const l = numero(sku.larghezza);
  const a = numero(sku.altezza);
  const anno = annoSenzaCirca(sku.anno);
  const righe: string[] = [
    `<b>Artista: </b>${escapeHtml(pulisci(sku.artista))}`,
    `<b>Opera: </b>${escapeHtml(pulisci(sku.opera))}`,
  ];
  if (anno) righe.push(`<b>Epoca: </b>circa ${escapeHtml(anno)}`);
  if (l && a) righe.push(`<b>Dimensioni: </b>circa ${formatMisura(l)}x${formatMisura(a)} cm`);
  righe.push(`<b>Condizioni: </b>${TESTO_CONDIZIONI}${eTela(sku.supporto) ? " LINEN BACKED" : ""}`);
  return (
    righe.join("<br>") +
    `<br><br><b>Garanzia: </b>${TESTO_GARANZIA}` +
    `<br><br><b>Spedizione: </b>${TESTO_SPEDIZIONE}`
  );
}

export function buildTag(sku: SkuPerShopify): string {
  const l = numero(sku.larghezza);
  const a = numero(sku.altezza);
  const tag: string[] = [];
  const anno = annoSenzaCirca(sku.anno);
  if (anno) tag.push(`Anno:${anno}`);
  tag.push(`Artista:${pulisci(sku.artista)}`);
  if (l && a) {
    tag.push(`Dim:${formatMisura(l)}x${formatMisura(a)}`);
    tag.push(Math.max(l, a) >= 140 && Math.min(l, a) > 100 ? "Formato: Grande" : "Formato: Medio-piccolo");
    if (eTela(sku.supporto)) tag.push("LINEN BACKED");
    tag.push(l > a ? "HORIZONTAL" : "VERTICAL");
  } else if (eTela(sku.supporto)) {
    tag.push("LINEN BACKED");
  }
  // Virgola nei tag spezzerebbe il tag in due.
  return tag.map((t) => t.replace(/,/g, " ")).join(", ");
}

function escapiCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export type RigaShopifyInput = { sku: SkuPerShopify; quantita: number; foto: string[] };

// Restituisce le righe CSV di UN prodotto (prima riga + una per ogni foto
// successiva). Chi chiama ha gia' verificato prezzo e foto.
export function generaRigheProdotto({ sku, quantita, foto }: RigaShopifyInput): string[][] {
  const handle = handleShopify(sku.skuCode);
  const prezzo = calcolaPrezzoShopify(sku.prezzoEbay);
  const riga = (): string[] => new Array(SHOPIFY_HEADER.length).fill("");
  const col = (nome: (typeof SHOPIFY_HEADER)[number]) => SHOPIFY_HEADER.indexOf(nome);

  return foto.map((url, i) => {
    const r = riga();
    r[col("Handle")] = handle;
    r[col("Image Src")] = url;
    r[col("Image Position")] = String(i + 1);
    r[col("Image Alt Text")] = sku.skuCode;
    if (i === 0) {
      r[col("Title")] = buildTitolo(sku);
      r[col("Body (HTML)")] = buildBodyHtml(sku);
      r[col("Vendor")] = SHOPIFY_VENDOR;
      r[col("Type")] = SHOPIFY_TIPO;
      r[col("Tags")] = buildTag(sku);
      r[col("Published")] = "TRUE";
      r[col("Option1 Name")] = "Title";
      r[col("Option1 Value")] = "Default Title";
      r[col("Variant SKU")] = sku.skuCode;
      r[col("Variant Grams")] = "0";
      r[col("Variant Inventory Tracker")] = "shopify";
      r[col("Variant Inventory Qty")] = String(quantita);
      r[col("Variant Inventory Policy")] = "deny";
      r[col("Variant Fulfillment Service")] = "manual";
      r[col("Variant Price")] = prezzo === null ? "" : prezzo.toFixed(2);
      r[col("Variant Requires Shipping")] = "TRUE";
      r[col("Variant Taxable")] = "TRUE";
      r[col("Gift Card")] = "FALSE";
      r[col("Variant Weight Unit")] = "kg";
      r[col("Status")] = "active";
    }
    return r;
  });
}

export function motivoScarto(sku: SkuPerShopify, numeroFoto: number): MotivoScartoShopify | null {
  if (calcolaPrezzoShopify(sku.prezzoEbay) === null) return "prezzo_ebay_mancante";
  if (numeroFoto === 0) return "zero_foto";
  return null;
}

export function generaCsvShopify(prodotti: RigaShopifyInput[]): string {
  const righe = [
    SHOPIFY_HEADER.map(escapiCsv).join(","),
    ...prodotti.flatMap((p) => generaRigheProdotto(p).map((r) => r.map(escapiCsv).join(","))),
  ];
  // UTF-8 puro, senza BOM.
  return righe.join("\r\n") + "\r\n";
}
