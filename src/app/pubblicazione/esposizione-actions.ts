"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { sku } from "@/db/schema";
import { getCanaleById } from "@/db/pubblicazione-queries";
import { getFotoPerSkuIds } from "@/db/queries";
import { annullaModifiche, impostaBlocco } from "@/db/esposizione-queries";
import {
  analizzaAllineamento,
  applicaAllineamento,
  applicaRighe,
  confermaFilePortale,
  getTabellaCanale,
  rigaFileDa,
  ripristinaOverride,
  salvaFilePortale,
  salvaOverride,
  scartaFilePortale,
  sospendiSku,
  type CampoOverride,
} from "@/db/portale-queries";
import type { Annullabile } from "@/lib/esposizione";
import type { VoceAllineamento } from "@/lib/allinea-portale";
import type { RigaFile, RigaPortale } from "@/lib/tabella-portale";
import {
  ETICHETTA_SCARTO_EBAY,
  generaCsvEbayAdd,
  generaCsvEbayRevise,
  generaCsvEbayReviseTesti,
  motivoScartoEbay,
  nomeFileEbay,
  type NuovoEbay,
  type ReviseEbay,
  type ReviseTestoEbay,
} from "@/lib/ebay-export";
import {
  buildTitolo,
  ETICHETTA_SCARTO_SHOPIFY,
  generaCsvAggiornamenti,
  generaCsvArchiviati,
  generaCsvNuovi,
  generaCsvTesti,
  handleShopify,
  motivoScarto,
  nomeFileShopify,
  SPUNTE_SHOPIFY,
  type AggiornamentoShopify,
  type PerAggiornamento,
  type RigaShopifyInput,
  type TestoShopify,
  type TipoFileShopify,
} from "@/lib/shopify-export";

// Esito restituito (mai eccezioni): in produzione Next maschera il testo
// degli errori lanciati da una server action.
export type EsitoEsposizione = {
  ok: boolean;
  errore?: string;
  messaggio?: string;
  annullabile?: Annullabile;
  // Operazioni su piu' portali insieme: un annullabile per portale.
  annullabili?: Annullabile[];
};

function aggiorna(canaleId?: number) {
  if (canaleId) revalidatePath(`/pubblicazione/${canaleId}`);
  revalidatePath("/pubblicazione");
  revalidatePath("/");
}

export async function impostaBloccoPortaleAction(
  skuIds: number[],
  canaleId: number,
  bloccato: boolean,
  motivo: "blocco" | "ritiro" = "blocco"
): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0 || !Number.isInteger(canaleId)) return { ok: false, errore: "Selezione non valida." };
    const m = motivo === "ritiro" ? "ritiro" : "blocco";
    const { annullabile } = await impostaBlocco(ids, canaleId, bloccato, m);
    aggiorna(canaleId);
    const parola = m === "ritiro" ? ["ritirati da questo portale", "rimessi in vendita"] : ["bloccati su questo portale", "sbloccati"];
    return {
      ok: true,
      messaggio: `${ids.length} sku ${bloccato ? parola[0] : parola[1]}.`,
      annullabile,
    };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// "Escludi" / "Rimetti in vendita": stessa operazione su PIU' portali
// insieme. Gli sku esclusi finiscono in "Esclusi" di ognuno; si
// rimettono con "Rimetti in vendita" (Magazzino, scheda sku o lista Ritirati
// del portale).
export async function ritiraDaPortaliAction(
  skuIds: number[],
  canaleIds: number[],
  ritirare: boolean
): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    const canali = [...new Set(canaleIds.filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0 || canali.length === 0) return { ok: false, errore: "Scegli almeno un portale." };
    const annullabili: Annullabile[] = [];
    for (const canaleId of canali) {
      const { annullabile } = await impostaBlocco(ids, canaleId, ritirare, "ritiro");
      if (annullabile) annullabili.push(annullabile);
      aggiorna(canaleId);
    }
    return {
      ok: true,
      messaggio: ritirare
        ? `${ids.length} sku esclusi da ${canali.length} ${canali.length === 1 ? "portale" : "portali"}: li trovi in "Esclusi" (in fondo alla pagina).`
        : `${ids.length} sku rimessi in vendita su ${canali.length} ${canali.length === 1 ? "portale" : "portali"}.`,
      annullabili,
    };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function annullaEsposizioneAction(a: Annullabile): Promise<EsitoEsposizione> {
  try {
    const r = await annullaModifiche(a);
    if (!r.ok) return { ok: false, errore: r.errore ?? "Annulla non riuscito." };
    aggiorna(a.canaleId);
    return { ok: true, messaggio: "Operazione annullata." };
  } catch (e) {
    return { ok: false, errore: `Annulla non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// --- Tabella portale (2026-10-27) ----------------------------------------------

function righeDaInviare(tabella: RigaPortale[], skuIds?: number[]): RigaPortale[] {
  const ids = skuIds && skuIds.length > 0 ? new Set(skuIds) : null;
  return tabella.filter((r) => r.stato !== "online" && (!ids || ids.has(r.skuId)));
}

export async function salvaCellaPortaleAction(
  skuId: number,
  canaleId: number,
  campo: CampoOverride,
  valore: string | null
): Promise<EsitoEsposizione> {
  try {
    if (!Number.isInteger(skuId) || !Number.isInteger(canaleId)) return { ok: false, errore: "Dati non validi." };
    if (campo !== "quantita" && campo !== "condizione" && campo !== "descrizione") return { ok: false, errore: "Campo non valido." };
    const r = await salvaOverride(skuId, canaleId, campo, valore);
    aggiorna(canaleId);
    return r.ok ? { ok: true } : { ok: false, errore: r.errore };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function ripristinaCellePortaleAction(skuIds: number[], canaleId: number): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return { ok: false, errore: "Seleziona almeno uno sku." };
    await ripristinaOverride(ids, canaleId);
    aggiorna(canaleId);
    return { ok: true, messaggio: `${ids.length} sku tornati ai valori automatici.` };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// File Shopify con TUTTO quello che c'e' da mandare, diviso per tipo (vedi
// shopify-export.ts): NUOVI (con foto), AGGIORNAMENTI, TESTI, ARCHIVIATI. NON
// cambia lo stato della tabella: salva l'elenco delle righe incluse, che
// "Ho caricato il file" registrera' esattamente. Se ci sono sku selezionati,
// solo quelli.
export type FileGenerato = { tipo: string; nome: string; csv: string; nSku: number; istruzione: string; daProvare?: boolean };
export type EsitoFileShopify = {
  ok: boolean;
  errore?: string;
  files?: FileGenerato[];
  inclusi?: number;
  scartati?: { skuCode: string; artista: string; opera: string; motivo: string }[];
};

const MOTIVO_NON_ALLINEATO = "Prodotto non ancora allineato con Shopify: fai prima \"Allinea con il portale\"";

function marcaFile(): string {
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => parti.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}_${v("hour")}${v("minute")}`;
}

function istruzioneShopify(tipo: TipoFileShopify): string {
  const sp = SPUNTE_SHOPIFY[tipo];
  return `Shopify: Prodotti → Importa. Spunta "Sovrascrivi i prodotti con handle corrispondenti"${
    sp.pubblica ? ' e "Pubblica i nuovi prodotti su tutti i canali"' : ' e togli "Pubblica i nuovi prodotti…"'
  }.${tipo === "TESTI" || tipo === "ARCHIVIATI" ? " Da provare su un prodotto prima di usarlo su tutti." : ""}`;
}

// Un solo punto d'ingresso per il pulsante "Scarica file": sceglie il generatore del portale.
export async function generaFilePortaleAction(canaleId: number, skuIds?: number[]): Promise<EsitoFileShopify> {
  try {
    const canale = await getCanaleById(canaleId);
    if (canale?.nome === "Shopify") return generaFileShopify(canaleId, skuIds);
    if (canale?.nome === "eBay") return generaFileEbay(canaleId, skuIds);
    return { ok: false, errore: "Per questo portale il file non e' ancora disponibile." };
  } catch (e) {
    return { ok: false, errore: `Generazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

async function generaFileEbay(canaleId: number, skuIds?: number[]): Promise<EsitoFileShopify> {
  const daInviare = righeDaInviare(await getTabellaCanale(canaleId), skuIds);
  if (daInviare.length === 0) return { ok: false, errore: "Niente da mandare: la tabella nel frattempo e' cambiata." };
  const ids = daInviare.map((r) => r.skuId);
  const nuoviIds = daInviare.filter((r) => r.stato === "nuovo").map((r) => r.skuId);
  const [dati, fotoMappa] = await Promise.all([
    db
      .select({
        id: sku.id,
        skuCode: sku.skuCode,
        artista: sku.artista,
        opera: sku.opera,
        larghezza: sku.larghezza,
        altezza: sku.altezza,
        supporto: sku.supporto,
        anno: sku.anno,
      })
      .from(sku)
      .where(inArray(sku.id, ids)),
    getFotoPerSkuIds(nuoviIds),
  ]);
  const datiPerId = new Map(dati.map((d) => [d.id, d]));
  const nuovi: NuovoEbay[] = [];
  const revise: ReviseEbay[] = [];
  const reviseTesti: ReviseTestoEbay[] = [];
  const incluse: RigaFile[] = [];
  const scartati: NonNullable<EsitoFileShopify["scartati"]> = [];
  const scarta = (d: { skuCode: string; artista: string; opera: string }, motivo: string) =>
    scartati.push({ skuCode: d.skuCode, artista: d.artista, opera: d.opera, motivo });

  for (const r of daInviare.sort((a, b) => a.skuCode.localeCompare(b.skuCode))) {
    const d = datiPerId.get(r.skuId);
    if (!d) continue;
    const file = rigaFileDa(r, false);
    if (!file) continue;
    const testo = { condizione: r.condizioneOverride, descrizione: r.descrizioneOverride };
    if (file.azione === "nuovo") {
      const foto = (fotoMappa.get(d.id) ?? []).map((f) => f.url);
      const motivo = motivoScartoEbay(d, r.prezzoOggi, foto.length);
      if (motivo || r.prezzoOggi === null) {
        scarta(d, ETICHETTA_SCARTO_EBAY[motivo ?? "prezzo_mancante"]);
        continue;
      }
      nuovi.push({ sku: d, quantita: file.pezzi, prezzo: r.prezzoOggi, foto, testo });
      incluse.push(file);
      continue;
    }
    if (file.azione === "archivia") {
      scarta(d, "Da chiudere a mano su eBay; poi premi \"Segna come fatto\"");
      continue;
    }
    if (!r.idPortale) {
      scarta(d, MOTIVO_NON_ALLINEATO.replace("Shopify", "eBay"));
      continue;
    }
    const prezzo = file.prezzo ?? r.prezzoOnline;
    const serveRevise = file.azione === "esaurito" || r.motivi.some((m) => m !== "testo");
    if (serveRevise) {
      if (prezzo === null) {
        scarta(d, "Prezzo mancante");
        continue;
      }
      revise.push({ itemId: r.idPortale, skuCode: d.skuCode, pezzi: file.pezzi, prezzo });
    }
    if (file.testo) reviseTesti.push({ itemId: r.idPortale, sku: d, testo });
    incluse.push(file);
  }
  if (incluse.length === 0) return { ok: false, errore: "Nessuno sku utilizzabile.", scartati };
  const marca = marcaFile();
  const files: FileGenerato[] = [];
  const nota = "eBay: carica con File Exchange come sempre.";
  if (nuovi.length > 0) files.push({ tipo: "ADD", nome: nomeFileEbay("ADD", marca), csv: generaCsvEbayAdd(nuovi), nSku: nuovi.length, istruzione: nota });
  if (revise.length > 0)
    files.push({ tipo: "REVISE", nome: nomeFileEbay("REVISE", marca), csv: generaCsvEbayRevise(revise), nSku: revise.length, istruzione: `${nota} DA PROVARE: usalo prima su 1–2 annunci.`, daProvare: true });
  if (reviseTesti.length > 0)
    files.push({ tipo: "REVISE-TESTI", nome: nomeFileEbay("REVISE-TESTI", marca), csv: generaCsvEbayReviseTesti(reviseTesti), nSku: reviseTesti.length, istruzione: `${nota} DA PROVARE: usalo prima su 1–2 annunci.`, daProvare: true });
  await salvaFilePortale(canaleId, files.map((f) => f.nome).join("|"), incluse);
  aggiorna(canaleId);
  return { ok: true, files, inclusi: incluse.length, scartati };
}

async function generaFileShopify(canaleId: number, skuIds?: number[]): Promise<EsitoFileShopify> {
  {
    const daInviare = righeDaInviare(await getTabellaCanale(canaleId), skuIds);
    if (daInviare.length === 0) return { ok: false, errore: "Niente da mandare: la tabella nel frattempo e' cambiata." };

    const ids = daInviare.map((r) => r.skuId);
    const nuoviIds = daInviare.filter((r) => r.stato === "nuovo" && !r.idPortale).map((r) => r.skuId);
    const [dati, fotoMappa] = await Promise.all([
      db
        .select({
          id: sku.id,
          skuCode: sku.skuCode,
          artista: sku.artista,
          opera: sku.opera,
          larghezza: sku.larghezza,
          altezza: sku.altezza,
          supporto: sku.supporto,
          anno: sku.anno,
          prezzoEbay: sku.prezzoEbay,
        })
        .from(sku)
        .where(inArray(sku.id, ids)),
      getFotoPerSkuIds(nuoviIds),
    ]);
    const datiPerId = new Map(dati.map((d) => [d.id, d]));

    const prodotti: RigaShopifyInput[] = [];
    const aggiornamenti: AggiornamentoShopify[] = [];
    const testi: TestoShopify[] = [];
    const archiviati: PerAggiornamento[] = [];
    const incluse: RigaFile[] = [];
    const scartati: NonNullable<EsitoFileShopify["scartati"]> = [];
    const scarta = (d: { skuCode: string; artista: string; opera: string }, motivo: string) =>
      scartati.push({ skuCode: d.skuCode, artista: d.artista, opera: d.opera, motivo });

    for (const r of daInviare.sort((a, b) => a.skuCode.localeCompare(b.skuCode))) {
      const d = datiPerId.get(r.skuId);
      if (!d) continue;
      const file = rigaFileDa(r, true);
      if (!file) continue;
      const testo = { condizione: r.condizioneOverride, descrizione: r.descrizioneOverride };

      // Prodotto davvero nuovo: file completo con foto.
      if (file.azione === "nuovo") {
        const foto = (fotoMappa.get(d.id) ?? []).map((f) => f.url);
        const motivo = motivoScarto(d, foto.length);
        if (motivo) {
          scarta(d, ETICHETTA_SCARTO_SHOPIFY[motivo]);
          continue;
        }
        prodotti.push({ sku: d, quantita: file.pezzi, foto, testo });
        incluse.push({ ...file, idPortale: handleShopify(d.skuCode), titolo: buildTitolo(d) });
        continue;
      }

      // Tutto il resto riguarda un prodotto che esiste gia' su Shopify.
      if (!r.idPortale) {
        scarta(d, MOTIVO_NON_ALLINEATO);
        continue;
      }
      const info = { handle: r.idPortale, titolo: r.titoloPortale ?? buildTitolo(d), skuCode: d.skuCode };
      if (file.azione === "archivia") {
        archiviati.push(info);
        incluse.push(file);
        continue;
      }
      const prezzo = file.prezzo ?? r.prezzoOnline;
      const serveAggiornamento = file.azione === "riattiva" || file.azione === "esaurito" || r.motivi.some((m) => m !== "testo");
      if (serveAggiornamento) {
        if (prezzo === null) {
          scarta(d, "Prezzo mancante");
          continue;
        }
        aggiornamenti.push({ ...info, azione: file.azione === "riattiva" ? "riattiva" : file.azione === "esaurito" ? "esaurito" : "modifica", pezzi: file.pezzi, prezzo });
      }
      if (file.testo) testi.push({ ...info, sku: d, testo });
      incluse.push(file);
    }
    if (incluse.length === 0) {
      return { ok: false, errore: "Nessuno sku utilizzabile.", scartati };
    }

    const marca = marcaFile();

    const files: FileGenerato[] = [];
    if (prodotti.length > 0) files.push({ tipo: "NUOVI", nome: nomeFileShopify("NUOVI", marca), istruzione: istruzioneShopify("NUOVI"), csv: generaCsvNuovi(prodotti), nSku: prodotti.length });
    if (aggiornamenti.length > 0) files.push({ tipo: "AGGIORNAMENTI", nome: nomeFileShopify("AGGIORNAMENTI", marca), istruzione: istruzioneShopify("AGGIORNAMENTI"), csv: generaCsvAggiornamenti(aggiornamenti), nSku: aggiornamenti.length });
    if (testi.length > 0) files.push({ tipo: "TESTI", nome: nomeFileShopify("TESTI", marca), istruzione: istruzioneShopify("TESTI"), csv: generaCsvTesti(testi), nSku: testi.length });
    if (archiviati.length > 0) files.push({ tipo: "ARCHIVIATI", nome: nomeFileShopify("ARCHIVIATI", marca), istruzione: istruzioneShopify("ARCHIVIATI"), csv: generaCsvArchiviati(archiviati), nSku: archiviati.length });

    await salvaFilePortale(canaleId, files.map((f) => f.nome).join("|"), incluse);
    aggiorna(canaleId);
    return { ok: true, files, inclusi: incluse.length, scartati };
  }
}

// "Ho caricato il file": registra esattamente le righe dell'ultimo file.
export async function confermaFileAction(canaleId: number): Promise<EsitoEsposizione> {
  try {
    const n = await confermaFilePortale(canaleId);
    aggiorna(canaleId);
    if (n === 0) return { ok: false, errore: "Nessun file da confermare: scaricalo di nuovo." };
    return { ok: true, messaggio: `${n} sku registrati come aggiornati sul portale.` };
  } catch (e) {
    return { ok: false, errore: `Conferma non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function scartaFileAction(canaleId: number): Promise<EsitoEsposizione> {
  try {
    await scartaFilePortale(canaleId);
    aggiorna(canaleId);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Portali senza file (eBay, Subito per ora): si fa a mano sul portale e poi
// "Segna come fatto" registra lo stato della tabella.
export async function segnaFattoAction(canaleId: number, skuIds?: number[]): Promise<EsitoEsposizione> {
  try {
    const canale = await getCanaleById(canaleId);
    const righe = righeDaInviare(await getTabellaCanale(canaleId), skuIds)
      .map((r) => rigaFileDa(r, canale?.nome === "Shopify"))
      .filter((r): r is RigaFile => r !== null);
    if (righe.length === 0) return { ok: false, errore: "Niente da registrare." };
    const n = await applicaRighe(canaleId, righe);
    aggiorna(canaleId);
    return { ok: true, messaggio: `${n} sku registrati.` };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Sospendi: pezzi a 0 su piu' sku in un colpo (restano visibili, "Esaurito").
export async function sospendiAction(skuIds: number[], canaleId: number): Promise<EsitoEsposizione> {
  try {
    const ids = skuIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0 || !Number.isInteger(canaleId)) return { ok: false, errore: "Seleziona almeno uno sku." };
    const n = await sospendiSku(ids, canaleId);
    aggiorna(canaleId);
    return { ok: true, messaggio: `${n} sku sospesi (pezzi a 0). Per riprenderli: seleziona e premi "Ripristina valori automatici".` };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// --- Allinea con il portale ----------------------------------------------------
function vociValide(voci: VoceAllineamento[]): VoceAllineamento[] | null {
  if (!Array.isArray(voci) || voci.length === 0 || voci.length > 5000) return null;
  for (const v of voci) {
    if (typeof v?.sku !== "string" || typeof v.idPortale !== "string" || typeof v.attivo !== "boolean") return null;
    if (!Number.isFinite(v.quantita) || (v.prezzo !== null && !Number.isFinite(v.prezzo))) return null;
  }
  return voci;
}

export async function analizzaAllineamentoAction(
  canaleId: number,
  voci: VoceAllineamento[]
): Promise<{ ok: boolean; errore?: string; analisi?: Awaited<ReturnType<typeof analizzaAllineamento>> }> {
  try {
    const v = vociValide(voci);
    if (!v) return { ok: false, errore: "File non valido o vuoto." };
    return { ok: true, analisi: await analizzaAllineamento(canaleId, v) };
  } catch (e) {
    return { ok: false, errore: `Analisi non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function applicaAllineamentoAction(canaleId: number, voci: VoceAllineamento[]): Promise<EsitoEsposizione> {
  try {
    const v = vociValide(voci);
    if (!v) return { ok: false, errore: "File non valido o vuoto." };
    const r = await applicaAllineamento(canaleId, v);
    aggiorna(canaleId);
    return { ok: true, messaggio: `Allineato: ${r.allineati} sku registrati come sul portale, ${r.tolti} tolti dalla vetrina perche' assenti dal portale.` };
  } catch (e) {
    return { ok: false, errore: `Allineamento non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}
