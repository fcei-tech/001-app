"use server";

import { revalidatePath } from "next/cache";
import { confermaDaFare, impostaBlocco } from "@/db/esposizione-queries";
import type { TipoDaFare } from "@/lib/esposizione";

// Esito restituito (mai eccezioni): in produzione Next maschera il testo
// degli errori lanciati da una server action.
export type EsitoEsposizione = { ok: boolean; errore?: string; messaggio?: string };

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
    const n = await confermaDaFare(canaleId, tipo, ids);
    aggiorna(canaleId);
    if (n === 0) return { ok: true, messaggio: "Niente da confermare: la lista nel frattempo e' cambiata." };
    return { ok: true, messaggio: `${n} sku confermati.` };
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
    await impostaBlocco(ids, canaleId, bloccato);
    aggiorna(canaleId);
    return {
      ok: true,
      messaggio: bloccato ? `${ids.length} sku bloccati su questo portale.` : `${ids.length} sku sbloccati.`,
    };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}
