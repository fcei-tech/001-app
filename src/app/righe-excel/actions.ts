"use server";

import { revalidatePath } from "next/cache";
import { getSkuDaRiportare, segnaRiportati } from "@/db/righe-excel-queries";
import { costruisciFileRighe } from "@/lib/excel-righe-stock";

export async function scaricaFileRigheAction(): Promise<
  { ok: true; nomeFile: string; base64: string; skuIds: number[]; righe: number } | { ok: false; errore: string }
> {
  try {
    const { voci } = await getSkuDaRiportare();
    if (voci.length === 0) return { ok: false, errore: "Nessuno sku nuovo da riportare." };
    const buf = costruisciFileRighe(voci.flatMap((v) => v.righe));
    const oggi = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      nomeFile: `righe_da_riportare_${oggi}.xlsx`,
      base64: buf.toString("base64"),
      skuIds: voci.map((v) => v.id),
      righe: voci.reduce((a, v) => a + v.righe.length, 0),
    };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

export async function segnaComeRiportatiAction(skuIds: number[]): Promise<{ ok: boolean; errore?: string; segnati: number }> {
  try {
    const n = await segnaRiportati(skuIds);
    revalidatePath("/righe-excel");
    return { ok: true, segnati: n };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto", segnati: 0 };
  }
}
