"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { sku } from "@/db/schema";
import { getCanaleById } from "@/db/pubblicazione-queries";
import { getFotoPerSkuIds } from "@/db/queries";
import { annullaModifiche, impostaBlocco } from "@/db/esposizione-queries";
import {
  applicaRighe,
  confermaFilePortale,
  getTabellaCanale,
  rigaFileDa,
  ripristinaOverride,
  salvaFilePortale,
  salvaOverride,
  scartaFilePortale,
  type CampoOverride,
} from "@/db/portale-queries";
import type { Annullabile } from "@/lib/esposizione";
import type { RigaFile, RigaPortale } from "@/lib/tabella-portale";
import {
  ETICHETTA_SCARTO_SHOPIFY,
  generaCsvShopify,
  motivoScarto,
  type AggiornamentoShopify,
  type RigaShopifyInput,
} from "@/lib/shopify-export";

// Esito restituito (mai eccezioni): in produzione Next maschera il testo
// degli errori lanciati da una server action.
export type EsitoEsposizione = {
  ok: boolean;
  errore?: string;
  messaggio?: string;
  annullabile?: Annullabile;
  // Operazioni su piu' portali insieme: un annullabile per portale.
  annullabili?: Annullabile[];
};

function aggiorna(canaleId?: number) {
  if (canaleId) revalidatePath(`/pubblicazione/${canaleId}`);
  revalidatePath("/pubblicazione");
  revalidatePath("/");
}

export async function impostaBloccoPortaleAction(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean,
  motivo: "blocco" | "ritiro" = "blocco"
): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0 || !Number.isInteger(canaleId)) return { ok: false, errore: "Selezione non valida." };
    const m = motivo === "ritiro" ? "ritiro" : "blocco";
    const { annullabile } = await impostaBlocco(ids, canaleId, bloccato, m);
    aggiorna(canaleId);
    const parola = m === "ritiro" ? ["ritirati da questo portale", "rimessi in vendita"] : ["bloccati su questo portale", "sbloccati"];
    return {
      ok: true,
      messaggio: `${ids.length} sku ${bloccato ? parola[0] : parola[1]}.`,
      annullabile,
    };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// "Ritira da…" / "Rimetti in vendita": stessa operazione su PIU' portali
// insieme. Gli sku ritirati finiscono in "Da togliere" di ognuno; si
// rimettono con "Rimetti in vendita" (Magazzino, scheda sku o lista Ritirati
// del portale).
export async function ritiraDaPortaliAction(
  skuIds: number[],
  canaleIds: number[],
  ritirare: boolean
): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    const canali = [...new Set(canaleIds.filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0 || canali.length === 0) return { ok: false, errore: "Scegli almeno un portale." };
    const annullabili: Annullabile[] = [];
    for (const canaleId of canali) {
      const { annullabile } = await impostaBlocco(ids, canaleId, ritirare, "ritiro");
      if (annullabile) annullabili.push(annullabile);
      aggiorna(canaleId);
    }
    return {
      ok: true,
      messaggio: ritirare
        ? `${ids.length} sku ritirati da ${canali.length} ${canali.length === 1 ? "portale" : "portali"}: li trovi in "Da togliere".`
        : `${ids.length} sku rimessi in vendita su ${canali.length} ${canali.length === 1 ? "portale" : "portali"}.`,
      annullabili,
    };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function annullaEsposizioneAction(a: Annullabile): Promise<EsitoEsposizione> {
  try {
    const r = await annullaModifiche(a);
    if (!r.ok) return { ok: false, errore: r.errore ?? "Annulla non riuscito." };
    aggiorna(a.canaleId);
    return { ok: true, messaggio: "Operazione annullata." };
  } catch (e) {
    return { ok: false, errore: `Annulla non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// --- Tabella portale (2026-10-27) ----------------------------------------------

function righeDaInviare(tabella: RigaPortale[], skuIds?: number[]): RigaPortale[] {
  const ids = skuIds && skuIds.length > 0 ? new Set(skuIds) : null;
  return tabella.filter((r) => r.stato !== "online" && (!ids || ids.has(r.skuId)));
}

export async function salvaCellaPortaleAction(
  skuId: number,
  canaleId: number,
  campo: CampoOverride,
  valore: string | null
): Promise<EsitoEsposizione> {
  try {
    if (!Number.isInteger(skuId) || !Number.isInteger(canaleId)) return { ok: false, errore: "Dati non validi." };
    if (campo !== "quantita" && campo !== "condizione" && campo !== "descrizione") return { ok: false, errore: "Campo non valido." };
    const r = await salvaOverride(skuId, canaleId, campo, valore);
    aggiorna(canaleId);
    return r.ok ? { ok: true } : { ok: false, errore: r.errore };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function ripristinaCellePortaleAction(skuIds: number[], canaleId: number): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return { ok: false, errore: "Seleziona almeno uno sku." };
    await ripristinaOverride(ids, canaleId);
    aggiorna(canaleId);
    return { ok: true, messaggio: `${ids.length} sku tornati ai valori automatici.` };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// File Shopify con TUTTO quello che c'e' da mandare: prodotti nuovi (con foto)
// e aggiornamenti (pezzi, prezzo, esaurito, archiviato). NON cambia lo stato
// della tabella: salva l'elenco delle righe incluse, che "Ho caricato il file"
// registrera' esattamente. Se ci sono sku selezionati, solo quelli.
export type EsitoFileShopify = {
  ok: boolean;
  errore?: string;
  csv?: string;
  filename?: string;
  inclusi?: number;
  scartati?: { skuCode: string; artista: string; opera: string; motivo: string }[];
};

export async function generaFileShopifyAction(canaleId: number, skuIds?: number[]): Promise<EsitoFileShopify> {
  try {
    const canale = await getCanaleById(canaleId);
    if (!canale || canale.nome !== "Shopify") {
      return { ok: false, errore: "Il file e' disponibile solo per Shopify." };
    }
    const daInviare = righeDaInviare(await getTabellaCanale(canaleId), skuIds);
    if (daInviare.length === 0) return { ok: false, errore: "Niente da mandare: la tabella nel frattempo e' cambiata." };

    const ids = daInviare.map((r) => r.skuId);
    const nuoviIds = daInviare.filter((r) => r.stato === "nuovo").map((r) => r.skuId);
    const [dati, fotoMappa] = await Promise.all([
      db
        .select({
          id: sku.id,
          skuCode: sku.skuCode,
          artista: sku.artista,
          opera: sku.opera,
          larghezza: sku.larghezza,
          altezza: sku.altezza,
          supporto: sku.supporto,
          anno: sku.anno,
          prezzoEbay: sku.prezzoEbay,
        })
        .from(sku)
        .where(inArray(sku.id, ids)),
      getFotoPerSkuIds(nuoviIds),
    ]);
    const datiPerId = new Map(dati.map((d) => [d.id, d]));

    const prodotti: RigaShopifyInput[] = [];
    const aggiornamenti: AggiornamentoShopify[] = [];
    const incluse: RigaFile[] = [];
    const scartati: NonNullable<EsitoFileShopify["scartati"]> = [];
    for (const r of daInviare.sort((a, b) => a.skuCode.localeCompare(b.skuCode))) {
      const d = datiPerId.get(r.skuId);
      if (!d) continue;
      const file = rigaFileDa(r);
      if (!file) continue;
      const testo = { condizione: r.condizioneOverride, descrizione: r.descrizioneOverride };
      if (r.stato === "nuovo") {
        const foto = (fotoMappa.get(d.id) ?? []).map((f) => f.url);
        const motivo = motivoScarto(d, foto.length);
        if (motivo) {
          scartati.push({ skuCode: d.skuCode, artista: d.artista, opera: d.opera, motivo: ETICHETTA_SCARTO_SHOPIFY[motivo] });
          continue;
        }
        prodotti.push({ sku: d, quantita: file.pezzi, foto, testo });
      } else {
        aggiornamenti.push({
          sku: d,
          azione: file.azione === "archivia" ? "archivia" : file.azione === "esaurito" ? "esaurito" : "modifica",
          pezzi: file.pezzi,
          prezzo: file.prezzo,
          testo: file.testo ? testo : null,
        });
      }
      incluse.push(file);
    }
    if (incluse.length === 0) {
      return { ok: false, errore: "Nessuno sku utilizzabile: controlla prezzo eBay e foto.", scartati };
    }

    const parti = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const v = (t: string) => parti.find((p) => p.type === t)?.value ?? "";
    const filename = `shopify_${v("year")}-${v("month")}-${v("day")}_${v("hour")}${v("minute")}.csv`;

    await salvaFilePortale(canaleId, filename, incluse);
    aggiorna(canaleId);
    return { ok: true, csv: generaCsvShopify(prodotti, aggiornamenti), filename, inclusi: incluse.length, scartati };
  } catch (e) {
    return { ok: false, errore: `Generazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// "Ho caricato il file": registra esattamente le righe dell'ultimo file.
export async function confermaFileAction(canaleId: number): Promise<EsitoEsposizione> {
  try {
    const n = await confermaFilePortale(canaleId);
    aggiorna(canaleId);
    if (n === 0) return { ok: false, errore: "Nessun file da confermare: scaricalo di nuovo." };
    return { ok: true, messaggio: `${n} sku registrati come aggiornati sul portale.` };
  } catch (e) {
    return { ok: false, errore: `Conferma non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function scartaFileAction(canaleId: number): Promise<EsitoEsposizione> {
  try {
    await scartaFilePortale(canaleId);
    aggiorna(canaleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Portali senza file (eBay, Subito per ora): si fa a mano sul portale e poi
// "Segna come fatto" registra lo stato della tabella.
export async function segnaFattoAction(canaleId: number, skuIds?: number[]): Promise<EsitoEsposizione> {
  try {
    const righe = righeDaInviare(await getTabellaCanale(canaleId), skuIds)
      .map(rigaFileDa)
      .filter((r): r is RigaFile => r !== null);
    if (righe.length === 0) return { ok: false, errore: "Niente da registrare." };
    const n = await applicaRighe(canaleId, righe);
    aggiorna(canaleId);
    return { ok: true, messaggio: `${n} sku registrati.` };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}
