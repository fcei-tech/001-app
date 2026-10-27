import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { bloccoSkuCanale, esposizioneCanale, filePortale, overridePortale, storicoPortale } from "./schema";
import { getBaseSku, getCanaliStatici, type CanaleStatico } from "./esposizione-queries";
import { disponibileLibero, prezzoPerPortale, quantitaDaCaricare } from "@/lib/esposizione";
import {
  azioneDaStato,
  calcolaRigaPortale,
  ETICHETTA_MOTIVO_MODIFICA,
  type AzioneFile,
  type RigaFile,
  type RigaPortale,
  type StatoRiga,
} from "@/lib/tabella-portale";

// Lettura e scrittura della tabella unica dei portali statici (2026-10-27).
// Tutto il calcolo e' in memoria (~1300 sku x pochi portali).

export async function calcolaTabelle(): Promise<{ canali: CanaleStatico[]; righe: Map<number, RigaPortale[]> }> {
  const [canali, base, esposti, blocchi, override] = await Promise.all([
    getCanaliStatici(),
    getBaseSku(),
    db.select().from(esposizioneCanale),
    db.select().from(bloccoSkuCanale),
    db.select().from(overridePortale),
  ]);
  const regMap = new Map(esposti.map((e) => [`${e.skuId}:${e.canaleId}`, e]));
  const bloccoMap = new Map(blocchi.map((b) => [`${b.skuId}:${b.canaleId}`, b.motivo]));
  const ovMap = new Map(override.map((o) => [`${o.skuId}:${o.canaleId}`, o]));

  const righe = new Map<number, RigaPortale[]>();
  for (const c of canali) {
    const lista: RigaPortale[] = [];
    for (const s of base) {
      if (s.skuCode === "IGNORA") continue;
      const chiave = `${s.id}:${c.id}`;
      const reg = regMap.get(chiave);
      const ov = ovMap.get(chiave);
      const motivoBlocco = bloccoMap.get(chiave);
      const libero = disponibileLibero(s.disponibile, s.impegnato);
      const riga = calcolaRigaPortale({
        skuId: s.id,
        skuCode: s.skuCode,
        artista: s.artista,
        opera: s.opera,
        bloccatoQui: s.bloccatoVendita || motivoBlocco !== undefined,
        ritirato: !s.bloccatoVendita && motivoBlocco === "ritiro",
        libero,
        quantitaAutomatica: quantitaDaCaricare(libero, c.impostazioni),
        prezzoOggi: prezzoPerPortale(c.nome, s.prezzoEbay),
        reg: reg
          ? {
              inVetrina: reg.inVetrina,
              quantitaCaricata: reg.quantitaCaricata,
              prezzoCaricato: reg.prezzoCaricato === null ? null : Number(reg.prezzoCaricato),
              aggiornatoAt: reg.aggiornatoAt,
            }
          : null,
        ov: ov
          ? { quantita: ov.quantita, condizione: ov.condizione, descrizione: ov.descrizione, modificatoAt: ov.modificatoAt }
          : null,
      });
      if (riga) lista.push(riga);
    }
    lista.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
    righe.set(c.id, lista);
  }
  return { canali, righe };
}

export async function getTabellaCanale(canaleId: number): Promise<RigaPortale[]> {
  const { righe } = await calcolaTabelle();
  return righe.get(canaleId) ?? [];
}

// Solo le righe con qualcosa da mandare al portale (per i contatori).
export async function calcolaDaFare(): Promise<{ canali: CanaleStatico[]; righe: Map<number, RigaPortale[]> }> {
  const { canali, righe } = await calcolaTabelle();
  const pending = new Map<number, RigaPortale[]>();
  for (const [id, lista] of righe) pending.set(id, lista.filter((r) => r.stato !== "online"));
  return { canali, righe: pending };
}

export type DaSistemare = { canaleId: number; portale: string; stato: StatoRiga };

export async function getDaSistemarePerSku(): Promise<Record<number, DaSistemare[]>> {
  const { canali, righe } = await calcolaDaFare();
  const nomi = new Map(canali.map((c) => [c.id, c.nome]));
  const out: Record<number, DaSistemare[]> = {};
  for (const [canaleId, lista] of righe) {
    for (const r of lista) (out[r.skuId] ??= []).push({ canaleId, portale: nomi.get(canaleId) ?? "", stato: r.stato });
  }
  return out;
}

// --- Celle modificabili -------------------------------------------------------
export type CampoOverride = "quantita" | "condizione" | "descrizione";

export async function salvaOverride(
  skuId: number,
  canaleId: number,
  campo: CampoOverride,
  valore: string | null
): Promise<{ ok: boolean; errore?: string }> {
  let parsed: string | number | null = null;
  const testo = valore === null ? "" : valore.trim();
  if (campo === "quantita") {
    if (testo !== "") {
      if (!/^\d{1,3}$/.test(testo)) return { ok: false, errore: "Scrivi un numero intero (0 o più)." };
      parsed = Number(testo);
    }
  } else if (campo === "condizione") {
    if (testo.length > 200) return { ok: false, errore: "Condizione troppo lunga (massimo 200 caratteri)." };
    parsed = testo === "" ? null : testo;
  } else {
    if (testo.length > 3000) return { ok: false, errore: "Descrizione troppo lunga (massimo 3000 caratteri)." };
    parsed = testo === "" ? null : testo;
  }
  await db.transaction(async (tx) => {
    const [esistente] = await tx
      .select()
      .from(overridePortale)
      .where(and(eq(overridePortale.skuId, skuId), eq(overridePortale.canaleId, canaleId)));
    const nuovo = {
      quantita: campo === "quantita" ? (parsed as number | null) : (esistente?.quantita ?? null),
      condizione: campo === "condizione" ? (parsed as string | null) : (esistente?.condizione ?? null),
      descrizione: campo === "descrizione" ? (parsed as string | null) : (esistente?.descrizione ?? null),
    };
    if (nuovo.quantita === null && nuovo.condizione === null && nuovo.descrizione === null) {
      if (esistente) {
        await tx.delete(overridePortale).where(and(eq(overridePortale.skuId, skuId), eq(overridePortale.canaleId, canaleId)));
      }
    } else {
      await tx
        .insert(overridePortale)
        .values({ skuId, canaleId, ...nuovo, modificatoAt: new Date() })
        .onConflictDoUpdate({
          target: [overridePortale.skuId, overridePortale.canaleId],
          set: { ...nuovo, modificatoAt: new Date() },
        });
    }
    const nome = campo === "quantita" ? "Pezzi" : campo === "condizione" ? "Condizione" : "Descrizione";
    await tx.insert(storicoPortale).values({
      canaleId,
      skuId,
      azione: "cella",
      dettaglio: parsed === null ? `${nome}: valore automatico` : `${nome} impostata${campo === "quantita" ? ` a ${parsed}` : ""}`,
    });
  });
  return { ok: true };
}

export async function ripristinaOverride(skuIds: number[], canaleId: number): Promise<number> {
  if (skuIds.length === 0) return 0;
  await db.transaction(async (tx) => {
    await tx.delete(overridePortale).where(and(eq(overridePortale.canaleId, canaleId), inArray(overridePortale.skuId, skuIds)));
    await tx
      .insert(storicoPortale)
      .values(skuIds.map((skuId) => ({ skuId, canaleId, azione: "cella", dettaglio: "Valori automatici ripristinati" })));
  });
  return skuIds.length;
}

// --- Ultimo file generato e conferma ------------------------------------------
export type FilePortaleInfo = { nomeFile: string; creatoAt: Date; righe: number };

export async function getFilePortale(canaleId: number): Promise<FilePortaleInfo | null> {
  const [f] = await db.select().from(filePortale).where(eq(filePortale.canaleId, canaleId));
  if (!f) return null;
  return { nomeFile: f.nomeFile, creatoAt: f.creatoAt, righe: (f.righe as RigaFile[]).length };
}

export async function salvaFilePortale(canaleId: number, nomeFile: string, righe: RigaFile[]): Promise<void> {
  await db
    .insert(filePortale)
    .values({ canaleId, nomeFile, righe, creatoAt: new Date() })
    .onConflictDoUpdate({ target: filePortale.canaleId, set: { nomeFile, righe, creatoAt: new Date() } });
}

export function rigaFileDa(r: RigaPortale): RigaFile | null {
  const azione = azioneDaStato(r.stato);
  if (!azione) return null;
  return {
    skuId: r.skuId,
    azione,
    pezzi: azione === "archivia" ? 0 : r.pezziDopo,
    prezzo: azione === "archivia" ? null : r.prezzoOggi,
    testo: r.motivi.includes("testo"),
  };
}

const AZIONE_STORICO: Record<AzioneFile, string> = {
  nuovo: "aggiunto",
  modifica: "modificato",
  esaurito: "esaurito",
  archivia: "archiviato",
};

// Registra nel software che il portale ora e' come dice questo elenco.
export async function applicaRighe(canaleId: number, righe: RigaFile[]): Promise<number> {
  if (righe.length === 0) return 0;
  const adesso = new Date();
  const motiviPerSku = new Map((await getTabellaCanale(canaleId)).map((r) => [r.skuId, r]));
  await db.transaction(async (tx) => {
    for (const r of righe) {
      const attiva = r.azione !== "archivia";
      const prezzoTesto = attiva && r.prezzo !== null ? r.prezzo.toFixed(2) : null;
      await tx
        .insert(esposizioneCanale)
        .values({
          skuId: r.skuId,
          canaleId,
          quantitaCaricata: r.pezzi,
          prezzoCaricato: prezzoTesto,
          inVetrina: attiva,
          aggiornatoAt: adesso,
        })
        .onConflictDoUpdate({
          target: [esposizioneCanale.skuId, esposizioneCanale.canaleId],
          set: { quantitaCaricata: r.pezzi, prezzoCaricato: prezzoTesto, inVetrina: attiva, aggiornatoAt: adesso },
        });
      const prima = motiviPerSku.get(r.skuId);
      let dettaglio: string;
      if (r.azione === "archivia") dettaglio = "tolto dalla vetrina";
      else if (r.azione === "esaurito") dettaglio = `${prima?.pezziOra ?? 0} → 0 pezzi`;
      else if (r.azione === "nuovo") dettaglio = `${r.pezzi} pezzi${r.prezzo !== null ? ` a ${r.prezzo.toFixed(2).replace(".", ",")} €` : ""}`;
      else dettaglio = (prima?.motivi ?? []).map((m) => ETICHETTA_MOTIVO_MODIFICA[m]).join(", ") || "aggiornato";
      await tx.insert(storicoPortale).values({ canaleId, skuId: r.skuId, azione: AZIONE_STORICO[r.azione], dettaglio });
    }
  });
  return righe.length;
}

// "Ho caricato il file": registra esattamente le righe dell'ultimo file.
export async function confermaFilePortale(canaleId: number): Promise<number> {
  const [f] = await db.select().from(filePortale).where(eq(filePortale.canaleId, canaleId));
  if (!f) return 0;
  const n = await applicaRighe(canaleId, f.righe as RigaFile[]);
  await db.delete(filePortale).where(eq(filePortale.canaleId, canaleId));
  return n;
}

export async function scartaFilePortale(canaleId: number): Promise<void> {
  await db.delete(filePortale).where(eq(filePortale.canaleId, canaleId));
}
