// PDF dell'esportazione Magazzino (Release 12). A4 orizzontale, tabella con le
// colonne scelte; con "pdfFoto" ogni riga ha la miniatura della foto principale
// (scaricata ridimensionata dalla CDN, vedi scaricaMiniatura) e i link
// cliccabili Foto 1..N. Se una miniatura non si scarica la riga resta valida
// con i soli link. Mai link agli annunci dei portali.
// Release 13: le colonne libere (id "libera1"/"libera2") escono come CAMPI DI
// TESTO COMPILABILI (AcroForm): si scrive dentro con Acrobat o Anteprima, ad
// esempio il prezzo da proporre. Il PDF non viene "appiattito".
import { PDFArray, PDFBool, PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { pulisciTesto, spezzaTesto, scaricaMiniatureInParallelo } from "./asta-fisica-pdf";
import { dataOggiIt, euroIt, type DefinizioneColonnaExport, type RigaExport } from "./export-magazzino";

const L = 841.89;
const H = 595.28;
const M = 28;
const TESTATA = 40;
const INT_H = 18;
const COL_FOTO = 105;
const MAX_LINK = 4;
const GRIGIO = rgb(0.6, 0.6, 0.6);
const GRIGIO_T = rgb(0.35, 0.35, 0.35);
const NERO = rgb(0, 0, 0);
const BLU = rgb(0.1, 0.25, 0.75);

function formatta(c: DefinizioneColonnaExport, x: RigaExport): string {
  const v = c.valore(x);
  if (v === null || v === "") return "";
  if (typeof v === "number") return c.tipo === "euro" ? euroIt(v) : String(v).replace(".", ",");
  return v;
}

export async function costruisciPdf(
  cols: DefinizioneColonnaExport[],
  righe: RigaExport[],
  titolo: string,
  conData: boolean,
  conFoto: boolean,
  rigaTotale: boolean
): Promise<{ bytes: Uint8Array; senzaMiniatura: number }> {
  // In PDF la colonna "link foto" non serve: ci sono i link Foto 1..N.
  const colonne = cols.filter((c) => c.tipo !== "link");
  const doc = await PDFDocument.create();
  const nomeDoc = titolo.trim() || "Magazzino";
  doc.setTitle(nomeDoc);
  doc.setCreator("Posterclub");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const larghezzaTab = L - 2 * M;
  const larghezzaTesto = larghezzaTab - (conFoto ? COL_FOTO : 0);
  const somma = colonne.reduce((s, c) => s + c.larghezza, 0) || 1;
  const larghezze = colonne.map((c) => (c.larghezza / somma) * larghezzaTesto);
  const altezzaRiga = conFoto ? 62 : 24;
  const maxRighe = conFoto ? 5 : 2;
  const dim = colonne.length > 9 ? 7 : 8.5;

  const miniature = conFoto ? await scaricaMiniatureInParallelo(righe.map((x) => x.fotoUrls[0] ?? null)) : [];
  const senzaMiniatura = conFoto ? righe.filter((x, i) => x.fotoUrls.length > 0 && !miniature[i]).length : 0;

  const perPagina = Math.max(1, Math.floor((H - 2 * M - TESTATA - INT_H) / altezzaRiga));
  const haTotale = rigaTotale && righe.length > 0 && (colonne.some((c) => c.id === "pezzi") || colonne.some((c) => c.id === "valore"));
  const nPagine = Math.max(1, Math.ceil((righe.length + (haTotale ? 1 : 0)) / perPagina));
  const annot = new Map<PDFPage, ReturnType<typeof doc.context.register>[]>();
  const form = doc.getForm();
  let nCampi = 0;

  // Totali (Pezzi, Valore) in fondo, se le colonne ci sono.
  const iPezzi = colonne.findIndex((c) => c.id === "pezzi");
  const iValore = colonne.findIndex((c) => c.id === "valore");
  const totPezzi = righe.reduce((s, x) => s + x.pezzi, 0);
  const totValore = righe.reduce((s, x) => { const v = colonne[iValore]?.valore(x); return s + (typeof v === "number" ? v : 0); }, 0);

  for (let p = 0; p < nPagine; p++) {
    const pag = doc.addPage([L, H]);
    pag.drawText(pulisciTesto(nomeDoc, bold), { x: M, y: H - M - 12, size: 14, font: bold, color: NERO });
    const sotto = `${conData ? dataOggiIt() + "  -  " : ""}${righe.length} ${righe.length === 1 ? "riga" : "righe"}`;
    pag.drawText(pulisciTesto(sotto, font), { x: M, y: H - M - 27, size: 9, font, color: GRIGIO_T });
    const tp = `Pagina ${p + 1} di ${nPagine}`;
    pag.drawText(tp, { x: L - M - font.widthOfTextAtSize(tp, 9), y: H - M - 27, size: 9, font, color: GRIGIO_T });

    const yTab = H - M - TESTATA;
    let x = M;
    const intestazioni: [string, number][] = [
      ...(conFoto ? ([["Foto", COL_FOTO]] as [string, number][]) : []),
      ...colonne.map((c, i) => [c.etichetta, larghezze[i]] as [string, number]),
    ];
    for (const [et, w] of intestazioni) {
      pag.drawRectangle({ x, y: yTab - INT_H, width: w, height: INT_H, color: rgb(0.93, 0.93, 0.93), borderColor: GRIGIO, borderWidth: 0.5 });
      const testo = spezzaTesto(pulisciTesto(et, bold), bold, dim, w - 6, 1)[0] ?? "";
      pag.drawText(testo, { x: x + 3, y: yTab - 12, size: dim, font: bold, color: NERO });
      x += w;
    }

    const da = p * perPagina;
    // L'ultima "riga" dell'ultima pagina e' il totale (indice righe.length).
    for (let i = 0; i < perPagina; i++) {
      const idx = da + i;
      if (idx > righe.length) break;
      const yAlto = yTab - INT_H - i * altezzaRiga;
      const yBasso = yAlto - altezzaRiga;
      const eTotale = idx === righe.length;
      if (eTotale && !haTotale) break;
      let xc = M;
      if (conFoto) {
        pag.drawRectangle({ x: xc, y: yBasso, width: COL_FOTO, height: altezzaRiga, borderColor: GRIGIO, borderWidth: 0.5 });
        if (!eTotale) {
          const mini = miniature[idx];
          if (mini) {
            try {
              const img = mini.tipo === "png" ? await doc.embedPng(mini.bytes) : await doc.embedJpg(mini.bytes);
              const sc = Math.min(48 / img.width, (altezzaRiga - 8) / img.height);
              pag.drawImage(img, { x: xc + 4, y: yBasso + 4, width: img.width * sc, height: img.height * sc });
            } catch {
              /* miniatura non leggibile: restano i link */
            }
          }
          const urls = righe[idx].fotoUrls.slice(0, MAX_LINK);
          urls.forEach((u, k) => {
            const t = `Foto ${k + 1}`;
            const xl = xc + 58;
            const yl = yAlto - 11 - k * 11;
            pag.drawText(t, { x: xl, y: yl, size: 8, font, color: BLU });
            const w = font.widthOfTextAtSize(t, 8);
            pag.drawLine({ start: { x: xl, y: yl - 1.5 }, end: { x: xl + w, y: yl - 1.5 }, thickness: 0.4, color: BLU });
            const a = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [xl, yl - 3, xl + w, yl + 9], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(u) } });
            const lista = annot.get(pag) ?? [];
            lista.push(doc.context.register(a));
            annot.set(pag, lista);
          });
          if (righe[idx].fotoUrls.length > MAX_LINK) {
            pag.drawText(`+${righe[idx].fotoUrls.length - MAX_LINK} altre`, { x: xc + 58, y: yAlto - 11 - MAX_LINK * 11, size: 7, font, color: GRIGIO_T });
          }
        }
        xc += COL_FOTO;
      }
      colonne.forEach((c, j) => {
        const w = larghezze[j];
        pag.drawRectangle({ x: xc, y: yBasso, width: w, height: altezzaRiga, borderColor: GRIGIO, borderWidth: 0.5 });
        let testo = "";
        let grassetto = false;
        if (eTotale) {
          grassetto = true;
          if (j === iPezzi) testo = String(totPezzi);
          else if (j === iValore) testo = euroIt(Math.round(totValore * 100) / 100);
          else if (j === colonne.findIndex((_, k) => k !== iPezzi && k !== iValore)) testo = "Totale";
        } else {
          testo = formatta(c, righe[idx]);
        }
        if (!eTotale && c.id.startsWith("libera")) {
          // Cella libera = campo compilabile (nome unico per riga e colonna).
          const campo = form.createTextField(`${c.id}_${idx}_${nCampi++}`);
          campo.addToPage(pag, {
            x: xc + 1.5,
            y: yBasso + 1.5,
            width: w - 3,
            height: altezzaRiga - 3,
            font,
            borderWidth: 0,
            backgroundColor: rgb(0.97, 0.97, 0.85),
            textColor: NERO,
          });
          campo.setFontSize(dim + 1);
          campo.updateAppearances(font);
          xc += w;
          return;
        }
        const f = grassetto ? bold : font;
        const linee = spezzaTesto(pulisciTesto(testo, f), f, dim, w - 6, maxRighe);
        linee.forEach((r, k) => pag.drawText(r, { x: xc + 3, y: yAlto - 11 - k * (dim + 2), size: dim, font: f, color: NERO }));
        xc += w;
      });
    }
  }

  for (const [pag, refs] of annot) {
    const es = pag.node.lookup(PDFName.of("Annots"));
    if (es instanceof PDFArray) for (const r of refs) es.push(r);
    else pag.node.set(PDFName.of("Annots"), doc.context.obj(refs));
  }
  if (nCampi > 0) {
    // Acrobat ricalcola l'aspetto di cio' che si scrive nei campi.
    form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  }
  return { bytes: await doc.save(), senzaMiniatura };
}
