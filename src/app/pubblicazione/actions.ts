"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  creaBatch as creaBatchQuery,
  aggiungiLotti as aggiungiLottiQuery,
  confermaBatch as confermaBatchQuery,
  rimuoviLotto as rimuoviLottoQuery,
  accettaLotto as accettaLottoQuery,
  eliminaBatch as eliminaBatchQuery,
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

// Accetta un lotto "candidato" (asta fisica): la casa d'asta lo ha preso in
// consegna davvero, da qui in poi consuma disponibilita' (vedi
// impegnatoSql). A differenza di aggiungi/rimuovi lotto, questa azione resta
// disponibile anche a batch GIA' confermato - e' proprio il momento in cui
// serve (la candidatura viene inviata alla conferma del batch, la risposta
// della casa d'asta arriva sempre dopo). Verifica esplicita canale
// asta_fisica + statoRiga candidato qui nell'azione, non solo lato UI.
export async function accettaLottoAction(formData: FormData) {
  const batchLottoId = Number(formData.get("batchLottoId"));
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchLottoId || !batchId) throw new Error("Riferimento non valido");

  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch non trovato");
  if (batch.canale.tipo !== "asta_fisica") {
    throw new Error("Accetta lotto si applica solo alle aste fisiche");
  }
  const lotto = batch.lotti.find((l) => l.id === batchLottoId);
  if (!lotto) throw new Error("Lotto non trovato in questo batch");
  if (lotto.statoRiga !== "candidato") {
    throw new Error("Solo un lotto candidato puo' essere accettato");
  }

  await accettaLottoQuery(batchLottoId);
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

// Elimina un batch in bozza (2026-09-23 sera). La query rifiuta gia' da sola
// un batch non-bozza (vedi eliminaBatch in pubblicazione-queries.ts) - qui
// solo l'orchestrazione redirect/revalidate, stesso schema delle altre
// action di questo file.
export async function eliminaBatchAction(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const canaleId = Number(formData.get("canaleId"));
  if (!batchId) throw new Error("Batch non valido");

  await eliminaBatchQuery(batchId);
  revalidatePath(`/pubblicazione/${canaleId}`);
  redirect(`/pubblicazione/${canaleId}?eliminato=1`);
}
