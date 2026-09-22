"use server";

import { estraiRigheGrezze } from "@/lib/excel-import";
import { calcolaAnteprima, eseguiImport, type AnteprimaImport } from "@/lib/excel-import-plan";

export type RisultatoAnteprima =
  | { ok: true; anteprima: AnteprimaImport; erroriRighe: string[] }
  | { ok: false; errore: string };

async function leggiFileDaFormData(formData: FormData): Promise<Buffer> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Nessun file selezionato.");
  }
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Step 1: calcola l'anteprima (nessuna scrittura). Chiamata dalla pagina
// quando l'utente carica il file e prima di qualsiasi conferma.
export async function anteprimaImportExcel(formData: FormData): Promise<RisultatoAnteprima> {
  try {
    const buffer = await leggiFileDaFormData(formData);
    const { righe, errori } = estraiRigheGrezze(buffer);
    if (righe.length === 0 && errori.length === 0) {
      return { ok: false, errore: "Nessuna riga valida trovata nei fogli STOCK FP / STOCK FOGLI CV." };
    }
    const anteprima = await calcolaAnteprima(righe);
    const erroriRighe = errori.map(
      (e) => `Foglio ${e.foglio === "FP" ? "STOCK FP" : "STOCK FOGLI CV"}, riga ${e.numeroRiga}${e.skuCode ? ` (${e.skuCode})` : ""}: ${e.motivo}`
    );
    return { ok: true, anteprima, erroriRighe };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore imprevisto durante la lettura del file." };
  }
}

// Step 2: ricalcola l'anteprima a fresco dallo stesso file (evita di fidarsi
// di uno stato client stantio) e scrive in database. Chiamata SOLO dopo il
// click esplicito di conferma dell'utente sulla pagina di anteprima.
export async function confermaImportExcel(
  formData: FormData
): Promise<{ ok: true; skuCreati: number; movimentiCreati: number; skuAggiornati: number } | { ok: false; errore: string }> {
  try {
    const buffer = await leggiFileDaFormData(formData);
    const { righe } = estraiRigheGrezze(buffer);
    const anteprima = await calcolaAnteprima(righe);
    const risultato = await eseguiImport(anteprima);
    return { ok: true, ...risultato };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore imprevisto durante la scrittura in database." };
  }
}
