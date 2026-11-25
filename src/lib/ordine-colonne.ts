"use client";

// Ordine delle colonne scelto dall'utente trascinando le intestazioni (2026-11-25).
// Preferenza personale di questo Mac (localStorage), una per tabella (chiave).
// Valido per ogni tabella con colonne scelte: Magazzino, selettore lotti, elenco batch.
import { useCallback, useSyncExternalStore } from "react";

const VUOTO: string[] = [];
const cache = new Map<string, string[]>();
const ascoltatori = new Set<() => void>();

function leggi(chiave: string): string[] {
  const gia = cache.get(chiave);
  if (gia) return gia;
  if (typeof window === "undefined") return VUOTO;
  let v = VUOTO;
  try {
    const s = window.localStorage.getItem(chiave);
    const p = s ? JSON.parse(s) : null;
    if (Array.isArray(p)) v = p.filter((x): x is string => typeof x === "string");
  } catch {
    // niente ordine salvato leggibile: ordine di fabbrica
  }
  cache.set(chiave, v);
  return v;
}

function scrivi(chiave: string, v: string[]) {
  cache.set(chiave, v);
  try {
    window.localStorage.setItem(chiave, JSON.stringify(v));
  } catch {
    // non salvato (storage bloccato): vale finche' l'app e' aperta
  }
  ascoltatori.forEach((l) => l());
}

function sottoscrivi(l: () => void) {
  ascoltatori.add(l);
  return () => {
    ascoltatori.delete(l);
  };
}

export function useOrdineColonne(chiave: string): [string[], (nuovo: string[]) => void] {
  const ordine = useSyncExternalStore(sottoscrivi, () => leggi(chiave), () => VUOTO);
  const imposta = useCallback((nuovo: string[]) => scrivi(chiave, nuovo), [chiave]);
  return [ordine, imposta];
}

// Mette le voci nell'ordine salvato; quelle non presenti nell'ordine restano in coda, nel loro ordine di fabbrica.
export function applicaOrdine<T>(voci: T[], ordine: string[], id: (t: T) => string): T[] {
  if (ordine.length === 0) return voci;
  const posizione = new Map(ordine.map((x, i) => [x, i]));
  return voci
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (posizione.get(id(a.v)) ?? 1e6 + a.i) - (posizione.get(id(b.v)) ?? 1e6 + b.i))
    .map((x) => x.v);
}

// Sposta la colonna "da" nel posto della colonna "a". Ritorna il nuovo ordine completo:
// le colonne visibili come ora, poi quelle nascoste che avevano gia' una posizione salvata.
export function spostaColonna(visibili: string[], salvato: string[], da: string, a: string): string[] {
  if (da === a) return salvato;
  const nuovo = visibili.filter((x) => x !== da);
  const pos = visibili.indexOf(a);
  const inserisciDopo = visibili.indexOf(da) < pos;
  const indice = nuovo.indexOf(a) + (inserisciDopo ? 1 : 0);
  nuovo.splice(indice, 0, da);
  return [...nuovo, ...salvato.filter((x) => !nuovo.includes(x))];
}
