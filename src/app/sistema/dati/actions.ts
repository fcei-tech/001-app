"use server";

import { revalidatePath } from "next/cache";
import {
  scriviBackupSuDisco,
  elencaBackup,
  leggiBackupDaDisco,
  leggiBackupDaTesto,
  anteprimaRipristino,
  ripristinaDaBackup,
  cartellaBackup,
  type AnteprimaRipristino,
  type VoceBackup,
  type FileBackup,
} from "@/db/backup";
import { anteprimaConsolida, eseguiConsolida, type AnteprimaConsolida } from "@/db/consolida";
import { leggiStatoPortaliMaster } from "@/lib/master-stato-portali";
import { anteprimaStatoPortali, importaStatoPortali, type AnteprimaStatoPortali } from "@/db/stato-portali-import";

// Tutte le azioni restituiscono un esito (mai eccezioni): in produzione Next
// maschera il testo degli errori lanciati da una server action.
function msg(e: unknown) {
  return e instanceof Error ? e.message : "errore imprevisto";
}

function tutto() {
  revalidatePath("/", "layout");
}

// --- Backup ---------------------------------------------------------------
export async function creaBackupAction(): Promise<{ ok: boolean; errore?: string; percorso?: string; righe?: number }> {
  try {
    const r = await scriviBackupSuDisco();
    return { ok: true, percorso: r.percorso, righe: r.righe };
  } catch (e) {
    return { ok: false, errore: `Backup non riuscito: ${msg(e)}` };
  }
}

export async function elencaBackupAction(): Promise<{ ok: boolean; cartella: string; voci: VoceBackup[]; errore?: string }> {
  try {
    return { ok: true, cartella: cartellaBackup(), voci: elencaBackup() };
  } catch (e) {
    return { ok: false, cartella: cartellaBackup(), voci: [], errore: msg(e) };
  }
}

async function leggiSorgente(fd: FormData): Promise<FileBackup> {
  const nome = fd.get("nomeFile");
  if (typeof nome === "string" && nome) return leggiBackupDaDisco(nome);
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) return leggiBackupDaTesto(await file.text());
  throw new Error("Nessun backup selezionato.");
}

export async function anteprimaRipristinoAction(
  fd: FormData
): Promise<{ ok: true; anteprima: AnteprimaRipristino } | { ok: false; errore: string }> {
  try {
    return { ok: true, anteprima: await anteprimaRipristino(await leggiSorgente(fd)) };
  } catch (e) {
    return { ok: false, errore: `Backup non leggibile: ${msg(e)}` };
  }
}

export async function ripristinaAction(fd: FormData): Promise<{ ok: boolean; errore?: string; righe?: number }> {
  try {
    if (fd.get("conferma") !== "RIPRISTINA") return { ok: false, errore: "Scrivi RIPRISTINA per confermare." };
    const righe = await ripristinaDaBackup(await leggiSorgente(fd));
    tutto();
    return { ok: true, righe };
  } catch (e) {
    return { ok: false, errore: `Ripristino non riuscito (nulla e' cambiato): ${msg(e)}` };
  }
}

// --- Consolida ------------------------------------------------------------
export async function anteprimaConsolidaAction(
  skuId?: number
): Promise<{ ok: true; anteprima: AnteprimaConsolida } | { ok: false; errore: string }> {
  try {
    return { ok: true, anteprima: await anteprimaConsolida(skuId) };
  } catch (e) {
    return { ok: false, errore: msg(e) };
  }
}

export async function consolidaAction(
  conferma: string,
  skuId?: number
): Promise<{ ok: boolean; errore?: string; messaggio?: string }> {
  try {
    if (conferma !== "CONSOLIDA") return { ok: false, errore: "Scrivi CONSOLIDA per confermare." };
    const a = await eseguiConsolida(skuId);
    tutto();
    return {
      ok: true,
      messaggio:
        a.gruppiDaFondere === 0
          ? "Niente da fondere."
          : `${a.righeDaEliminare} correzioni fuse su ${a.skuCoinvolti} articoli. Nessuna quantita' e' cambiata.`,
    };
  } catch (e) {
    return { ok: false, errore: `Consolida non riuscito (nulla e' cambiato): ${msg(e)}` };
  }
}

// --- Stato portali dal Master ---------------------------------------------
async function statoDaFile(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Nessun file selezionato.");
  const stato = leggiStatoPortaliMaster(Buffer.from(await file.arrayBuffer()));
  if (stato.length === 0) throw new Error("Nel file non ho trovato righe sku nel foglio MASTER.");
  return stato;
}

export async function anteprimaStatoPortaliAction(
  fd: FormData
): Promise<{ ok: true; anteprima: AnteprimaStatoPortali } | { ok: false; errore: string }> {
  try {
    return { ok: true, anteprima: await anteprimaStatoPortali(await statoDaFile(fd)) };
  } catch (e) {
    return { ok: false, errore: msg(e) };
  }
}

export async function importaStatoPortaliAction(
  fd: FormData
): Promise<{ ok: boolean; errore?: string; messaggio?: string }> {
  try {
    const r = await importaStatoPortali(await statoDaFile(fd));
    tutto();
    return { ok: true, messaggio: `${r.blocchiCreati} blocchi e ${r.caricatiRegistrati} sku "già caricati" registrati.` };
  } catch (e) {
    return { ok: false, errore: `Import non riuscito (nulla e' cambiato): ${msg(e)}` };
  }
}
