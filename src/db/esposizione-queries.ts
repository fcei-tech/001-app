import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { impegnatoSql } from "./queries";
import { bloccoSkuCanale, canali, esposizioneCanale, movimentiMagazzino, sku, storicoPortale } from "./schema";
import {
  ETICHETTA_MOTIVO,
  disponibileLibero,
  prezziDiversi,
  prezzoPerPortale,
  quantitaDaCaricare,
  type Annullabile,
  type ModificaBlocco,
  type ModificaEsposizione,
  type RigaDaFare,
  type TipoDaFare,
} from "@/lib/esposizione";

// Registro "esposto" dei portali statici (2026-10-07). Tutto il calcolo e'
// fatto in memoria: ~1300 sku x pochi portali, nessun bisogno di SQL
// complesso. Regole (vedi src/lib/esposizione.ts e knowledge 09f):
//  - eleggibile su un portale = sku non bloccato in generale, non bloccato su
//    quel portale, codice diverso da IGNORA
//  - disponibile libero = totale a magazzino - impegnato nelle aste
//  - quantita' target = fascia sul disponibile libero (Subito: sempre 1)
//  - DA AGGIUNGERE: target > 0 e nulla caricato ("nuovo" se mai caricato,
//    "tornato" se era stato rimosso)
//  - DA TOGLIERE: caricato > 0 e target = 0 (esaurito o bloccato)
//  - DA ABBASSARE: caricato > disponibile libero (rischio di vendere cio'
//    che non c'e'). Gli aumenti non vengono mai segnalati.
//  - DA RIPREZZARE (2026-10-19): caricato, nessuna delle azioni sopra e il
//    prezzo di oggi (da prezzo eBay, vedi prezzoPerPortale) e' diverso da
//    quello registrato al momento della conferma. Righe senza prezzo
//    registrato (precedenti) non vengono mai segnalate.
//  - BLOCCO / RITIRO: stessa tabella, stesso effetto (target 0); cambia solo
//    l'etichetta ("Bloccato" / "Ritirato da te").

export type CanaleStatico = typeof canali.$inferSelect;

async function getCanaliStaticiAttivi(): Promise<CanaleStatico[]> {
  return db.query.canali.findMany({
    where: (c, { and: e, eq: uguale }) => e(uguale(c.tipo, "statico"), uguale(c.attivo, true)),
    orderBy: (c, { asc }) => asc(c.nome),
  });
}

export async function getCanaliStatici(): Promise<CanaleStatico[]> {
  return getCanaliStaticiAttivi();
}

// Storico operazioni (2026-10-20): una riga per sku. Si scrive DENTRO la
// stessa transazione dell'operazione, cosi' storico e stato non divergono.
type VoceStorico = { skuId: number; azione: string; dettaglio?: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function scriviStorico(tx: Tx, canaleId: number, voci: VoceStorico[]) {
  for (let i = 0; i < voci.length; i += 500) {
    await tx
      .insert(storicoPortale)
      .values(voci.slice(i, i + 500).map((v) => ({ canaleId, skuId: v.skuId, azione: v.azione, dettaglio: v.dettaglio ?? null })));
  }
}
const eur = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

export async function getBaseSku() {
  return db
    .select({
      id: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      bloccatoVendita: sku.bloccatoVendita,
      prezzoEbay: sku.prezzoEbay,
      disponibile: sql`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number),
      impegnato: impegnatoSql().mapWith(Number),
    })
    .from(sku)
    .leftJoin(movimentiMagazzino, eq(movimentiMagazzino.skuId, sku.id))
    .groupBy(sku.id);
}

export async function calcolaDaFare(): Promise<{
  canali: CanaleStatico[];
  righe: Map<number, RigaDaFare[]>;
}> {
  const [elenco, base, esposti, blocchi] = await Promise.all([
    getCanaliStaticiAttivi(),
    getBaseSku(),
    db.select().from(esposizioneCanale),
    db.select().from(bloccoSkuCanale),
  ]);

  const espostoMap = new Map<string, number>();
  const prezzoCaricatoMap = new Map<string, number | null>();
  for (const e of esposti) {
    espostoMap.set(`${e.skuId}:${e.canaleId}`, e.quantitaCaricata);
    prezzoCaricatoMap.set(`${e.skuId}:${e.canaleId}`, e.prezzoCaricato === null ? null : Number(e.prezzoCaricato));
  }
  const bloccoMap = new Map(blocchi.map((b) => [`${b.skuId}:${b.canaleId}`, b.motivo]));

  const righe = new Map<number, RigaDaFare[]>();
  for (const c of elenco) {
    const lista: RigaDaFare[] = [];
    for (const s of base) {
      if (s.skuCode === "IGNORA") continue;
      const chiave = `${s.id}:${c.id}`;
      const haRiga = espostoMap.has(chiave);
      const caricata = espostoMap.get(chiave) ?? 0;
      const bloccatoQui = s.bloccatoVendita || bloccoMap.has(chiave);
      const ritirato = !s.bloccatoVendita && bloccoMap.get(chiave) === "ritiro";
      const libero = disponibileLibero(s.disponibile, s.impegnato);
      const target = bloccatoQui ? 0 : quantitaDaCaricare(libero, c.impostazioni);
      const prezzoCaricato = prezzoCaricatoMap.get(chiave) ?? null;
      const prezzoTarget = prezzoPerPortale(c.nome, s.prezzoEbay);
      const comune = {
        skuId: s.id,
        skuCode: s.skuCode,
        artista: s.artista,
        opera: s.opera,
        quantitaCaricata: caricata,
        disponibileLibero: libero,
        quantitaTarget: target,
        prezzoCaricato,
        prezzoTarget,
      };
      if (caricata === 0) {
        if (target > 0) {
          lista.push({ ...comune, tipo: "aggiungere", motivo: haRiga ? "tornato" : "nuovo" });
        }
      } else if (target === 0) {
        lista.push({
          ...comune,
          tipo: "togliere",
          motivo: ritirato ? "ritirato" : bloccatoQui ? "bloccato" : "esaurito",
        });
      } else if (caricata > libero) {
        lista.push({ ...comune, tipo: "abbassare", motivo: "abbassare" });
      } else if (prezziDiversi(prezzoCaricato, prezzoTarget)) {
        lista.push({ ...comune, tipo: "riprezzare", motivo: "prezzo" });
      }
    }
    lista.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
    righe.set(c.id, lista);
  }
  return { canali: elenco, righe };
}

export async function getDaFareCanale(canaleId: number): Promise<RigaDaFare[]> {
  const { righe } = await calcolaDaFare();
  return righe.get(canaleId) ?? [];
}

export type DaSistemare = { canaleId: number; portale: string; tipo: TipoDaFare };

// Per il Magazzino: per ogni sku, su quali portali c'e' qualcosa da sistemare.
export async function getDaSistemarePerSku(): Promise<Record<number, DaSistemare[]>> {
  const { canali: elenco, righe } = await calcolaDaFare();
  const nomi = new Map(elenco.map((c) => [c.id, c.nome]));
  const out: Record<number, DaSistemare[]> = {};
  for (const [canaleId, lista] of righe) {
    for (const r of lista) {
      (out[r.skuId] ??= []).push({ canaleId, portale: nomi.get(canaleId) ?? "", tipo: r.tipo });
    }
  }
  return out;
}

// Conferma: applica SOLO agli sku che sono ancora davvero in quella lista
// (i dati possono essere cambiati dopo il caricamento della pagina).
// Restituisce anche lo stato prima/dopo per l'Annulla.
export async function confermaDaFare(
  canaleId: number,
  tipo: TipoDaFare,
  skuIds: number[]
): Promise<{ n: number; annullabile?: Annullabile }> {
  if (skuIds.length === 0) return { n: 0 };
  const lista = (await getDaFareCanale(canaleId)).filter(
    (r) => r.tipo === tipo && skuIds.includes(r.skuId)
  );
  if (lista.length === 0) return { n: 0 };
  const modifiche: ModificaEsposizione[] = [];
  const voci: VoceStorico[] = [];
  await db.transaction(async (tx) => {
    const prima = await tx
      .select()
      .from(esposizioneCanale)
      .where(and(eq(esposizioneCanale.canaleId, canaleId), inArray(esposizioneCanale.skuId, lista.map((r) => r.skuId))));
    const primaMap = new Map(prima.map((e) => [e.skuId, e.quantitaCaricata]));
    const prezzoPrimaMap = new Map(prima.map((e) => [e.skuId, e.prezzoCaricato === null ? null : Number(e.prezzoCaricato)]));
    for (const r of lista) {
      // Quantita': "togliere" -> 0; "riprezzare" -> resta com'e' (si cambia
      // solo il prezzo); altrimenti la quantita' di oggi.
      const quantita =
        tipo === "togliere" ? 0 : tipo === "riprezzare" ? r.quantitaCaricata : r.quantitaTarget;
      // Prezzo registrato: togliere -> nessuno; aggiungere/riprezzare -> quello
      // di oggi; abbassare -> invariato.
      const prezzoDopo =
        tipo === "togliere" ? null : tipo === "abbassare" ? (prezzoPrimaMap.get(r.skuId) ?? null) : r.prezzoTarget;
      const prezzoDopoTesto = prezzoDopo === null ? null : prezzoDopo.toFixed(2);
      await tx
        .insert(esposizioneCanale)
        .values({ skuId: r.skuId, canaleId, quantitaCaricata: quantita, prezzoCaricato: prezzoDopoTesto })
        .onConflictDoUpdate({
          target: [esposizioneCanale.skuId, esposizioneCanale.canaleId],
          set: { quantitaCaricata: quantita, prezzoCaricato: prezzoDopoTesto, aggiornatoAt: new Date() },
        });
      const AZIONE: Record<string, string> = { aggiungere: "aggiunto", togliere: "tolto", abbassare: "abbassato", riprezzare: "riprezzato" };
      const qPrima = primaMap.get(r.skuId) ?? 0;
      const dettaglio =
        tipo === "riprezzare"
          ? `${eur(prezzoPrimaMap.get(r.skuId) ?? null)} → ${eur(prezzoDopo)}`
          : tipo === "togliere"
            ? `${qPrima} → 0 pezzi (${ETICHETTA_MOTIVO[r.motivo].toLowerCase()})`
            : `${qPrima} → ${quantita} pezzi${prezzoDopo !== null ? ` a ${eur(prezzoDopo)}` : ""}`;
      voci.push({ skuId: r.skuId, azione: AZIONE[tipo], dettaglio });
      modifiche.push({
        skuId: r.skuId,
        prima: primaMap.has(r.skuId) ? primaMap.get(r.skuId)! : null,
        dopo: quantita,
        prezzoPrima: prezzoPrimaMap.has(r.skuId) ? prezzoPrimaMap.get(r.skuId)! : null,
        prezzoDopo,
      });
    }
    await scriviStorico(tx, canaleId, voci);
  });
  return { n: lista.length, annullabile: { tipo: "esposizione", canaleId, modifiche } };
}

// motivo: "ritiro" per "Ritira da…", "blocco" per "non pubblicare mai qui".
// Se lo sku e' gia' bloccato/ritirato il motivo esistente NON cambia; togliere
// il blocco (bloccato = false) vale per entrambi i motivi.
export async function impostaBlocco(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean,
  motivo: "blocco" | "ritiro" = "blocco"
): Promise<{ n: number; annullabile?: Annullabile }> {
  if (skuIds.length === 0) return { n: 0 };
  const modifiche: ModificaBlocco[] = [];
  await db.transaction(async (tx) => {
    const esistenti = await tx
      .select()
      .from(bloccoSkuCanale)
      .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, skuIds)));
    const eraBloccato = new Set(esistenti.map((b) => b.skuId));
    const motivoPrima = new Map(esistenti.map((b) => [b.skuId, b.motivo]));
    for (const id of skuIds) {
      if (eraBloccato.has(id) !== bloccato) {
        modifiche.push({ skuId: id, prima: eraBloccato.has(id), dopo: bloccato, motivoPrima: motivoPrima.get(id) });
      }
    }
    await scriviStorico(
      tx,
      canaleId,
      modifiche.map((m) => ({
        skuId: m.skuId,
        azione: m.dopo
          ? motivo === "ritiro" ? "ritirato" : "bloccato"
          : m.motivoPrima === "ritiro" ? "rimesso" : "sbloccato",
      }))
    );
    if (bloccato) {
      await tx.insert(bloccoSkuCanale).values(skuIds.map((skuId) => ({ skuId, canaleId, motivo }))).onConflictDoNothing();
    } else {
      await tx
        .delete(bloccoSkuCanale)
        .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, skuIds)));
    }
  });
  return {
    n: skuIds.length,
    annullabile: modifiche.length ? { tipo: "blocco", canaleId, modifiche } : undefined,
  };
}

// Annulla l'ultima operazione: tutto o niente. Rifiutato se uno degli sku
// non e' piu' nello stato scritto dall'operazione (qualcuno l'ha cambiato).
export async function annullaModifiche(a: Annullabile): Promise<{ ok: boolean; errore?: string }> {
  const { canaleId } = a;
  const ids = a.modifiche.map((m) => m.skuId);
  if (ids.length === 0) return { ok: true };
  let errore: string | undefined;
  await db.transaction(async (tx) => {
    if (a.tipo === "esposizione") {
      const correnti = await tx
        .select()
        .from(esposizioneCanale)
        .where(and(eq(esposizioneCanale.canaleId, canaleId), inArray(esposizioneCanale.skuId, ids)));
      const mappa = new Map(correnti.map((e) => [e.skuId, e.quantitaCaricata]));
      if (a.modifiche.some((m) => mappa.get(m.skuId) !== m.dopo)) {
        errore = "Nel frattempo qualche sku e' stato cambiato: non annullo per non sovrascrivere.";
        return;
      }
      for (const m of a.modifiche) {
        if (m.prima === null) {
          await tx.delete(esposizioneCanale).where(and(eq(esposizioneCanale.canaleId, canaleId), eq(esposizioneCanale.skuId, m.skuId)));
        } else {
          const ripristino: Partial<typeof esposizioneCanale.$inferInsert> = {
            quantitaCaricata: m.prima,
            aggiornatoAt: new Date(),
          };
          if (m.prezzoPrima !== undefined) {
            ripristino.prezzoCaricato = m.prezzoPrima === null ? null : m.prezzoPrima.toFixed(2);
          }
          await tx
            .update(esposizioneCanale)
            .set(ripristino)
            .where(and(eq(esposizioneCanale.canaleId, canaleId), eq(esposizioneCanale.skuId, m.skuId)));
        }
      }
    } else {
      const correnti = await tx
        .select()
        .from(bloccoSkuCanale)
        .where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, ids)));
      const bloccati = new Set(correnti.map((b) => b.skuId));
      if (a.modifiche.some((m) => bloccati.has(m.skuId) !== m.dopo)) {
        errore = "Nel frattempo qualche sku e' stato cambiato: non annullo per non sovrascrivere.";
        return;
      }
      const daBloccareM = a.modifiche.filter((m) => m.prima);
      const daSbloccare = a.modifiche.filter((m) => !m.prima).map((m) => m.skuId);
      if (daBloccareM.length) {
        await tx
          .insert(bloccoSkuCanale)
          .values(daBloccareM.map((m) => ({ skuId: m.skuId, canaleId, motivo: m.motivoPrima ?? "blocco" })))
          .onConflictDoNothing();
      }
      if (daSbloccare.length) {
        await tx.delete(bloccoSkuCanale).where(and(eq(bloccoSkuCanale.canaleId, canaleId), inArray(bloccoSkuCanale.skuId, daSbloccare)));
      }
    }
    if (!errore) {
      await scriviStorico(tx, canaleId, ids.map((skuId) => ({ skuId, azione: "annullato", dettaglio: "operazione annullata" })));
    }
  });
  return errore ? { ok: false, errore } : { ok: true };
}

export type StatoPortaleSku = {
  canaleId: number;
  portale: string;
  quantitaCaricata: number;
  bloccato: boolean;
  ritirato: boolean; // bloccato con motivo "ritiro"
};

// Per la scheda sku: situazione dello sku su ogni portale statico attivo.
export async function getStatoPortaliSku(skuId: number): Promise<StatoPortaleSku[]> {
  const [elenco, esposti, blocchi] = await Promise.all([
    getCanaliStaticiAttivi(),
    db.select().from(esposizioneCanale).where(eq(esposizioneCanale.skuId, skuId)),
    db.select().from(bloccoSkuCanale).where(eq(bloccoSkuCanale.skuId, skuId)),
  ]);
  return elenco.map((c) => ({
    canaleId: c.id,
    portale: c.nome,
    quantitaCaricata: esposti.find((e) => e.canaleId === c.id)?.quantitaCaricata ?? 0,
    bloccato: blocchi.some((b) => b.canaleId === c.id),
    ritirato: blocchi.some((b) => b.canaleId === c.id && b.motivo === "ritiro"),
  }));
}

export type RigaRitirato = { skuId: number; skuCode: string; artista: string; opera: string; quantitaCaricata: number; ritiratoIl: Date };

// Sku ritirati da un portale con "Ritira da…" (per la lista "Ritirati" della
// pagina del portale, da cui si rimettono in vendita).
export async function getRitiratiCanale(canaleId: number): Promise<RigaRitirato[]> {
  const righe = await db
    .select({
      skuId: sku.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      quantitaCaricata: sql<number>`coalesce(${esposizioneCanale.quantitaCaricata}, 0)`.mapWith(Number),
      ritiratoIl: bloccoSkuCanale.createdAt,
    })
    .from(bloccoSkuCanale)
    .innerJoin(sku, eq(sku.id, bloccoSkuCanale.skuId))
    .leftJoin(
      esposizioneCanale,
      and(eq(esposizioneCanale.skuId, bloccoSkuCanale.skuId), eq(esposizioneCanale.canaleId, bloccoSkuCanale.canaleId))
    )
    .where(and(eq(bloccoSkuCanale.canaleId, canaleId), eq(bloccoSkuCanale.motivo, "ritiro")));
  return righe.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

// --- Online su un portale ---------------------------------------------------
export type RigaOnline = {
  skuId: number;
  skuCode: string;
  artista: string;
  opera: string;
  quantitaCaricata: number;
  prezzoOnline: number | null;
  prezzoOggi: number | null;
  aggiornatoIl: Date;
  // true se lo sku e' gia' in "Da togliere" (ritirato/bloccato/esaurito)
  daTogliere: boolean;
};

// Tutti gli sku con quantita' caricata > 0 su quel portale.
export async function getOnlineCanale(canaleId: number): Promise<RigaOnline[]> {
  const [canale, righe, daFare] = await Promise.all([
    db.select().from(canali).where(eq(canali.id, canaleId)),
    db
      .select({
        skuId: sku.id,
        skuCode: sku.skuCode,
        artista: sku.artista,
        opera: sku.opera,
        prezzoEbay: sku.prezzoEbay,
        quantitaCaricata: esposizioneCanale.quantitaCaricata,
        prezzoCaricato: esposizioneCanale.prezzoCaricato,
        aggiornatoIl: esposizioneCanale.aggiornatoAt,
      })
      .from(esposizioneCanale)
      .innerJoin(sku, eq(sku.id, esposizioneCanale.skuId))
      .where(and(eq(esposizioneCanale.canaleId, canaleId), sql`${esposizioneCanale.quantitaCaricata} > 0`)),
    getDaFareCanale(canaleId),
  ]);
  const nome = canale[0]?.nome ?? "";
  const togliere = new Set(daFare.filter((r) => r.tipo === "togliere").map((r) => r.skuId));
  return righe
    .map((r) => ({
      skuId: r.skuId,
      skuCode: r.skuCode,
      artista: r.artista,
      opera: r.opera,
      quantitaCaricata: r.quantitaCaricata,
      prezzoOnline: r.prezzoCaricato === null ? null : Number(r.prezzoCaricato),
      prezzoOggi: prezzoPerPortale(nome, r.prezzoEbay),
      aggiornatoIl: r.aggiornatoIl,
      daTogliere: togliere.has(r.skuId),
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

// --- Storico ------------------------------------------------------------------
export type RigaStorico = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  azione: string;
  dettaglio: string | null;
  quando: Date;
};

export async function getStoricoCanale(canaleId: number, limite = 300): Promise<RigaStorico[]> {
  const righe = await db
    .select({
      id: storicoPortale.id,
      skuCode: sku.skuCode,
      artista: sku.artista,
      opera: sku.opera,
      azione: storicoPortale.azione,
      dettaglio: storicoPortale.dettaglio,
      quando: storicoPortale.createdAt,
    })
    .from(storicoPortale)
    .innerJoin(sku, eq(sku.id, storicoPortale.skuId))
    .where(eq(storicoPortale.canaleId, canaleId))
    .orderBy(desc(storicoPortale.createdAt), desc(storicoPortale.id))
    .limit(limite);
  return righe;
}
