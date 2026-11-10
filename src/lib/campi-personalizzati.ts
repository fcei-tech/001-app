// Campi personalizzati degli sku (Release 9, 2026-11-10). Logica PURA (nessun
// database): tipi, validazione dei valori, conversione fra campi per lo
// strumento "Copia da campo a campo" con anteprima.

export const TIPI_CAMPO = ["testo", "numero", "elenco", "si_no"] as const;
export type TipoCampo = (typeof TIPI_CAMPO)[number];

export const ETICHETTA_TIPO_CAMPO: Record<TipoCampo, string> = {
  testo: "Testo libero",
  numero: "Numero",
  elenco: "Scelta da elenco",
  si_no: "Sì / No",
};

export type CampoPersonalizzato = { id: number; nome: string; tipo: TipoCampo; opzioni: string[]; ordine: number };
export type ValoreCampo = string | number | boolean;
export type ValoriCampi = Record<string, ValoreCampo>;

export const NOME_CAMPO_MAX = 40;

export function eTipoCampo(v: unknown): v is TipoCampo {
  return typeof v === "string" && (TIPI_CAMPO as readonly string[]).includes(v);
}

// Dal jsonb del database a un campo ben formato (mai un errore: dati strani
// diventano "testo senza opzioni").
export function campoDaRiga(r: { id: number; nome: string; tipo: string; opzioni: unknown; ordine: number }): CampoPersonalizzato {
  const opzioni = Array.isArray(r.opzioni) ? r.opzioni.filter((o): o is string => typeof o === "string") : [];
  return { id: r.id, nome: r.nome, tipo: eTipoCampo(r.tipo) ? r.tipo : "testo", opzioni, ordine: r.ordine };
}

export function pulisciNomeCampo(nome: string): string {
  const n = nome.trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Scrivi un nome per il campo.");
  if (n.length > NOME_CAMPO_MAX) throw new Error(`Il nome può avere al massimo ${NOME_CAMPO_MAX} caratteri.`);
  return n;
}

// "Lana, Seta,  lana" -> ["Lana", "Seta"] (senza doppioni, senza vuoti).
export function parseOpzioni(testo: string): string[] {
  const viste = new Set<string>();
  const out: string[] = [];
  for (const parte of testo.split(/[\n,;]/)) {
    const o = parte.trim();
    if (!o) continue;
    const k = o.toLowerCase();
    if (viste.has(k)) continue;
    viste.add(k);
    out.push(o);
  }
  return out;
}

const VERO = new Set(["si", "sì", "s", "yes", "y", "true", "vero", "1", "x", "ok"]);
const FALSO = new Set(["no", "n", "false", "falso", "0"]);

// Scritto a mano (form, cella, importazione): testo grezzo -> valore valido per
// il tipo, oppure null = campo vuoto. Un valore non valido e' un errore.
export function normalizzaValoreCampo(campo: CampoPersonalizzato, grezzo: unknown): ValoreCampo | null {
  if (grezzo === null || grezzo === undefined) return null;
  if (campo.tipo === "si_no") {
    if (typeof grezzo === "boolean") return grezzo;
    const t = String(grezzo).trim().toLowerCase();
    if (t === "") return null;
    if (VERO.has(t)) return true;
    if (FALSO.has(t)) return false;
    throw new Error(`${campo.nome}: scegli Sì o No.`);
  }
  const t = typeof grezzo === "string" ? grezzo.trim() : String(grezzo).trim();
  if (t === "") return null;
  if (campo.tipo === "numero") {
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) throw new Error(`${campo.nome}: scrivi un numero.`);
    return n;
  }
  if (campo.tipo === "elenco") {
    const trovata = campo.opzioni.find((o) => o.toLowerCase() === t.toLowerCase());
    if (trovata === undefined) throw new Error(`${campo.nome}: "${t}" non è nell'elenco.`);
    return trovata;
  }
  if (t.length > 500) throw new Error(`${campo.nome}: massimo 500 caratteri.`);
  return t;
}

// Come sopra, ma senza errori: per la COPIA fra campi, dove un valore che non
// si puo' convertire viene solo saltato (e contato nell'anteprima).
export type Conversione = { ok: true; valore: ValoreCampo } | { ok: false; motivo: "vuoto" | "non_convertibile" };

export function convertiValore(origine: unknown, destinazione: CampoPersonalizzato): Conversione {
  if (origine === null || origine === undefined || (typeof origine === "string" && origine.trim() === "")) {
    return { ok: false, motivo: "vuoto" };
  }
  try {
    const v = normalizzaValoreCampo(destinazione, origine);
    return v === null ? { ok: false, motivo: "vuoto" } : { ok: true, valore: v };
  } catch {
    return { ok: false, motivo: "non_convertibile" };
  }
}

export function valoreComeTesto(v: ValoreCampo | undefined | null): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "Sì" : "No";
  return String(v);
}

export function leggiValori(grezzo: unknown): ValoriCampi {
  if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) return {};
  const out: ValoriCampi = {};
  for (const [k, v] of Object.entries(grezzo as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

// --- Strumento "Copia da campo a campo" ---------------------------------------
// Origine = un campo standard dello sku oppure un altro campo personalizzato.
// Destinazione = SEMPRE un campo personalizzato (i campi standard non si
// sovrascrivono da qui).
export const CAMPI_STANDARD_ORIGINE: { chiave: string; etichetta: string }[] = [
  { chiave: "note", etichetta: "Note" },
  { chiave: "supporto", etichetta: "Supporto" },
  { chiave: "anno", etichetta: "Anno / epoca" },
  { chiave: "artista", etichetta: "Artista" },
  { chiave: "opera", etichetta: "Opera" },
  { chiave: "valoreCarico", etichetta: "Valore di carico" },
  { chiave: "prezzoEbay", etichetta: "Prezzo eBay" },
  { chiave: "prezzoCatawiki", etichetta: "Prezzo Catawiki" },
  { chiave: "riservaCatawiki", etichetta: "Riserva Catawiki" },
  { chiave: "prezzoShopify", etichetta: "Prezzo Shopify" },
  { chiave: "prezzoSubito", etichetta: "Prezzo Subito" },
  { chiave: "prezzoBidspirit", etichetta: "Prezzo Bidspirit" },
  { chiave: "riservaBidspirit", etichetta: "Riserva Bidspirit" },
];

export type SkuPerCopia = { id: number; skuCode: string; origine: unknown; destinazione: ValoreCampo | undefined };

export type PianoCopia = {
  daCopiare: { skuId: number; skuCode: string; valore: ValoreCampo; sostituisce: ValoreCampo | undefined }[];
  saltatiDestinazionePiena: number;
  origineVuota: number;
  nonConvertibili: { skuCode: string; valore: string }[];
};

export function pianificaCopia(sku: SkuPerCopia[], destinazione: CampoPersonalizzato, soloDoveVuota: boolean): PianoCopia {
  const piano: PianoCopia = { daCopiare: [], saltatiDestinazionePiena: 0, origineVuota: 0, nonConvertibili: [] };
  for (const s of sku) {
    const c = convertiValore(s.origine, destinazione);
    if (!c.ok) {
      if (c.motivo === "vuoto") piano.origineVuota++;
      else piano.nonConvertibili.push({ skuCode: s.skuCode, valore: String(s.origine) });
      continue;
    }
    if (soloDoveVuota && s.destinazione !== undefined) {
      piano.saltatiDestinazionePiena++;
      continue;
    }
    if (s.destinazione !== undefined && s.destinazione === c.valore) {
      piano.saltatiDestinazionePiena++;
      continue;
    }
    piano.daCopiare.push({ skuId: s.id, skuCode: s.skuCode, valore: c.valore, sostituisce: s.destinazione });
  }
  return piano;
}
