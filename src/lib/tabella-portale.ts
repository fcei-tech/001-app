// Tabella unica di un portale statico (2026-10-27): per ogni sku decide cosa
// succede al prossimo file. Funzioni pure, nessun database.
//
// Stato di una riga:
//  - nuovo       = non e' in vetrina e dovrebbe esserci (verde)
//  - modificato  = e' in vetrina ma pezzi / prezzo / testo sono da aggiornare (giallo)
//  - esaurito    = e' in vetrina con pezzi > 0 e ora dovrebbe essere a 0 (arancio)
//  - archiviare  = e' in vetrina ma e' bloccato o ritirato (rosso)
//  - online      = nessuna modifica (grigio); "esauritoOnline" = in vetrina a 0 pezzi
//
// Regole sui pezzi: fascia automatica sul disponibile libero (1-4 → 1, 5-8 → 2,
// 9+ → 3); un valore scritto a mano vince ma non supera mai il disponibile.
// Senza valore a mano si segnalano solo le DIMINUZIONI (come prima: gli
// aumenti automatici non fanno lavoro inutile), tranne il ritorno da esaurito.

import { prezziDiversi } from "@/lib/esposizione";

export type StatoRiga = "nuovo" | "modificato" | "esaurito" | "archiviare" | "online";
export type MotivoModifica = "pezzi" | "prezzo" | "testo" | "disponibile";

export const ETICHETTA_STATO: Record<StatoRiga, string> = {
  nuovo: "Nuovo",
  modificato: "Da modificare",
  esaurito: "Esaurito",
  archiviare: "Da archiviare",
  online: "Online",
};

export const ETICHETTA_MOTIVO_MODIFICA: Record<MotivoModifica, string> = {
  pezzi: "Pezzi",
  prezzo: "Prezzo cambiato",
  testo: "Testo modificato",
  disponibile: "Di nuovo disponibile",
};

export type InputRigaPortale = {
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  bloccatoQui: boolean;
  ritirato: boolean;
  libero: number;
  quantitaAutomatica: number; // dalla fascia (o fissa del canale)
  prezzoOggi: number | null; // prezzo calcolato per quel portale
  reg: {
    inVetrina: boolean;
    quantitaCaricata: number;
    prezzoCaricato: number | null;
    aggiornatoAt: Date;
    idPortale: string | null;
    titoloPortale: string | null;
    testoInviato: boolean;
  } | null;
  ov: {
    quantita: number | null;
    condizione: string | null;
    descrizione: string | null;
    modificatoAt: Date;
  } | null;
};

export type RigaPortale = {
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  stato: StatoRiga;
  motivi: MotivoModifica[];
  inVetrina: boolean;
  ritirato: boolean;
  pezziOra: number;
  pezziDopo: number;
  pezziOverride: number | null;
  condizioneOverride: string | null;
  descrizioneOverride: string | null;
  prezzoOnline: number | null;
  prezzoOggi: number | null;
  esauritoOnline: boolean;
  mancaPrezzo: boolean;
  // Il prodotto esiste gia' sul portale (handle / numero oggetto noti):
  // rimetterlo in vetrina e' una riattivazione, non una creazione.
  idPortale: string | null;
  titoloPortale: string | null;
};

// null = la riga non compare in tabella (non e' in vetrina e non deve entrarci).
export function calcolaRigaPortale(i: InputRigaPortale): RigaPortale | null {
  const inVetrina = i.reg?.inVetrina ?? false;
  const pezziOra = inVetrina ? (i.reg?.quantitaCaricata ?? 0) : 0;
  const pezziOverride = i.ov?.quantita ?? null;
  const dopo = i.bloccatoQui ? 0 : Math.min(pezziOverride ?? i.quantitaAutomatica, i.libero);

  const base = {
    skuId: i.skuId,
    skuCode: i.skuCode,
    artista: i.artista,
    opera: i.opera,
    inVetrina,
    ritirato: i.ritirato,
    pezziOra,
    pezziDopo: dopo,
    pezziOverride,
    condizioneOverride: i.ov?.condizione ?? null,
    descrizioneOverride: i.ov?.descrizione ?? null,
    prezzoOnline: inVetrina ? (i.reg?.prezzoCaricato ?? null) : null,
    prezzoOggi: i.prezzoOggi,
    mancaPrezzo: i.prezzoOggi === null,
    idPortale: i.reg?.idPortale ?? null,
    titoloPortale: i.reg?.titoloPortale ?? null,
  };

  if (!inVetrina) {
    if (i.bloccatoQui || dopo <= 0) return null;
    return { ...base, stato: "nuovo", motivi: [], esauritoOnline: false };
  }

  if (i.bloccatoQui) {
    return { ...base, pezziDopo: 0, stato: "archiviare", motivi: [], esauritoOnline: false };
  }

  const motivi: MotivoModifica[] = [];
  if (dopo === 0) {
    if (pezziOra > 0) return { ...base, stato: "esaurito", motivi: ["pezzi"], esauritoOnline: false };
  } else if (pezziOra === 0) {
    motivi.push("disponibile");
  } else if (pezziOverride !== null ? dopo !== pezziOra : pezziOra > dopo) {
    motivi.push("pezzi");
  }
  if (prezziDiversi(i.reg?.prezzoCaricato ?? null, i.prezzoOggi)) motivi.push("prezzo");
  const haTesto = i.ov !== null && (i.ov.condizione !== null || i.ov.descrizione !== null);
  if (haTesto && i.reg && i.ov!.modificatoAt.getTime() > i.reg.aggiornatoAt.getTime()) motivi.push("testo");
  // Tornati ai valori automatici ma sul portale c'e' ancora il testo personalizzato: da rimandare.
  if (!haTesto && i.reg?.testoInviato) motivi.push("testo");

  if (motivi.length > 0) return { ...base, stato: "modificato", motivi, esauritoOnline: false };
  return { ...base, stato: "online", motivi: [], esauritoOnline: dopo === 0 };
}

// Riga del file da mandare al portale (e da registrare alla conferma).
export type AzioneFile = "nuovo" | "riattiva" | "modifica" | "esaurito" | "archivia";
export type RigaFile = {
  skuId: number;
  azione: AzioneFile;
  pezzi: number;
  prezzo: number | null;
  testo: boolean; // il testo (condizione/descrizione) va rimandato
  idPortale?: string | null; // handle / numero oggetto da registrare (nuovi)
  titolo?: string | null;
};

export function azioneDaStato(stato: StatoRiga): AzioneFile | null {
  if (stato === "nuovo") return "nuovo";
  if (stato === "modificato") return "modifica";
  if (stato === "esaurito") return "esaurito";
  if (stato === "archiviare") return "archivia";
  return null;
}

export function riassuntoModifiche(righe: RigaPortale[]): { totale: number; nuovi: number; modificati: number; esauriti: number; archiviati: number } {
  const r = { totale: 0, nuovi: 0, modificati: 0, esauriti: 0, archiviati: 0 };
  for (const x of righe) {
    if (x.stato === "online") continue;
    r.totale++;
    if (x.stato === "nuovo") r.nuovi++;
    else if (x.stato === "modificato") r.modificati++;
    else if (x.stato === "esaurito") r.esauriti++;
    else if (x.stato === "archiviare") r.archiviati++;
  }
  return r;
}
