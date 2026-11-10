"use server";

import { revalidatePath } from "next/cache";
import { ripristinaRegolePrezziStandard, salvaRegolePrezzi } from "@/db/impostazioni-app-queries";
import type { RegolePrezzi } from "@/lib/regole-prezzi-config";

function numero(formData: FormData, nome: string, etichetta: string, min: number, max: number, intero = false): number {
  const testo = String(formData.get(nome) ?? "").trim().replace(",", ".");
  const n = Number(testo);
  if (!testo || !Number.isFinite(n)) throw new Error(`${etichetta}: scrivi un numero.`);
  if (n < min || n > max) throw new Error(`${etichetta}: deve essere tra ${min} e ${max}.`);
  if (intero && !Number.isInteger(n)) throw new Error(`${etichetta}: deve essere un numero intero.`);
  return n;
}

const arrotonda = (n: number) => Math.round(n * 1e6) / 1e6;

// Il form parla in percentuali (sconto Shopify 10 = -10%, riserva 50 = 50%):
// qui si traducono nei moltiplicatori usati dal codice (0,9 e 0,5).
export async function salvaRegolePrezziAction(formData: FormData): Promise<void> {
  const scontoPct = numero(formData, "scontoShopifyPct", "Sconto Shopify", 0, 99);
  const regole: RegolePrezzi = {
    scontoShopify: arrotonda(1 - scontoPct / 100),
    offertaMinimaEbayPercentuale: numero(formData, "offertaMinimaEbay", "Offerta minima eBay", 1, 100),
    sogliaMinimaCatawiki: numero(formData, "sogliaCatawiki", "Soglia minima Catawiki", 0, 1000000),
    moltiplicatoreRiservaCatawiki: arrotonda(numero(formData, "riservaCatawikiPct", "Riserva Catawiki di ripiego", 1, 1000) / 100),
    fasceQuantita: [
      { fino: numero(formData, "fino1", "Prima fascia (fino a)", 1, 100000, true), pezzi: numero(formData, "pezzi1", "Pezzi prima fascia", 1, 99, true) },
      { fino: numero(formData, "fino2", "Seconda fascia (fino a)", 1, 100000, true), pezzi: numero(formData, "pezzi2", "Pezzi seconda fascia", 1, 99, true) },
      { fino: null, pezzi: numero(formData, "pezzi3", "Pezzi terza fascia", 1, 99, true) },
    ],
  };
  const f = regole.fasceQuantita;
  if ((f[1].fino ?? 0) <= (f[0].fino ?? 0)) throw new Error("Le fasce devono crescere: il secondo limite deve essere maggiore del primo.");
  await salvaRegolePrezzi(regole);
  revalidatePath("/", "layout");
}

export async function ripristinaRegolePrezziAction(): Promise<void> {
  await ripristinaRegolePrezziStandard();
  revalidatePath("/", "layout");
}
