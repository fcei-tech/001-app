// Generazione del PDF "lista lotti" per le aste fisiche (Cambi, Bolaffi,
// Wannenes, Libero e qualsiasi canale con tipo asta_fisica) - 2026-09-29.
//
// Il PDF e' il file che si allega alla mail alla casa d'asta: una persona
// apre l'allegato, guarda le foto e compila a mano (o a video) la Riserva.
// Per questo:
// - colonne: Foto + quelle scelte per il portale (dal 2026-11-25, vedi
//   pdf-colonne-asta.ts); default le sei storiche Sku, Artista, Opera, Misure,
//   Riserva proposta (mai prezzo/quantita'). Colonne libere compilabili;
// - la cella Riserva e' un campo di testo compilabile a video (AcroForm) E
//   resta un riquadro vuoto abbastanza grande per scriverci a mano dopo la
//   stampa; se il cliente ha inserito una riserva proposta, e' precompilata;
// - la prima foto e' incorporata come miniatura (scaricata gia'
//   ridimensionata dalla CDN Shopify con ?width=300, mai l'originale) e
//   ogni foto ha un link cliccabile "Foto 1..N" (fino a 5, poi "+N altre");
// - se una miniatura non si scarica la riga resta valida con i soli link:
//   la funzione riporta quali righe sono senza miniatura, non si blocca.
//
// Funzione pura rispetto al database: riceve dati gia' pronti dal chiamante
// (vedi generaFilePdfAstaFisicaAction in src/app/pubblicazione/actions.ts).
import { COLONNE_PDF, CONFIG_PDF_PREDEFINITA, PESO_COLONNA_LIBERA, type ConfigColonnePdf, type IdColonnaPdf } from "./pdf-colonne-asta";
import { PDFArray, PDFDocument, PDFFont, PDFName, PDFPage, PDFString, StandardFonts, rgb } from "pdf-lib";

export type MiniaturaFoto = { bytes: Uint8Array; tipo: "jpg" | "png" };

export type LottoPdfAstaFisica = {
  skuCode: string;
  artista: string;
  opera: string;
  misure: string;
  anno?: string;
  supporto?: string;
  condizione?: string;
  /** Riserva proposta gia' inserita dal cliente (override), vuota se assente. */
  riserva: string;
  /** URL di tutte le foto dello sku, nell'ordine corretto. */
  fotoUrls: string[];
  /** Miniatura della prima foto, se scaricata con successo. */
  miniatura: MiniaturaFoto | null;
};

export type ParametriPdfAstaFisica = {
  nomeCasa: string;
  batchId: number;
  /** Data gia' formattata per l'intestazione, es. "29/09/2026". */
  dataTesto: string;
  lotti: LottoPdfAstaFisica[];
  /** Colonne scelte per il portale (default: le sei storiche). */
  colonne?: ConfigColonnePdf;
};

// A4 orizzontale, in punti.
const PAGINA_L = 841.89;
const PAGINA_H = 595.28;
const MARGINE = 30;
const ALTEZZA_TESTATA_PAGINA = 34;
const ALTEZZA_INTESTAZIONE_TABELLA = 28;
const ALTEZZA_RIGA = 78;
const MASSIMO_LINK_FOTO = 5;

const COL_FOTO = 150;
const LARGHEZZA_UTILE = PAGINA_L - 2 * MARGINE;

// Colonne effettive dopo Foto: standard scelte + libere, con larghezze
// proporzionali ai pesi che riempiono la pagina.
type ColonnaEffettiva = { chiave: string; etichetta: string; larghezza: number; compilabile: boolean; id?: IdColonnaPdf };
function costruisciColonne(config: ConfigColonnePdf): ColonnaEffettiva[] {

  const voci: { chiave: string; etichetta: string; peso: number; compilabile: boolean; id?: IdColonnaPdf }[] = [];
  for (const id of config.colonne) {
    const d = COLONNE_PDF.find((c) => c.id === id);
    if (d) voci.push({ chiave: id, etichetta: d.etichetta, peso: d.peso, compilabile: Boolean(d.compilabile), id });
  }
  config.libere.forEach((t, i) => voci.push({ chiave: `libera_${i}`, etichetta: t, peso: PESO_COLONNA_LIBERA, compilabile: true }));

  const somma = voci.reduce((n, v) => n + v.peso, 0) || 1;
  const utile = LARGHEZZA_UTILE - COL_FOTO;
  return voci.map((v) => ({ chiave: v.chiave, etichetta: v.etichetta, larghezza: (v.peso / somma) * utile, compilabile: v.compilabile, id: v.id }));
}

const GRIGIO_BORDO = rgb(0.6, 0.6, 0.6);
const GRIGIO_TESTO = rgb(0.35, 0.35, 0.35);
const NERO = rgb(0, 0, 0);
const BLU_LINK = rgb(0.1, 0.25, 0.75);

// Il font standard Helvetica supporta solo il set WinAnsi: qualunque altro
// carattere farebbe fallire drawText. Sostituisce con "?" cio' che non e'
// rappresentabile, invece di far fallire l'intera generazione.
export function pulisciTesto(testo: string, font: PDFFont): string {
  const consentiti = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of testo.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    out += consentiti.has(cp) ? ch : "?";
  }
  return out;
}

// Va a capo per parole entro larghezzaMax; oltre maxRighe tronca con "…".
export function spezzaTesto(testo: string, font: PDFFont, dimensione: number, larghezzaMax: number, maxRighe: number): string[] {
  const parole = testo.split(/\s+/).filter(Boolean);
  const righe: string[] = [];
  let corrente = "";
  for (const p of parole) {
    const prova = corrente ? `${corrente} ${p}` : p;
    if (font.widthOfTextAtSize(prova, dimensione) <= larghezzaMax) {
      corrente = prova;
    } else {
      if (corrente) righe.push(corrente);
      // Parola singola piu' larga della colonna: la tronca.
      let parola = p;
      while (font.widthOfTextAtSize(parola, dimensione) > larghezzaMax && parola.length > 1) {
        parola = parola.slice(0, -1);
      }
      corrente = parola;
    }
  }
  if (corrente) righe.push(corrente);
  if (righe.length <= maxRighe) return righe;
  const tagliate = righe.slice(0, maxRighe);
  let ultima = tagliate[maxRighe - 1];
  while (font.widthOfTextAtSize(`${ultima}…`, dimensione) > larghezzaMax && ultima.length > 1) {
    ultima = ultima.slice(0, -1);
  }
  tagliate[maxRighe - 1] = `${ultima}…`;
  return tagliate;
}

export async function generaPdfAstaFisica(parametri: ParametriPdfAstaFisica): Promise<Uint8Array> {
  const { nomeCasa, batchId, dataTesto, lotti } = parametri;
  const colonneEff = costruisciColonne(parametri.colonne ?? CONFIG_PDF_PREDEFINITA);

  const doc = await PDFDocument.create();
  doc.setTitle(`Lista lotti ${nomeCasa} - batch ${batchId}`);
  doc.setCreator("Posterclub");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const righePerPagina = Math.max(
    1,
    Math.floor((PAGINA_H - 2 * MARGINE - ALTEZZA_TESTATA_PAGINA - ALTEZZA_INTESTAZIONE_TABELLA) / ALTEZZA_RIGA)
  );
  const numeroPagine = Math.max(1, Math.ceil(lotti.length / righePerPagina));

  const annotPerPagina = new Map<PDFPage, ReturnType<typeof doc.context.register>[]>();

  function aggiungiLink(pagina: PDFPage, x: number, y: number, larghezza: number, altezza: number, url: string) {
    const annot = doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + larghezza, y + altezza],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = doc.context.register(annot);
    const elenco = annotPerPagina.get(pagina) ?? [];
    elenco.push(ref);
    annotPerPagina.set(pagina, elenco);
  }

  function disegnaTestataPagina(pagina: PDFPage, numero: number) {
    const titolo = pulisciTesto(`${nomeCasa} - lista lotti proposti`, fontBold);
    pagina.drawText(titolo, { x: MARGINE, y: PAGINA_H - MARGINE - 12, size: 14, font: fontBold, color: NERO });
    const sotto = pulisciTesto(
      `Batch ${batchId}  -  ${dataTesto}  -  ${lotti.length} lott${lotti.length === 1 ? "o" : "i"}`,
      font
    );
    pagina.drawText(sotto, { x: MARGINE, y: PAGINA_H - MARGINE - 27, size: 9, font, color: GRIGIO_TESTO });
    const testoPagina = `Pagina ${numero} di ${numeroPagine}`;
    const larghezzaPagina = font.widthOfTextAtSize(testoPagina, 9);
    pagina.drawText(testoPagina, {
      x: PAGINA_L - MARGINE - larghezzaPagina,
      y: PAGINA_H - MARGINE - 27,
      size: 9,
      font,
      color: GRIGIO_TESTO,
    });
  }

  function disegnaIntestazioneTabella(pagina: PDFPage, yAlto: number) {
    const colonne: [string, number][] = [["Foto", COL_FOTO], ...colonneEff.map((c): [string, number] => [c.etichetta, c.larghezza])];
    let x = MARGINE;
    for (const [etichetta, larghezza] of colonne) {
      pagina.drawRectangle({
        x,
        y: yAlto - ALTEZZA_INTESTAZIONE_TABELLA,
        width: larghezza,
        height: ALTEZZA_INTESTAZIONE_TABELLA,
        color: rgb(0.93, 0.93, 0.93),
        borderColor: GRIGIO_BORDO,
        borderWidth: 0.6,
      });
      // Titolo lungo: va a capo su due righe, poi tronca con "…" (mai fuori colonna).
      const righeTitolo = spezzaTesto(pulisciTesto(etichetta, fontBold), fontBold, 8.5, larghezza - 10, 2);
      const yPrima = righeTitolo.length === 1 ? yAlto - 17 : yAlto - 11;
      righeTitolo.forEach((r, k) => pagina.drawText(r, { x: x + 5, y: yPrima - k * 10, size: 8.5, font: fontBold, color: NERO }));
      x += larghezza;
    }
  }

  for (let p = 0; p < numeroPagine; p++) {
    const pagina = doc.addPage([PAGINA_L, PAGINA_H]);
    disegnaTestataPagina(pagina, p + 1);
    const yInizioTabella = PAGINA_H - MARGINE - ALTEZZA_TESTATA_PAGINA;
    disegnaIntestazioneTabella(pagina, yInizioTabella);

    const lottiPagina = lotti.slice(p * righePerPagina, (p + 1) * righePerPagina);
    for (let i = 0; i < lottiPagina.length; i++) {
      const lotto = lottiPagina[i];
      const yAlto = yInizioTabella - ALTEZZA_INTESTAZIONE_TABELLA - i * ALTEZZA_RIGA;
      const yBasso = yAlto - ALTEZZA_RIGA;

      // Bordi delle 6 celle.
      let xCella = MARGINE;
      for (const larghezza of [COL_FOTO, ...colonneEff.map((c) => c.larghezza)]) {
        pagina.drawRectangle({
          x: xCella,
          y: yBasso,
          width: larghezza,
          height: ALTEZZA_RIGA,
          borderColor: GRIGIO_BORDO,
          borderWidth: 0.6,
        });
        xCella += larghezza;
      }

      // --- Colonna Foto: miniatura a sinistra, link a destra ---
      const boxFotoL = 62;
      const boxFotoH = ALTEZZA_RIGA - 8;
      if (lotto.miniatura) {
        try {
          const img =
            lotto.miniatura.tipo === "png"
              ? await doc.embedPng(lotto.miniatura.bytes)
              : await doc.embedJpg(lotto.miniatura.bytes);
          const scala = Math.min(boxFotoL / img.width, boxFotoH / img.height);
          const w = img.width * scala;
          const h = img.height * scala;
          pagina.drawImage(img, {
            x: MARGINE + 4 + (boxFotoL - w) / 2,
            y: yBasso + 4 + (boxFotoH - h) / 2,
            width: w,
            height: h,
          });
        } catch {
          // Miniatura non decodificabile: la riga resta con i soli link.
        }
      }
      const linkVisibili = lotto.fotoUrls.slice(0, MASSIMO_LINK_FOTO);
      const xLink = MARGINE + 4 + boxFotoL + 8;
      linkVisibili.forEach((url, idx) => {
        const testoLink = `Foto ${idx + 1}`;
        const yLink = yAlto - 14 - idx * 12;
        pagina.drawText(testoLink, { x: xLink, y: yLink, size: 8.5, font, color: BLU_LINK });
        const larghezzaLink = font.widthOfTextAtSize(testoLink, 8.5);
        pagina.drawLine({
          start: { x: xLink, y: yLink - 1.5 },
          end: { x: xLink + larghezzaLink, y: yLink - 1.5 },
          thickness: 0.4,
          color: BLU_LINK,
        });
        aggiungiLink(pagina, xLink, yLink - 3, larghezzaLink, 11, url);
      });
      if (lotto.fotoUrls.length > MASSIMO_LINK_FOTO) {
        pagina.drawText(`+${lotto.fotoUrls.length - MASSIMO_LINK_FOTO} altre`, {
          x: xLink,
          y: yAlto - 14 - MASSIMO_LINK_FOTO * 12,
          size: 7.5,
          font,
          color: GRIGIO_TESTO,
        });
      }

      // --- Colonne scelte per il portale ---
      let xTesto = MARGINE + COL_FOTO;
      for (const col of colonneEff) {
        if (col.compilabile) {
          // Campo compilabile a video e riquadro ampio per la scrittura a mano.
          const campo = form.createTextField(`${col.chiave}_${p}_${i}`);
          if (col.id === "riserva" && lotto.riserva.trim()) campo.setText(pulisciTesto(lotto.riserva.trim(), font));
          campo.addToPage(pagina, {
            x: xTesto + 6,
            y: yBasso + 6,
            width: col.larghezza - 12,
            height: ALTEZZA_RIGA - 12,
            borderWidth: 0,
            font,
          });
          // Dopo addToPage: prima di allora il campo non ha ancora la stringa di
          // aspetto predefinita e setFontSize fallisce (MissingDAEntryError).
          campo.setFontSize(11);
        } else {
          const testo =
            col.id === "sku" ? lotto.skuCode
            : col.id === "artista" ? lotto.artista
            : col.id === "opera" ? lotto.opera
            : col.id === "misure" ? lotto.misure
            : col.id === "anno" ? (lotto.anno ?? "")
            : col.id === "supporto" ? (lotto.supporto ?? "")
            : (lotto.condizione ?? "");
          const grassetto = col.id === "artista";
          const dim = col.id === "artista" || col.id === "opera" ? 9.5 : 9;
          const passo = dim + 2.5;
          const righe = spezzaTesto(pulisciTesto(testo, font), font, dim, col.larghezza - 10, 5);
          righe.forEach((r, k) =>
            pagina.drawText(r, { x: xTesto + 5, y: yAlto - 14 - k * passo, size: dim, font: grassetto ? fontBold : font, color: NERO })
          );
        }
        xTesto += col.larghezza;
      }
    }
  }

  form.updateFieldAppearances(font);

  // Le annotazioni link vanno agganciate a ogni pagina alla fine: i campi del
  // modulo hanno gia' creato il proprio array Annots, quindi lo si estende.
  for (const [pagina, refs] of annotPerPagina) {
    const esistenti = pagina.node.lookup(PDFName.of("Annots"));
    if (esistenti instanceof PDFArray) {
      for (const r of refs) esistenti.push(r);
    } else {
      pagina.node.set(PDFName.of("Annots"), doc.context.obj(refs));
    }
  }

  return doc.save();
}

// Scarica la miniatura di una foto. Per le URL Shopify (cdn.shopify.com)
// chiede alla CDN la versione ridimensionata (?width=300), cosi' il PDF resta
// leggero. Ritorna null se il download fallisce, e' troppo grande o il
// formato non e' JPEG/PNG (es. WebP, non incorporabile): il chiamante ripiega
// sui soli link.
const LIMITE_BYTE_MINIATURA = 450_000;
const TIMEOUT_MINIATURA_MS = 8000;

export async function scaricaMiniatura(url: string): Promise<MiniaturaFoto | null> {
  try {
    const u = new URL(url);
    if (u.hostname.includes("shopify")) u.searchParams.set("width", "300");
    const risposta = await fetch(u.toString(), {
      headers: { Accept: "image/jpeg,image/png" },
      signal: AbortSignal.timeout(TIMEOUT_MINIATURA_MS),
    });
    if (!risposta.ok) return null;
    const buffer = new Uint8Array(await risposta.arrayBuffer());
    if (buffer.length === 0 || buffer.length > LIMITE_BYTE_MINIATURA) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return { bytes: buffer, tipo: "jpg" };
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { bytes: buffer, tipo: "png" };
    }
    return null;
  } catch {
    return null;
  }
}

// Scarica le miniature di piu' URL con un massimo di `concorrenza` richieste
// contemporanee. Ritorna un array parallelo all'input.
export async function scaricaMiniatureInParallelo(
  urls: (string | null)[],
  concorrenza = 6
): Promise<(MiniaturaFoto | null)[]> {
  const risultati: (MiniaturaFoto | null)[] = new Array(urls.length).fill(null);
  let prossimo = 0;
  async function lavoratore() {
    while (true) {
      const idx = prossimo++;
      if (idx >= urls.length) return;
      const url = urls[idx];
      risultati[idx] = url ? await scaricaMiniatura(url) : null;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrenza, Math.max(urls.length, 1)) }, lavoratore));
  return risultati;
}
