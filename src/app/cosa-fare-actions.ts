"use server";

import { getCosaFare, type VoceCosaFare } from "@/db/cosa-fare";

// Mai eccezioni: senza database collegato (o con un errore) la finestra
// iniziale semplicemente non compare.
export async function cosaFareAction(): Promise<VoceCosaFare[] | null> {
  try {
    return await getCosaFare();
  } catch {
    return null;
  }
}
