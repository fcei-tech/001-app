"use server";

import { calcolaDaFare } from "@/db/portale-queries";

// Numeri mostrati accanto alle voci del menu. Mai eccezioni: se il calcolo
// fallisce il menu resta semplicemente senza numero.
export async function contatoriMenuAction(): Promise<{ pubblicazione: number } | null> {
  try {
    const { righe } = await calcolaDaFare();
    let totale = 0;
    for (const lista of righe.values()) totale += lista.length;
    return { pubblicazione: totale };
  } catch {
    return null;
  }
}
