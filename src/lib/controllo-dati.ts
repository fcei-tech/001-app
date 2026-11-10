// Controllo guidato dei dati (Release 9, 2026-11-10): quali sku hanno
// qualcosa da sistemare prima di andare sui portali. Logica PURA sulle righe
// di Magazzino; la pagina /sistema/controllo-dati la rilancia a ogni apertura
// (dopo ogni importazione basta riaprirla o premere "Ricontrolla").
//
// Il Master NON "pulisce": aggiunge dati con variazioni, quindi il controllo
// va rifatto dopo ogni importazione, non una volta sola.

import { campiMancanti } from "@/lib/campi-mancanti-pubblicazione";
import type { RigaMagazzino } from "@/db/queries";

export type IdControllo = "senza_foto" | "senza_prezzo_ebay" | "prezzo_catawiki" | "senza_anno" | "senza_supporto" | "puntini";

export type RigaControllo = { id: number; skuCode: string; artista: string; opera: string; dettaglio?: string };

export type Controllo = {
  id: IdControllo;
  titolo: string;
  spiegazione: string;
  righe: RigaControllo[];
};

const PUNTINI = /…|\.{3}/;

function numero(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function calcolaControlli(righe: RigaMagazzino[], sogliaCatawiki: number): Controllo[] {
  const base = righe.filter((r) => r.skuCode !== "IGNORA");
  const r = (x: RigaMagazzino, dettaglio?: string): RigaControllo => ({ id: x.id, skuCode: x.skuCode, artista: x.artista, opera: x.opera, dettaglio });

  const senzaFoto = base.filter((x) => x.numeroFoto <= 0).map((x) => r(x));
  const senzaEbay = base.filter((x) => {
    const p = numero(x.prezzoEbay);
    return p === null || p <= 0;
  }).map((x) => r(x));
  const catawiki = base
    .filter((x) => campiMancanti(x, sogliaCatawiki).includes("prezzoCatawiki"))
    .map((x) => {
      const p = numero(x.prezzoCatawiki);
      return r(x, p === null ? "manca" : `${x.prezzoCatawiki} € (sotto ${sogliaCatawiki} €)`);
    });
  const senzaAnno = base.filter((x) => !x.anno || !x.anno.trim()).map((x) => r(x));
  const senzaSupporto = base.filter((x) => !x.supporto || !x.supporto.trim()).map((x) => r(x));
  const puntini = base
    .filter((x) => PUNTINI.test(x.artista) || PUNTINI.test(x.opera))
    .map((x) => r(x, PUNTINI.test(x.artista) ? `Artista: ${x.artista}` : `Opera: ${x.opera}`));

  return [
    {
      id: "senza_foto",
      titolo: "Sku senza foto",
      spiegazione: "Senza foto non vanno su Shopify, eBay, Catawiki né Bidspirit. Carica le foto dalla scheda sku o con Importa Foto.",
      righe: senzaFoto,
    },
    {
      id: "senza_prezzo_ebay",
      titolo: "Sku senza prezzo eBay",
      spiegazione: "Senza prezzo eBay non va su eBay; Shopify e Subito vanno solo se hanno un loro prezzo.",
      righe: senzaEbay,
    },
    {
      id: "prezzo_catawiki",
      titolo: "Prezzo Catawiki mancante o sotto la soglia",
      spiegazione: `Sotto ${sogliaCatawiki} € (o senza prezzo) il lotto Catawiki viene scartato. Per Bidspirit non vale la soglia.`,
      righe: catawiki,
    },
    {
      id: "senza_anno",
      titolo: "Sku senza anno / epoca",
      spiegazione: "Catawiki scarta i lotti senza anno.",
      righe: senzaAnno,
    },
    {
      id: "senza_supporto",
      titolo: "Sku senza supporto",
      spiegazione: "Telato, Cornice o altro: se è telato i testi aggiungono LINEN BACKED. Lo imposti dalla scheda sku o con Modifica in blocco.",
      righe: senzaSupporto,
    },
    {
      id: "puntini",
      titolo: "Artista o opera con i puntini (…)",
      spiegazione: "Di solito è un testo tagliato da un'importazione o da un portale: controllalo e correggilo.",
      righe: puntini,
    },
  ];
}
