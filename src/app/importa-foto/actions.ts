"use server";

import { estraiUrlDaMaster } from "@/lib/foto-import";
import { calcolaAnteprimaFoto, eseguiImportFoto, type AnteprimaImportFoto } from "@/lib/foto-import-plan";

export type RisultatoAnteprimaFoto =
  | { ok: true; anteprima: AnteprimaImportFoto; erroriRighe: string[] }
  | { ok: false; errore: string };

async function leggiFileDaFormData(formData: FormData): Promise<Buffer> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Nessun file selezionato.");
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function anteprimaImportFotoMaster(formData: FormData): Promise<RisultatoAnteprimaFoto> {
  try {
    const buffer = await leggiFileDaFormData(formData);
    const { righe, errori } = estraiUrlDaMaster(buffer);
    if (righe.length === 0 && errori.length === 0) {
      return { ok: false, errore: 'Nessuna riga con URL_STORICA compilata trovata nel foglio "MASTER".' };
    }
    const anteprima = await calcolaAnteprimaFoto(righe);
    const erroriRighe = errori.map((e) => `${e.skuCode ? `Sku ${e.skuCode}: ` : ""}${e.motivo}`);
    return { ok: true, anteprima, erroriRighe };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore imprevisto durante la lettura del file." };
  }
}

export async function confermaImportFotoMaster(
  formData: FormData
): Promise<{ ok: true; skuConFotoAggiunte: number; fotoInserite: number } | { ok: false; errore: string }> {
  try {
    const buffer = await leggiFileDaFormData(formData);
    const { righe } = estraiUrlDaMaster(buffer);
    const anteprima = await calcolaAnteprimaFoto(righe);
    const risultato = await eseguiImportFoto(anteprima);
    return { ok: true, ...risultato };
  } catch (err) {
    return { ok: false, errore: err instanceof Error ? err.message : "Errore imprevisto durante la scrittura in database." };
  }
}
