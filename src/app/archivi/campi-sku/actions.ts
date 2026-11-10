"use server";

import { revalidatePath } from "next/cache";
import {
  anteprimaCopia,
  contaValoriCampo,
  creaCampo,
  eliminaCampo,
  eseguiCopia,
  rinominaCampo,
  type AnteprimaCopia,
} from "@/db/campi-personalizzati-queries";
import { eTipoCampo, parseOpzioni } from "@/lib/campi-personalizzati";

export type Esito<T = void> = { ok: true; dati: T } | { ok: false; errore: string };

async function proteggi<T>(f: () => Promise<T>): Promise<Esito<T>> {
  try {
    return { ok: true, dati: await f() };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

function aggiorna() {
  revalidatePath("/", "layout");
}

export async function creaCampoAction(formData: FormData): Promise<Esito> {
  return proteggi(async () => {
    const tipo = String(formData.get("tipo") ?? "");
    if (!eTipoCampo(tipo)) throw new Error("Scegli il tipo di campo.");
    await creaCampo(String(formData.get("nome") ?? ""), tipo, parseOpzioni(String(formData.get("opzioni") ?? "")));
    aggiorna();
  });
}

export async function rinominaCampoAction(formData: FormData): Promise<Esito> {
  return proteggi(async () => {
    const id = Number(formData.get("id"));
    const op = formData.get("opzioni");
    await rinominaCampo(id, String(formData.get("nome") ?? ""), op === null ? undefined : parseOpzioni(String(op)));
    aggiorna();
  });
}

export async function contaValoriCampoAction(id: number): Promise<number> {
  return contaValoriCampo(id);
}

export async function eliminaCampoAction(id: number): Promise<Esito> {
  return proteggi(async () => {
    await eliminaCampo(id);
    aggiorna();
  });
}

export async function anteprimaCopiaAction(origine: string, destinazioneId: number, soloDoveVuota: boolean): Promise<Esito<AnteprimaCopia>> {
  return proteggi(() => anteprimaCopia(origine, destinazioneId, soloDoveVuota));
}

export async function eseguiCopiaAction(origine: string, destinazioneId: number, soloDoveVuota: boolean): Promise<Esito<number>> {
  return proteggi(async () => {
    const n = await eseguiCopia(origine, destinazioneId, soloDoveVuota);
    aggiorna();
    return n;
  });
}
