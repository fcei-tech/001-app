import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { bloccoSkuCanale, esposizioneCanale, filePortale, overridePortale, sku, storicoPortale } from "./schema";
import { getBaseSku, getCanaliStatici, type CanaleStatico } from "./esposizione-queries";
import { disponibileLibero, prezziDiversi, prezzoPerPortale, quantitaDaCaricare } from "@/lib/esposizione";
import type { VoceAllineamento } from "@/lib/allinea-portale";
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
              idPortale: reg.idPortale,
              titoloPortale: reg.titoloPortale,
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
export type FilePortaleInfo = { nomeFile: string; creatoAt: Date; righe: number; elenco: RigaFile[] };

export async function getFilePortale(canaleId: number): Promise<FilePortaleInfo | null> {
  const [f] = await db.select().from(filePortale).where(eq(filePortale.canaleId, canaleId));
  if (!f) return null;
  return { nomeFile: f.nomeFile, creatoAt: f.creatoAt, righe: (f.righe as RigaFile[]).length, elenco: f.righe as RigaFile[] };
}

export async function salvaFilePortale(canaleId: number, nomeFile: string, righe: RigaFile[]): Promise<void> {
  await db
    .insert(filePortale)
    .values({ canaleId, nomeFile, righe, creatoAt: new Date() })
    .onConflictDoUpdate({ target: filePortale.canaleId, set: { nomeFile, righe, creatoAt: new Date() } });
}

// riattiva = true (Shopify): uno sku "nuovo" che ha gia' un prodotto sul portale
// (archiviato o sospeso) non si ricrea: si riattiva.
export function rigaFileDa(r: RigaPortale, riattiva = false): RigaFile | null {
  let azione = azioneDaStato(r.stato);
  if (!azione) return null;
  if (azione === "nuovo" && riattiva && r.idPortale) azione = "riattiva";
  return {
    skuId: r.skuId,
    azione,
    pezzi: azione === "archivia" ? 0 : r.pezziDopo,
    prezzo: azione === "archivia" ? null : r.prezzoOggi,
    testo: r.motivi.includes("testo") || (azione === "riattiva" && (r.condizioneOverride !== null || r.descrizioneOverride !== null)),
  };
}

const AZIONE_STORICO: Record<AzioneFile, string> = {
  nuovo: "aggiunto",
  riattiva: "riattivato",
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
      // L'id sul portale (handle / numero oggetto) si registra per i nuovi e NON si
      // cancella mai quando uno sku viene archiviato: serve a riattivarlo.
      const idTitolo = r.azione === "nuovo" && r.idPortale ? { idPortale: r.idPortale, titoloPortale: r.titolo ?? null } : {};
      await tx
        .insert(esposizioneCanale)
        .values({
          skuId: r.skuId,
          canaleId,
          quantitaCaricata: r.pezzi,
          prezzoCaricato: prezzoTesto,
          inVetrina: attiva,
          aggiornatoAt: adesso,
          ...idTitolo,
        })
        .onConflictDoUpdate({
          target: [esposizioneCanale.skuId, esposizioneCanale.canaleId],
          set: { quantitaCaricata: r.pezzi, prezzoCaricato: prezzoTesto, inVetrina: attiva, aggiornatoAt: adesso, ...idTitolo },
        });
      const prima = motiviPerSku.get(r.skuId);
      let dettaglio: string;
      if (r.azione === "archivia") dettaglio = "tolto dalla vetrina";
      else if (r.azione === "esaurito") dettaglio = `${prima?.pezziOra ?? 0} → 0 pezzi`;
      else if (r.azione === "nuovo" || r.azione === "riattiva")
        dettaglio = `${r.pezzi} pezzi${r.prezzo !== null ? ` a ${r.prezzo.toFixed(2).replace(".", ",")} €` : ""}`;
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

// --- Sospendi: pezzi = 0 su piu' sku in un colpo (resta visibile "Esaurito") ---
export async function sospendiSku(skuIds: number[], canaleId: number): Promise<number> {
  if (skuIds.length === 0) return 0;
  const adesso = new Date();
  await db.transaction(async (tx) => {
    for (const skuId of skuIds) {
      const [e] = await tx
        .select()
        .from(overridePortale)
        .where(and(eq(overridePortale.skuId, skuId), eq(overridePortale.canaleId, canaleId)));
      await tx
        .insert(overridePortale)
        .values({ skuId, canaleId, quantita: 0, condizione: e?.condizione ?? null, descrizione: e?.descrizione ?? null, modificatoAt: adesso })
        .onConflictDoUpdate({
          target: [overridePortale.skuId, overridePortale.canaleId],
          set: { quantita: 0, modificatoAt: adesso },
        });
    }
    await tx.insert(storicoPortale).values(skuIds.map((skuId) => ({ skuId, canaleId, azione: "sospeso", dettaglio: "Pezzi a 0 (sospeso)" })));
  });
  return skuIds.length;
}

// --- Allinea con il portale ------------------------------------------------------
export type DiffAllineamento = {
  skuCode: string;
  tipo: "uguale" | "diverso" | "solo-portale" | "solo-software" | "non-nel-software";
  cosa: string[];
  software: string;
  portale: string;
};
export type EsitoAnalisi = {
  contatori: Record<DiffAllineamento["tipo"], number>;
  diffs: DiffAllineamento[]; // senza gli "uguale"
};

const euroT = (n: number | null) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

async function confronta(canaleId: number, voci: VoceAllineamento[]) {
  const [skus, regs] = await Promise.all([
    db.select({ id: sku.id, skuCode: sku.skuCode }).from(sku),
    db.select().from(esposizioneCanale).where(eq(esposizioneCanale.canaleId, canaleId)),
  ]);
  const perCodice = new Map(skus.map((s) => [s.skuCode.toLowerCase(), s]));
  const regPerSku = new Map(regs.map((r) => [r.skuId, r]));
  const visti = new Set<number>();
  const diffs: DiffAllineamento[] = [];
  const daApplicare: { skuId: number; voce: VoceAllineamento }[] = [];
  for (const v of voci) {
    const s = perCodice.get(v.sku.toLowerCase());
    if (!s) {
      diffs.push({ skuCode: v.sku, tipo: "non-nel-software", cosa: [], software: "—", portale: `${v.attivo ? v.quantita : 0} pz` });
      continue;
    }
    visti.add(s.id);
    daApplicare.push({ skuId: s.id, voce: v });
    const r = regPerSku.get(s.id);
    const swIn = r?.inVetrina ?? false;
    const swQ = swIn ? (r?.quantitaCaricata ?? 0) : 0;
    const swP = swIn && r?.prezzoCaricato != null ? Number(r.prezzoCaricato) : null;
    const pQ = v.attivo ? v.quantita : 0;
    const software = swIn ? `${swQ} pz, ${euroT(swP)}` : "non online";
    const portale = v.attivo ? `${pQ} pz, ${euroT(v.prezzo)}` : "non visibile";
    const cosa: string[] = [];
    if (swIn !== v.attivo) cosa.push(v.attivo ? "online sul portale, non nel software" : "nel software e' online, sul portale no");
    else if (swIn) {
      if (swQ !== pQ) cosa.push("pezzi diversi");
      if (prezziDiversi(swP, v.prezzo)) cosa.push("prezzo diverso");
    }
    if (r?.idPortale !== v.idPortale) cosa.push("id portale da registrare");
    const solo = cosa.length === 1 && cosa[0] === "id portale da registrare";
    diffs.push({
      skuCode: s.skuCode,
      tipo: cosa.length === 0 ? "uguale" : solo ? "uguale" : !swIn && v.attivo ? "solo-portale" : "diverso",
      cosa,
      software,
      portale,
    });
  }
  const sparitiSku: number[] = [];
  const codici = new Map(skus.map((s) => [s.id, s.skuCode]));
  for (const r of regs) {
    if (r.inVetrina && !visti.has(r.skuId)) {
      sparitiSku.push(r.skuId);
      diffs.push({
        skuCode: codici.get(r.skuId) ?? String(r.skuId),
        tipo: "solo-software",
        cosa: ["nel software e' online, sul portale non c'e'"],
        software: `${r.quantitaCaricata} pz`,
        portale: "assente",
      });
    }
  }
  return { diffs, daApplicare, sparitiSku };
}

export async function analizzaAllineamento(canaleId: number, voci: VoceAllineamento[]): Promise<EsitoAnalisi> {
  const { diffs } = await confronta(canaleId, voci);
  const contatori = { uguale: 0, diverso: 0, "solo-portale": 0, "solo-software": 0, "non-nel-software": 0 };
  for (const d of diffs) contatori[d.tipo]++;
  return { contatori, diffs: diffs.filter((d) => d.tipo !== "uguale").sort((a, b) => a.skuCode.localeCompare(b.skuCode)) };
}

// Il software prende per buono quello che c'e' sul portale: stato, pezzi, prezzo e id.
// Gli sku online nel software ma assenti dal portale risultano non online.
export async function applicaAllineamento(canaleId: number, voci: VoceAllineamento[]): Promise<{ allineati: number; tolti: number }> {
  const { daApplicare, sparitiSku } = await confronta(canaleId, voci);
  const adesso = new Date();
  await db.transaction(async (tx) => {
    for (const { skuId, voce } of daApplicare) {
      const q = voce.attivo ? voce.quantita : 0;
      const prezzo = voce.attivo && voce.prezzo !== null ? voce.prezzo.toFixed(2) : null;
      await tx
        .insert(esposizioneCanale)
        .values({ skuId, canaleId, quantitaCaricata: q, prezzoCaricato: prezzo, inVetrina: voce.attivo, idPortale: voce.idPortale, titoloPortale: voce.titolo, aggiornatoAt: adesso })
        .onConflictDoUpdate({
          target: [esposizioneCanale.skuId, esposizioneCanale.canaleId],
          set: { quantitaCaricata: q, prezzoCaricato: prezzo, inVetrina: voce.attivo, idPortale: voce.idPortale, titoloPortale: voce.titolo, aggiornatoAt: adesso },
        });
    }
    for (const skuId of sparitiSku) {
      await tx
        .update(esposizioneCanale)
        .set({ quantitaCaricata: 0, prezzoCaricato: null, inVetrina: false, aggiornatoAt: adesso })
        .where(and(eq(esposizioneCanale.skuId, skuId), eq(esposizioneCanale.canaleId, canaleId)));
    }
    const voceStorico = [
      ...daApplicare.map((x) => ({ skuId: x.skuId, canaleId, azione: "allineato", dettaglio: x.voce.attivo ? `${x.voce.quantita} pz` : "non visibile" })),
      ...sparitiSku.map((skuId) => ({ skuId, canaleId, azione: "allineato", dettaglio: "assente dal portale: tolto dalla vetrina" })),
    ];
    for (let i = 0; i < voceStorico.length; i += 500) await tx.insert(storicoPortale).values(voceStorico.slice(i, i + 500));
  });
  return { allineati: daApplicare.length, tolti: sparitiSku.length };
}
