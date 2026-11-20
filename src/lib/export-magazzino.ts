// Esporta dal Magazzino (Release 12, 2026-11-20). Logica PURA: nessun database,
// nessuna rete. Il chiamante (src/app/magazzino/export-actions.ts) legge gli
// sku e le foto e passa tutto qui.
//
// Decisioni del cliente (09w):
// - cosa si esporta = selezionati / filtrati / tutto, + "solo con pezzi", + proprietario;
// - giacenza: una riga per sku oppure una riga per sku e deposito;
// - colonne a scelta fra TUTTE (anche nascoste e campi personalizzati), riordinabili;
// - link = SOLO foto, mai gli annunci dei portali. Excel/CSV: solo il link della
//   foto PRIMARIA, nessuna immagine nelle celle. PDF: miniature + link Foto 1..N;
// - "Inventario FP" = modello con Valore = costo x pezzi come FORMULA Excel.
import * as XLSX from "xlsx";
import type { RigaMagazzino } from "@/db/queries";
import type { CampoPersonalizzato } from "./campi-personalizzati";
import { valoreComeTesto } from "./campi-personalizzati";

export type FormatoExport = "xlsx" | "csv" | "pdf";
export type GiacenzaExport = "sku" | "sku_deposito";

export type OpzioniExport = {
  ambito: "selezionati" | "filtrati" | "tutto";
  /** id degli sku per "selezionati" e "filtrati" (la lista che l'utente vede). */
  skuIds: number[];
  soloConPezzi: boolean;
  /** 0 = tutti i proprietari. */
  proprietarioId: number;
  giacenza: GiacenzaExport;
  formato: FormatoExport;
  /** id delle colonne, nell'ordine scelto. */
  colonne: string[];
  /** Riga titolo + riga data in testa al file (facoltativo). */
  titolo: string;
  conData: boolean;
  /** Solo PDF: miniatura della foto principale + link Foto 1..N in ogni riga. */
  pdfFoto: boolean;
};

export type ModelloExport = {
  nome: string;
  opzioni: Omit<OpzioniExport, "skuIds" | "ambito"> & { ambito: "selezionati" | "filtrati" | "tutto" };
};

// Contesto di una riga di esportazione (uno sku, oppure sku + deposito).
export type RigaExport = {
  r: RigaMagazzino;
  pezzi: number;
  proprietario: string;
  deposito: string;
  fotoUrls: string[];
};

type TipoCol = "testo" | "numero" | "euro" | "data" | "link";
export type DefinizioneColonnaExport = {
  id: string;
  etichetta: string;
  tipo: TipoCol;
  larghezza: number;
  valore: (x: RigaExport) => string | number | null;
};

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dataIt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

// Colonne fisse dell'elenco. L'ordine qui e' quello proposto nel dialogo.
export const COLONNE_EXPORT_FISSE: DefinizioneColonnaExport[] = [
  { id: "skuCode", etichetta: "Sku", tipo: "testo", larghezza: 14, valore: (x) => x.r.skuCode },
  { id: "artista", etichetta: "Artista", tipo: "testo", larghezza: 26, valore: (x) => x.r.artista },
  { id: "opera", etichetta: "Opera", tipo: "testo", larghezza: 40, valore: (x) => x.r.opera },
  { id: "larghezza", etichetta: "Larghezza (cm)", tipo: "numero", larghezza: 12, valore: (x) => num(x.r.larghezza) },
  { id: "altezza", etichetta: "Altezza (cm)", tipo: "numero", larghezza: 12, valore: (x) => num(x.r.altezza) },
  { id: "misura", etichetta: "Misura", tipo: "testo", larghezza: 14, valore: (x) => (x.r.larghezza || x.r.altezza ? `${x.r.larghezza ?? "?"} x ${x.r.altezza ?? "?"} cm` : "") },
  { id: "supporto", etichetta: "Supporto", tipo: "testo", larghezza: 14, valore: (x) => x.r.supporto ?? "" },
  { id: "anno", etichetta: "Anno / epoca", tipo: "testo", larghezza: 12, valore: (x) => x.r.anno ?? "" },
  { id: "tipo", etichetta: "Tipo", tipo: "testo", larghezza: 14, valore: (x) => x.r.tipo },
  { id: "condizione", etichetta: "Condizione", tipo: "testo", larghezza: 11, valore: (x) => x.r.condizione },
  { id: "tag", etichetta: "Tag", tipo: "testo", larghezza: 18, valore: (x) => x.r.tag ?? "" },
  { id: "note", etichetta: "Note", tipo: "testo", larghezza: 28, valore: (x) => x.r.note ?? "" },
  { id: "proprietario", etichetta: "Proprietario", tipo: "testo", larghezza: 14, valore: (x) => x.proprietario },
  { id: "deposito", etichetta: "Deposito", tipo: "testo", larghezza: 20, valore: (x) => x.deposito },
  { id: "pezzi", etichetta: "Pezzi", tipo: "numero", larghezza: 8, valore: (x) => x.pezzi },
  { id: "impegnato", etichetta: "Impegnati", tipo: "numero", larghezza: 10, valore: (x) => x.r.impegnato },
  { id: "costo", etichetta: "Costo unitario", tipo: "euro", larghezza: 14, valore: (x) => num(x.r.valoreCarico) },
  // Valore = costo x pezzi: in Excel e' una FORMULA (vedi costruisciXlsx).
  { id: "valore", etichetta: "Valore", tipo: "euro", larghezza: 12, valore: (x) => { const c = num(x.r.valoreCarico); return c === null ? null : Math.round(c * x.pezzi * 100) / 100; } },
  { id: "prezzoEbay", etichetta: "Prezzo eBay", tipo: "euro", larghezza: 12, valore: (x) => num(x.r.prezzoEbay) },
  { id: "prezzoShopify", etichetta: "Prezzo Shopify", tipo: "euro", larghezza: 14, valore: (x) => num(x.r.prezzoShopify) },
  { id: "prezzoSubito", etichetta: "Prezzo Subito", tipo: "euro", larghezza: 13, valore: (x) => num(x.r.prezzoSubito) },
  { id: "prezzoCatawiki", etichetta: "Prezzo Catawiki", tipo: "euro", larghezza: 14, valore: (x) => num(x.r.prezzoCatawiki) },
  { id: "riservaCatawiki", etichetta: "Riserva Catawiki", tipo: "euro", larghezza: 15, valore: (x) => num(x.r.riservaCatawiki) },
  { id: "prezzoBidspirit", etichetta: "Prezzo Bidspirit", tipo: "euro", larghezza: 15, valore: (x) => num(x.r.prezzoBidspirit) },
  { id: "riservaBidspirit", etichetta: "Riserva Bidspirit", tipo: "euro", larghezza: 16, valore: (x) => num(x.r.riservaBidspirit) },
  { id: "bloccato", etichetta: "Bloccato in vendita", tipo: "testo", larghezza: 12, valore: (x) => (x.r.bloccatoVendita ? "Sì" : "No") },
  { id: "numeroFoto", etichetta: "N. foto", tipo: "numero", larghezza: 8, valore: (x) => x.fotoUrls.length },
  // Solo link alle FOTO (mai agli annunci dei portali).
  { id: "fotoPrimaria", etichetta: "Foto principale (link)", tipo: "link", larghezza: 30, valore: (x) => x.fotoUrls[0] ?? "" },
  { id: "creato", etichetta: "Creato il", tipo: "data", larghezza: 12, valore: (x) => dataIt(x.r.createdAt) },
  { id: "aggiornato", etichetta: "Aggiornato il", tipo: "data", larghezza: 13, valore: (x) => dataIt(x.r.updatedAt) },
];

// Colonne proposte al primo uso (poi l'utente sceglie).
export const COLONNE_EXPORT_DEFAULT = ["skuCode", "artista", "opera", "misura", "anno", "condizione", "deposito", "pezzi", "costo", "valore"];

export function catalogoColonne(campi: CampoPersonalizzato[]): DefinizioneColonnaExport[] {
  const personalizzati: DefinizioneColonnaExport[] = campi.map((c) => ({
    id: `cp_${c.id}`,
    etichetta: c.nome,
    tipo: c.tipo === "numero" ? "numero" : "testo",
    larghezza: 16,
    valore: (x) => {
      const v = x.r.campiPersonalizzati[String(c.id)];
      if (v === undefined || v === null) return "";
      if (c.tipo === "numero" && typeof v === "number") return v;
      return valoreComeTesto(v);
    },
  }));
  return [...COLONNE_EXPORT_FISSE, ...personalizzati];
}

// Costruisce le righe di esportazione dalla giacenza. Una riga per sku, oppure
// una per sku e deposito. Con proprietario scelto contano solo i suoi pezzi.
export function costruisciRighe(
  righe: RigaMagazzino[],
  foto: Map<number, string[]>,
  o: Pick<OpzioniExport, "soloConPezzi" | "proprietarioId" | "giacenza">
): RigaExport[] {
  const out: RigaExport[] = [];
  for (const r of righe) {
    const urls = foto.get(r.id) ?? [];
    const g = r.giacenze.filter((x) => (o.proprietarioId ? x.proprietarioId === o.proprietarioId : true) && (o.soloConPezzi ? x.saldo > 0 : x.saldo !== 0));
    if (o.giacenza === "sku_deposito") {
      if (g.length === 0) {
        // Sku senza giacenza: resta in elenco solo se non si chiedono i soli pezzi e non si filtra un proprietario.
        if (!o.soloConPezzi && !o.proprietarioId) out.push({ r, pezzi: 0, proprietario: "", deposito: "", fotoUrls: urls });
        continue;
      }
      for (const x of g) out.push({ r, pezzi: x.saldo, proprietario: x.proprietarioNome, deposito: x.ubicazioneNome, fotoUrls: urls });
    } else {
      const pezzi = g.reduce((s, x) => s + x.saldo, 0);
      if (o.soloConPezzi && pezzi <= 0) continue;
      if (o.proprietarioId && g.length === 0) continue;
      const proprietari = Array.from(new Set(g.map((x) => x.proprietarioNome))).join(", ");
      const perDeposito = new Map<string, number>();
      for (const x of g) perDeposito.set(x.ubicazioneNome, (perDeposito.get(x.ubicazioneNome) ?? 0) + x.saldo);
      const deposito = Array.from(perDeposito.entries()).map(([n, q]) => `${n} (${q})`).join(", ");
      out.push({ r, pezzi, proprietario: proprietari, deposito, fotoUrls: urls });
    }
  }
  return out;
}

export function colonneScelte(catalogo: DefinizioneColonnaExport[], ids: string[]): DefinizioneColonnaExport[] {
  const mappa = new Map(catalogo.map((c) => [c.id, c]));
  return ids.map((id) => mappa.get(id)).filter((c): c is DefinizioneColonnaExport => Boolean(c));
}

function lettera(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function dataOggiIt(): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

// File Excel: titolo/data facoltativi, intestazioni, righe. "Valore" e' la
// formula costo x pezzi (se le colonne Costo e Pezzi sono presenti) e in fondo
// c'e' la riga Totale con SUM su Pezzi e Valore. Nessuna immagine nelle celle:
// la foto principale e' un collegamento cliccabile.
export function costruisciXlsx(cols: DefinizioneColonnaExport[], righe: RigaExport[], titolo: string, conData: boolean): Buffer {
  const aoa: (string | number | null)[][] = [];
  if (titolo.trim()) aoa.push([titolo.trim()]);
  if (conData) aoa.push([`Data: ${dataOggiIt()}`]);
  if (titolo.trim() || conData) aoa.push([]);
  const rigaInt = aoa.length; // indice (0-based) della riga intestazioni
  aoa.push(cols.map((c) => c.etichetta));
  for (const x of righe) aoa.push(cols.map((c) => c.valore(x)));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const iCosto = cols.findIndex((c) => c.id === "costo");
  const iPezzi = cols.findIndex((c) => c.id === "pezzi");
  const iValore = cols.findIndex((c) => c.id === "valore");
  const primaDati = rigaInt + 1; // 0-based
  const ultimaDati = rigaInt + righe.length; // 0-based

  righe.forEach((x, k) => {
    const riga0 = primaDati + k;
    cols.forEach((c, j) => {
      const ref = XLSX.utils.encode_cell({ r: riga0, c: j });
      const cella = ws[ref];
      if (!cella) return;
      if (c.id === "valore" && iCosto >= 0 && iPezzi >= 0) {
        const costo = `${lettera(iCosto)}${riga0 + 1}`;
        const pezzi = `${lettera(iPezzi)}${riga0 + 1}`;
        const calcolato = c.valore(x);
        // Con il valore gia' calcolato in cache il file si legge bene anche in anteprima; Excel ricalcola comunque.
        ws[ref] = { t: "n", f: `IF(${costo}="","",${costo}*${pezzi})`, z: "#,##0.00", ...(typeof calcolato === "number" ? { v: calcolato } : {}) };
      } else if (c.tipo === "euro" && cella.t === "n") {
        cella.z = "#,##0.00";
      } else if (c.tipo === "link" && typeof cella.v === "string" && cella.v) {
        cella.l = { Target: cella.v, Tooltip: "Apri la foto" };
      }
    });
  });

  // Riga Totale (solo se ci sono Pezzi e/o Valore e almeno una riga).
  if (righe.length > 0 && (iPezzi >= 0 || iValore >= 0)) {
    const rigaTot0 = ultimaDati + 1;
    if (iPezzi >= 0) {
      const col = lettera(iPezzi);
      ws[XLSX.utils.encode_cell({ r: rigaTot0, c: iPezzi })] = { t: "n", f: `SUM(${col}${primaDati + 1}:${col}${ultimaDati + 1})`, v: righe.reduce((t, x) => t + x.pezzi, 0) };
    }
    if (iValore >= 0) {
      const col = lettera(iValore);
      const totaleValore = righe.reduce((t, x) => { const v = cols[iValore].valore(x); return t + (typeof v === "number" ? v : 0); }, 0);
      ws[XLSX.utils.encode_cell({ r: rigaTot0, c: iValore })] = { t: "n", f: `SUM(${col}${primaDati + 1}:${col}${ultimaDati + 1})`, z: "#,##0.00", v: Math.round(totaleValore * 100) / 100 };
    }
    const iPrima = cols.findIndex((_, j) => j !== iPezzi && j !== iValore);
    if (iPrima >= 0) ws[XLSX.utils.encode_cell({ r: rigaTot0, c: iPrima })] = { t: "s", v: "Totale" };
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rigaTot0, c: Math.max(cols.length - 1, 0) } });
  }
  ws["!cols"] = cols.map((c) => ({ wch: c.larghezza }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Magazzino");
  // Le formule non hanno un valore salvato: SheetJS scrive fullCalcOnLoad e Excel le calcola all'apertura.
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// CSV per Excel italiano: separatore ";", virgola decimale, BOM UTF-8.
export function costruisciCsv(cols: DefinizioneColonnaExport[], righe: RigaExport[], titolo: string, conData: boolean): string {
  const esc = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cella = (c: DefinizioneColonnaExport, x: RigaExport) => {
    const v = c.valore(x);
    if (v === null || v === "") return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    return esc(String(v));
  };
  const linee: string[] = [];
  if (titolo.trim()) linee.push(esc(titolo.trim()));
  if (conData) linee.push(esc(`Data: ${dataOggiIt()}`));
  if (titolo.trim() || conData) linee.push("");
  linee.push(cols.map((c) => esc(c.etichetta)).join(";"));
  for (const x of righe) linee.push(cols.map((c) => cella(c, x)).join(";"));
  return "﻿" + linee.join("\r\n") + "\r\n";
}

export function nomeFileExport(formato: FormatoExport): string {
  const p = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `magazzino_${g("year")}${g("month")}${g("day")}_${g("hour")}${g("minute")}.${formato}`;
}
