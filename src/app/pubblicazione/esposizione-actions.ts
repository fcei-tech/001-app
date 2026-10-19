"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { sku } from "@/db/schema";
import { getCanaleById } from "@/db/pubblicazione-queries";
import { getFotoPerSkuIds } from "@/db/queries";
import { annullaModifiche, confermaDaFare, getDaFareCanale, impostaBlocco } from "@/db/esposizione-queries";
import type { Annullabile, TipoDaFare } from "@/lib/esposizione";
import {
  ETICHETTA_SCARTO_SHOPIFY,
  generaCsvShopify,
  motivoScarto,
  type RigaShopifyInput,
} from "@/lib/shopify-export";

// Esito restituito (mai eccezioni): in produzione Next maschera il testo
// degli errori lanciati da una server action.
export type EsitoEsposizione = { ok: boolean; errore?: string; messaggio?: string; annullabile?: Annullabile };

function aggiorna(canaleId?: number) {
  if (canaleId) revalidatePath(`/pubblicazione/${canaleId}`);
  revalidatePath("/pubblicazione");
  revalidatePath("/");
}

const TIPI: TipoDaFare[] = ["aggiungere", "togliere", "abbassare"];

export async function confermaDaFareAction(
  canaleId: number,
  tipo: TipoDaFare,
  skuIds: number[]
): Promise<EsitoEsposizione> {
  try {
    if (!TIPI.includes(tipo)) return { ok: false, errore: "Azione non valida." };
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    const { n, annullabile } = await confermaDaFare(canaleId, tipo, ids);
    aggiorna(canaleId);
    if (n === 0) return { ok: true, messaggio: "Niente da confermare: la lista nel frattempo e' cambiata." };
    return { ok: true, messaggio: `${n} sku confermati.`, annullabile };
  } catch (e) {
    return { ok: false, errore: `Conferma non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function impostaBloccoPortaleAction(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean
): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0 || !Number.isInteger(canaleId)) return { ok: false, errore: "Selezione non valida." };
    const { annullabile } = await impostaBlocco(ids, canaleId, bloccato);
    aggiorna(canaleId);
    return {
      ok: true,
      messaggio: bloccato ? `${ids.length} sku bloccati su questo portale.` : `${ids.length} sku sbloccati.`,
      annullabile,
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

// File prodotti per Shopify (2026-10-19): parte dagli sku scelti nel gruppo
// "Da aggiungere" del portale. NON cambia nessuno stato: dopo aver caricato il
// file su Shopify si usa "Conferma caricato", come prima. Gli sku senza
// prezzo eBay o senza foto vengono esclusi dal file e riportati nel messaggio.
export type EsitoFileShopify = {
  ok: boolean;
  errore?: string;
  csv?: string;
  filename?: string;
  inclusi?: number;
  scartati?: { skuCode: string; artista: string; opera: string; motivo: string }[];
};

export async function generaFileShopifyAction(canaleId: number, skuIds: number[]): Promise<EsitoFileShopify> {
  try {
    const canale = await getCanaleById(canaleId);
    if (!canale || canale.nome !== "Shopify") {
      return { ok: false, errore: "Il file prodotti e' disponibile solo per Shopify." };
    }
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return { ok: false, errore: "Seleziona almeno uno sku." };

    // Solo sku ancora davvero "da aggiungere", con la quantita' calcolata ora.
    const righeDaFare = (await getDaFareCanale(canaleId)).filter((r) => r.tipo === "aggiungere" && ids.includes(r.skuId));
    if (righeDaFare.length === 0) {
      return { ok: false, errore: "Niente da aggiungere tra gli sku scelti: la lista nel frattempo e' cambiata." };
    }
    const quantitaPerSku = new Map(righeDaFare.map((r) => [r.skuId, r.quantitaTarget]));
    const idsValidi = righeDaFare.map((r) => r.skuId);

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
        .where(inArray(sku.id, idsValidi)),
      getFotoPerSkuIds(idsValidi),
    ]);

    const prodotti: RigaShopifyInput[] = [];
    const scartati: NonNullable<EsitoFileShopify["scartati"]> = [];
    for (const d of dati.sort((a, b) => a.skuCode.localeCompare(b.skuCode))) {
      const foto = (fotoMappa.get(d.id) ?? []).map((f) => f.url);
      const motivo = motivoScarto(d, foto.length);
      if (motivo) {
        scartati.push({ skuCode: d.skuCode, artista: d.artista, opera: d.opera, motivo: ETICHETTA_SCARTO_SHOPIFY[motivo] });
        continue;
      }
      prodotti.push({ sku: d, quantita: quantitaPerSku.get(d.id) ?? 1, foto });
    }
    if (prodotti.length === 0) {
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

    return { ok: true, csv: generaCsvShopify(prodotti), filename, inclusi: prodotti.length, scartati };
  } catch (e) {
    return { ok: false, errore: `Generazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}
