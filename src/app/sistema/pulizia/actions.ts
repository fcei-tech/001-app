"use server";

import { revalidatePath } from "next/cache";
import { anteprimaPulizia, eseguiPulizia, type AnteprimaPulizia, type EsitoPulizia, type SceltaPulizia } from "@/db/pulizia";
import { scriviBackupSuDisco } from "@/db/backup";

function msg(e: unknown) {
  return e instanceof Error ? e.message : "errore imprevisto";
}

export async function anteprimaPuliziaAction(
  s: SceltaPulizia
): Promise<{ ok: true; anteprima: AnteprimaPulizia } | { ok: false; errore: string }> {
  try {
    return { ok: true, anteprima: await anteprimaPulizia(s) };
  } catch (e) {
    return { ok: false, errore: msg(e) };
  }
}

// Prima di cancellare salva SEMPRE un backup; se il backup non riesce non
// cancella niente. Poi cancella tutto in un'unica transazione.
export async function eseguiPuliziaAction(
  s: SceltaPulizia,
  conferma: string
): Promise<{ ok: boolean; errore?: string; esito?: EsitoPulizia; backup?: string }> {
  try {
    if (conferma !== "PULISCI") return { ok: false, errore: "Scrivi PULISCI per confermare." };
    const b = await scriviBackupSuDisco();
    const esito = await eseguiPulizia(s);
    revalidatePath("/", "layout");
    return { ok: true, esito, backup: b.percorso };
  } catch (e) {
    return { ok: false, errore: `Pulizia non riuscita (nulla è stato cancellato): ${msg(e)}` };
  }
}
