"use server";

import fs from "node:fs";
import { configFilePath } from "@/lib/app-config";
import { eseguiBomba } from "@/db/bomba";

const FRASE_BOMBA = "ELIMINA TUTTO";

export async function bombaAction(frase: string): Promise<{ ok: boolean; errore?: string; configRimasta?: boolean }> {
  try {
    if (frase !== FRASE_BOMBA) return { ok: false, errore: `Scrivi esattamente ${FRASE_BOMBA}.` };
    await eseguiBomba();
    return { ok: true, configRimasta: fs.existsSync(configFilePath()) };
  } catch (e) {
    return { ok: false, errore: `Eliminazione non riuscita (nulla e' cambiato): ${e instanceof Error ? e.message : "errore"}` };
  }
}
