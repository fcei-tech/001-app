// Schede create dal telefono (Release 11). Formato del file "schede.json" che
// la pagina del telefono mette nello zip insieme alle foto (cartella foto/).
// La pagina del telefono e' un file HTML a se' (public/schede-telefono.html
// nella repo, da incollare nel tema Shopify): replica queste regole a mano.

export const FORMATO_SCHEDE = "posterclub-schede";
export const VERSIONE_SCHEDE = 1;
export const SOGLIA_CATAWIKI_SCHEDE = 200;

export type SchedaTelefono = {
  codice: string; // Z-NNNNN, dal blocco prenotato
  proprieta: "FP" | "CV";
  artista: string;
  opera: string;
  larghezza: string;
  altezza: string;
  anno: string;
  supporto: "Telato" | "Cornice" | "";
  condizione: string;
  note: string;
  prezzoEbay: string;
  prezzoCatawiki: string;
  costo: string; // solo FP, facoltativo
  quantita: number;
  proprietario: string; // testo libero ("" = in base a FP/CV); BATCH lo confronta coi nomi dei proprietari
  tipo: string; // testo libero ("" = tipo predefinito); confrontato coi tipi oggetto
  tag: string;
  riservaCatawiki: string;
  prezzoShopify: string;
  prezzoSubito: string;
  prezzoBidspirit: string;
  riservaBidspirit: string;
  deposito: string; // testo libero scritto sul telefono ("" = deposito principale); BATCH lo confronta coi nomi dei depositi
  foto: string[]; // nomi file nello zip, in ordine (cartella foto/)
};

export type FileSchede = { formato: string; versione: number; creato: string; schede: SchedaTelefono[] };

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

function testo(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

// Legge e normalizza il JSON: errore chiaro se il file non e' delle schede.
export function leggiFileSchede(grezzo: unknown): FileSchede {
  const o = grezzo as Partial<FileSchede> | null;
  if (!o || o.formato !== FORMATO_SCHEDE || !Array.isArray(o.schede)) {
    throw new Error("Questo zip non contiene schede del telefono (schede.json mancante o diverso).");
  }
  if (o.versione !== VERSIONE_SCHEDE) throw new Error(`Versione schede ${o.versione} non supportata da questa versione di BATCH.`);
  const schede = o.schede.map((s, i): SchedaTelefono => {
    const x = s as Partial<SchedaTelefono>;
    const codice = testo(x.codice);
    if (!/^Z-\d+$/.test(codice)) throw new Error(`Scheda ${i + 1}: codice "${codice}" non valido.`);
    return {
      codice,
      proprieta: x.proprieta === "CV" ? "CV" : "FP",
      artista: testo(x.artista),
      opera: testo(x.opera),
      larghezza: testo(x.larghezza),
      altezza: testo(x.altezza),
      anno: testo(x.anno),
      supporto: x.supporto === "Telato" || x.supporto === "Cornice" ? x.supporto : "",
      condizione: CONDIZIONI.includes(testo(x.condizione)) ? testo(x.condizione) : "A-",
      note: testo(x.note),
      prezzoEbay: testo(x.prezzoEbay),
      prezzoCatawiki: testo(x.prezzoCatawiki),
      costo: testo(x.costo),
      quantita: Number.isFinite(Number(x.quantita)) && Number(x.quantita) > 0 ? Math.floor(Number(x.quantita)) : 1,
      deposito: testo(x.deposito),
      proprietario: testo(x.proprietario),
      tipo: testo(x.tipo),
      tag: testo(x.tag),
      riservaCatawiki: testo(x.riservaCatawiki),
      prezzoShopify: testo(x.prezzoShopify),
      prezzoSubito: testo(x.prezzoSubito),
      prezzoBidspirit: testo(x.prezzoBidspirit),
      riservaBidspirit: testo(x.riservaBidspirit),
      foto: Array.isArray(x.foto) ? x.foto.map(testo).filter(Boolean) : [],
    };
  });
  const visti = new Set<string>();
  for (const s of schede) {
    if (visti.has(s.codice)) throw new Error(`Codice ${s.codice} ripetuto nello zip.`);
    visti.add(s.codice);
  }
  return { formato: FORMATO_SCHEDE, versione: VERSIONE_SCHEDE, creato: testo(o.creato), schede };
}

function numero(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
}

// Cosa manca per pubblicare (stesse regole di Controllo dati; supporto vuoto = carta normale, non blocca).
export function mancaNellaScheda(s: SchedaTelefono): string[] {
  const m: string[] = [];
  if (!s.artista || s.artista === "…") m.push("artista");
  if (!s.opera || s.opera === "…") m.push("opera");
  if (s.foto.length === 0) m.push("foto");
  if (!numero(s.larghezza) || !numero(s.altezza)) m.push("misure");
  if (!s.anno) m.push("anno");
  if (numero(s.prezzoEbay) === null) m.push("prezzo eBay");
  const c = numero(s.prezzoCatawiki);
  if (c === null || c < SOGLIA_CATAWIKI_SCHEDE) m.push("prezzo Catawiki");
  return m;
}
