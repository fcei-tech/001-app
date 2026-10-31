"use server";

import { revalidatePath } from "next/cache";
import {
  assegnaTag,
  creaTag,
  eliminaTag,
  impostaTagDiSku,
  impostaTipoTag,
  impostaVaiSuShopify,
  rinominaTag,
  togliTag,
} from "@/db/tag-queries";

type Esito = { ok: boolean; errore?: string; messaggio?: string };

function ricarica() {
  revalidatePath("/archivi/tag");
  revalidatePath("/");
  revalidatePath("/pubblicazione", "layout");
}

function errore(e: unknown): Esito {
  return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
}

export async function creaTagAction(nome: string, tipo: string): Promise<Esito> {
  try {
    const r = await creaTag(nome, tipo);
    if (!r.ok) return { ok: false, errore: r.errore };
    ricarica();
    return { ok: true };
  } catch (e) {
    return errore(e);
  }
}

export async function rinominaTagAction(id: number, nome: string): Promise<Esito> {
  try {
    const r = await rinominaTag(id, nome);
    if (!r.ok) return { ok: false, errore: r.errore };
    ricarica();
    return { ok: true };
  } catch (e) {
    return errore(e);
  }
}

export async function impostaTipoTagAction(id: number, tipo: string): Promise<Esito> {
  try {
    await impostaTipoTag(id, tipo);
    ricarica();
    return { ok: true };
  } catch (e) {
    return errore(e);
  }
}

export async function impostaVaiSuShopifyAction(id: number, valore: boolean): Promise<Esito> {
  try {
    await impostaVaiSuShopify(id, valore);
    ricarica();
    return { ok: true };
  } catch (e) {
    return errore(e);
  }
}

export async function eliminaTagAction(id: number): Promise<Esito> {
  try {
    const n = await eliminaTag(id);
    ricarica();
    return { ok: true, messaggio: n ? `Tag eliminato e tolto da ${n} sku.` : "Tag eliminato." };
  } catch (e) {
    return errore(e);
  }
}

// Assegnazione in blocco (Magazzino): aggiunge i tag a tutti gli sku scelti.
export async function assegnaTagAction(skuIds: number[], tagIds: number[]): Promise<Esito> {
  try {
    if (!skuIds.length) return { ok: false, errore: "Nessuno sku selezionato." };
    if (!tagIds.length) return { ok: false, errore: "Scegli almeno un tag." };
    const r = await assegnaTag(skuIds, tagIds);
    ricarica();
    return {
      ok: true,
      messaggio: r.nuoveAssegnazioni
        ? `Tag aggiunti: ${r.nuoveAssegnazioni} assegnazioni su ${r.sku} sku.`
        : "Gli sku scelti avevano gia' questi tag.",
    };
  } catch (e) {
    return errore(e);
  }
}

export async function togliTagAction(skuIds: number[], tagIds: number[]): Promise<Esito> {
  try {
    if (!skuIds.length) return { ok: false, errore: "Nessuno sku selezionato." };
    if (!tagIds.length) return { ok: false, errore: "Scegli almeno un tag." };
    const r = await togliTag(skuIds, tagIds);
    ricarica();
    return { ok: true, messaggio: r.tolte ? `Tag tolti: ${r.tolte} assegnazioni.` : "Gli sku scelti non avevano questi tag." };
  } catch (e) {
    return errore(e);
  }
}

// Scheda sku: salva l'elenco completo dei tag dello sku.
export async function impostaTagSkuAction(skuId: number, tagIds: number[]): Promise<Esito> {
  try {
    await impostaTagDiSku(skuId, tagIds);
    ricarica();
    revalidatePath(`/magazzino/${skuId}`);
    return { ok: true };
  } catch (e) {
    return errore(e);
  }
}
