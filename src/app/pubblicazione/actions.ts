"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  creaBatch as creaBatchQuery,
  aggiungiLotti as aggiungiLottiQuery,
  confermaBatch as confermaBatchQuery,
  rimuoviLotto as rimuoviLottoQuery,
  getBatch,
} from "@/db/pubblicazione-queries";

export async function creaBatch(formData: FormData) {
  const canaleId = Number(formData.get("canaleId"));
  if (!canaleId) throw new Error("Canale non valido");

  const batch = await creaBatchQuery(canaleId);
  revalidatePath(`/pubblicazione/${canaleId}`);
  redirect(`/pubblicazione/${canaleId}/${batch.id}`);
}

export async function aggiungiLottiABatch(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  const skuIds = formData
    .getAll("skuId")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!batchId) throw new Error("Batch non valido");
  if (skuIds.length === 0) throw new Error("Seleziona almeno uno sku");

  await aggiungiLottiQuery(batchId, skuIds);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
  redirect(`/pubblicazione/${canaleId}/${batchId}?aggiunti=1`);
}

export async function rimuoviLottoDaBatch(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.stato !== "bozza") {
    throw new Error("Non si puo' modificare un batch gia' confermato");
  }

  await rimuoviLottoQuery(batchLottoId);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
}

export async function confermaBatchAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.lotti.length === 0) throw new Error("Aggiungi almeno un lotto prima di confermare");

  // Snapshot MINIMO per questa prima fetta (solo struttura dati + UI base):
  // solo l'elenco sku/skuCode presente al momento della conferma. La
  // risoluzione vera dei 3 livelli di impostazioni (canale/batch/override,
  // vedi impostazioni_modello_a_3_livelli) e la relativa anteprima sono
  // fuori scope qui - arrivano in una fetta successiva insieme alla
  // generazione dell'output. Il campo snapshot esiste gia' nello schema e
  // va valorizzato comunque alla conferma (sequenza_operativa_e_batch_
  // 2026_09_14: mai null su un batch confermato), quindi per ora porta solo
  // il minimo indispensabile.
  const snapshot = {
    creato_il: new Date().toISOString(),
    lotti: batch.lotti.map((l) => ({ skuId: l.skuId, skuCode: l.sku.skuCode })),
  };

  await confermaBatchQuery(batchId, snapshot);
  revalidatePath(`/pubblicazione/${canaleId}/${batchId}`);
  redirect(`/pubblicazione/${canaleId}/${batchId}?confermato=1`);
}
