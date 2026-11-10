"use server";

import { getCampiPersonalizzati, impostaCampoInBlocco, impostaValoriSku, ripristinaCampoInBlocco, type PrecedenteCampoBlocco } from "@/db/campi-personalizzati-queries";
import { normalizzaValoreCampo } from "@/lib/campi-personalizzati";
import { prenotaBlocco, prossimoSkuLibero, rilasciaBlocco, getBlocchiConUso } from "@/db/codici-sku-queries";
import { DIMENSIONE_BLOCCO_STANDARD } from "@/lib/codici-sku";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { batchLotti, bloccoSkuCanale, esposizioneCanale, fotoSku, movimentiMagazzino, proprietari, silenziamentiErrore, sku, skuTag, storicoPortale, overridePortale, ubicazioni } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cercaCandidatiDuplicati, getDisponibileSku, getImpegnatoPerSku } from "@/db/queries";
import { CAUSALE_CORREZIONE, CAUSALE_MODIFICA } from "@/lib/giacenza";
import { caricaFotoSuShopify } from "@/lib/shopify";
import type {
  CampoEditabileInline,
  PrecedentiModificaInline,
  ValoreCampoInline,
  VoceModificaInline,
} from "@/lib/campi-inline";

export async function cercaCandidati(query: string) {
  return cercaCandidatiDuplicati(query);
}

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"] as const;
const TIPI_PROPRIETARIO = ["azienda", "soci", "terzo"] as const;

// Risolve proprietario + ubicazione dal form. proprietarioId puo' essere un
// id esistente (attivo) oppure "nuovo": in quel caso crea al volo il
// proprietario (nuovoProprietarioNome/Tipo) e, se creaDepositoPresso e'
// spuntato, il deposito "Presso <nome>" (tipo presso_proprietario) usato
// come ubicazione al posto di quella scelta.
async function risolviProprietarioEUbicazione(
  formData: FormData
): Promise<{ proprietarioId: number; ubicazioneId: number }> {
  const raw = formData.get("proprietarioId")?.toString() ?? "";
  let ubicazioneId = Number(formData.get("ubicazioneId"));
  let proprietarioId: number;

  if (raw === "nuovo") {
    const nome = testoOVuoto(formData.get("nuovoProprietarioNome"));
    if (!nome) throw new Error("Nome del nuovo proprietario obbligatorio");
    const tipoRaw = formData.get("nuovoProprietarioTipo")?.toString() || "terzo";
    if (!TIPI_PROPRIETARIO.includes(tipoRaw as (typeof TIPI_PROPRIETARIO)[number])) {
      throw new Error("Tipo proprietario non valido");
    }
    const creaDeposito = formData.get("creaDepositoPresso") === "on";
    const esito = await db.transaction(async (tx) => {
      const esistente = await tx.query.proprietari.findFirst({ where: eq(proprietari.nome, nome) });
      if (esistente) throw new Error(`Esiste gia' un proprietario "${nome}"`);
      const [p] = await tx
        .insert(proprietari)
        .values({ nome, tipo: tipoRaw, contaValoreAziendale: tipoRaw === "azienda" })
        .returning();
      let ub: number | null = null;
      if (creaDeposito) {
        const nomeDep = `Presso ${nome}`;
        const [d] = await tx
          .insert(ubicazioni)
          .values({ nome: nomeDep, tipo: "presso_proprietario", vendibile: true, fiscale: false, referente: nome })
          .onConflictDoNothing()
          .returning();
        const dep = d ?? (await tx.query.ubicazioni.findFirst({ where: eq(ubicazioni.nome, nomeDep) }));
        ub = dep?.id ?? null;
      }
      return { proprietarioId: p.id, ubicazioneId: ub };
    });
    proprietarioId = esito.proprietarioId;
    if (esito.ubicazioneId) ubicazioneId = esito.ubicazioneId;
  } else {
    proprietarioId = Number(raw);
    if (!proprietarioId) throw new Error("Proprietario non valido");
    const p = await db.query.proprietari.findFirst({ where: eq(proprietari.id, proprietarioId) });
    if (!p || !p.attivo) throw new Error("Proprietario non valido o disattivato");
  }

  if (!ubicazioneId) throw new Error("Ubicazione non valida");
  return { proprietarioId, ubicazioneId };
}

function testoOVuoto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}
function numeroOVuoto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim().replace(",", ".");
  return s.length ? s : null;
}

async function prossimoSkuCode(): Promise<string> {
  return prossimoSkuLibero();
}

export async function creaNuovoSku(formData: FormData) {
  const artista = testoOVuoto(formData.get("artista"));
  const opera = testoOVuoto(formData.get("opera"));
  const quantita = Number(formData.get("quantita"));

  if (!artista || !opera) throw new Error("Artista e opera sono obbligatori");
  if (!Number.isFinite(quantita) || quantita < 0) {
    throw new Error("Quantita' non valida");
  }

  const { proprietarioId, ubicazioneId } = await risolviProprietarioEUbicazione(formData);
  const skuCode = await prossimoSkuCode();
  const condizioneRaw = formData.get("condizione")?.toString() || "A-";
  if (!CONDIZIONI.includes(condizioneRaw as (typeof CONDIZIONI)[number])) {
    throw new Error("Condizione non valida");
  }
  const condizione = condizioneRaw as (typeof CONDIZIONI)[number];

  // Campi personalizzati: validati PRIMA di creare lo sku (un valore sbagliato
  // non lascia uno sku creato a meta').
  const personalizzati: Record<number, unknown> = {};
  for (const [chiave, valore] of formData.entries()) {
    if (chiave.startsWith("cp_") && Number.isInteger(Number(chiave.slice(3)))) {
      personalizzati[Number(chiave.slice(3))] = typeof valore === "string" ? valore : "";
    }
  }
  const campiDef = await getCampiPersonalizzati();
  for (const [id, grezzo] of Object.entries(personalizzati)) {
    const c = campiDef.find((x) => x.id === Number(id));
    if (c) normalizzaValoreCampo(c, grezzo);
  }

  const [nuovo] = await db
    .insert(sku)
    .values({
      skuCode,
      artista,
      opera,
      larghezza: numeroOVuoto(formData.get("larghezza")),
      altezza: numeroOVuoto(formData.get("altezza")),
      supporto: testoOVuoto(formData.get("supporto")),
      anno: testoOVuoto(formData.get("anno")),
      condizione,
      tipoId: Number(formData.get("tipoId")),
      valoreCarico: numeroOVuoto(formData.get("valoreCarico")),
      prezzoEbay: numeroOVuoto(formData.get("prezzoEbay")),
      prezzoCatawiki: numeroOVuoto(formData.get("prezzoCatawiki")),
      riservaCatawiki: numeroOVuoto(formData.get("riservaCatawiki")),
      prezzoShopify: numeroOVuoto(formData.get("prezzoShopify")),
      prezzoSubito: numeroOVuoto(formData.get("prezzoSubito")),
      prezzoBidspirit: numeroOVuoto(formData.get("prezzoBidspirit")),
      riservaBidspirit: numeroOVuoto(formData.get("riservaBidspirit")),
    })
    .returning();

  if (Object.keys(personalizzati).length > 0) await impostaValoriSku(nuovo.id, personalizzati);

  if (quantita > 0) {
    // Casella "Scrivi nel registro": spuntata = carico visibile; tolta =
    // carico nascosto (conta nel totale, non compare nei Movimenti).
    const inRegistro = formData.get("inRegistro") === "on";
    await db.insert(movimentiMagazzino).values({
      skuId: nuovo.id,
      proprietarioId,
      ubicazioneId,
      causale: inRegistro ? "carico" : CAUSALE_CORREZIONE,
      quantitaDelta: quantita,
      note: "Carico iniziale",
    });
  }

  revalidatePath("/");
  redirect(`/magazzino/${nuovo.id}?creato=1`);
}

export async function aggiungiCaricoSkuEsistente(formData: FormData) {
  const skuId = Number(formData.get("skuId"));
  const quantita = Number(formData.get("quantita"));

  if (!skuId) throw new Error("Sku non valido");
  if (!Number.isFinite(quantita) || quantita <= 0) {
    throw new Error("Quantita' non valida");
  }
  const { proprietarioId, ubicazioneId } = await risolviProprietarioEUbicazione(formData);

  await db.insert(movimentiMagazzino).values({
    skuId,
    proprietarioId,
    ubicazioneId,
    causale: formData.get("inRegistro") === "on" ? "carico" : CAUSALE_CORREZIONE,
    quantitaDelta: quantita,
    note: "Carico su sku esistente (da ricerca duplicati)",
  });

  revalidatePath("/");
  redirect(`/magazzino/${skuId}?carico=1`);
}

// Salva UN campo personalizzato di UNO sku (dalla cella in Magazzino). Testo
// vuoto = svuota. Un valore non valido (es. testo in un numero) non salva.
export async function salvaValoreCampoPersonalizzatoAction(skuId: number, campoId: number, valore: string): Promise<{ ok: boolean; errore?: string }> {
  try {
    await impostaValoriSku(skuId, { [campoId]: valore });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

// Modifica in blocco di UN campo personalizzato su piu' sku (valore "" = svuota).
export async function campoPersonalizzatoInBloccoAction(
  skuIds: number[],
  campoId: number,
  valore: string
): Promise<{ ok: boolean; errore?: string; precedenti?: PrecedenteCampoBlocco[] }> {
  try {
    if (!skuIds.length) return { ok: true, precedenti: [] };
    const precedenti = await impostaCampoInBlocco(skuIds, campoId, valore);
    revalidatePath("/");
    return { ok: true, precedenti };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

export async function ripristinaCampoPersonalizzatoInBloccoAction(
  campoId: number,
  precedenti: PrecedenteCampoBlocco[]
): Promise<{ ok: boolean; errore?: string }> {
  try {
    await ripristinaCampoInBlocco(campoId, precedenti);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

export async function modificaSku(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Sku non valido");

  const condizioneRaw = formData.get("condizione")?.toString() || "A-";
  if (!CONDIZIONI.includes(condizioneRaw as (typeof CONDIZIONI)[number])) {
    throw new Error("Condizione non valida");
  }

  // Campi personalizzati (Release 9): input "cp_<id campo>". Validati PRIMA di
  // salvare, cosi' un valore sbagliato non lascia la scheda salvata a meta'.
  const personalizzati: Record<number, unknown> = {};
  for (const [chiave, valore] of formData.entries()) {
    if (chiave.startsWith("cp_") && Number.isInteger(Number(chiave.slice(3)))) {
      personalizzati[Number(chiave.slice(3))] = typeof valore === "string" ? valore : "";
    }
  }
  if (Object.keys(personalizzati).length > 0) await impostaValoriSku(id, personalizzati);

  await db
    .update(sku)
    .set({
      artista: testoOVuoto(formData.get("artista")) ?? "",
      opera: testoOVuoto(formData.get("opera")) ?? "",
      larghezza: numeroOVuoto(formData.get("larghezza")),
      altezza: numeroOVuoto(formData.get("altezza")),
      supporto: testoOVuoto(formData.get("supporto")),
      anno: testoOVuoto(formData.get("anno")),
      condizione: condizioneRaw as (typeof CONDIZIONI)[number],
      tipoId: Number(formData.get("tipoId")),
      // I tag non si salvano da qui (2026-10-30): sono un elenco, vedi Archivi > Tag.
      note: testoOVuoto(formData.get("note")),
      bloccatoVendita: formData.get("bloccatoVendita") === "on",
      valoreCarico: numeroOVuoto(formData.get("valoreCarico")),
      prezzoEbay: numeroOVuoto(formData.get("prezzoEbay")),
      prezzoCatawiki: numeroOVuoto(formData.get("prezzoCatawiki")),
      riservaCatawiki: numeroOVuoto(formData.get("riservaCatawiki")),
      prezzoShopify: numeroOVuoto(formData.get("prezzoShopify")),
      prezzoSubito: numeroOVuoto(formData.get("prezzoSubito")),
      prezzoBidspirit: numeroOVuoto(formData.get("prezzoBidspirit")),
      riservaBidspirit: numeroOVuoto(formData.get("riservaBidspirit")),
      updatedAt: new Date(),
    })
    .where(eq(sku.id, id));

  revalidatePath("/");
  revalidatePath(`/magazzino/${id}`);
  redirect(`/magazzino/${id}?salvato=1`);
}

export async function aggiungiMovimento(formData: FormData) {
  const skuId = Number(formData.get("skuId"));
  const causale = testoOVuoto(formData.get("causale")) ?? "correzione";
  const quantitaDelta = Number(formData.get("quantitaDelta"));
  const note = testoOVuoto(formData.get("note"));

  if (!skuId) throw new Error("Sku non valido");
  if (!Number.isFinite(quantitaDelta) || quantitaDelta === 0) {
    throw new Error("Quantita' non valida");
  }
  const { proprietarioId, ubicazioneId } = await risolviProprietarioEUbicazione(formData);

  await db.insert(movimentiMagazzino).values({
    skuId,
    proprietarioId,
    ubicazioneId,
    causale,
    quantitaDelta,
    note,
  });

  revalidatePath("/");
  revalidatePath(`/magazzino/${skuId}`);
  redirect(`/magazzino/${skuId}?movimento=1`);
}

// Carica UNA foto per volta (2026-10-19). Il client le invia una dopo l'altra
// nell'ordine scelto in anteprima: cosi' l'ordine in galleria e' quello deciso
// dall'utente, un eventuale errore lascia salvate solo le foto precedenti
// (mai buchi nella sequenza) e non si supera il limite di dimensione di una
// singola richiesta. Il nome file NON e' quello originale: lo decide il
// software, SKU_a, SKU_b, ... (stesso schema delle foto gia' su Shopify, es.
// Z-00104_a.jpg). La lettera continua dopo l'ultima gia' usata per questo sku.
// Restituisce un esito (mai eccezioni: in produzione il testo verrebbe
// mascherato).
function lettera(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : String(i + 1);
}

function escapeRegExp(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function estensioneFile(nome: string, mime: string): string {
  const daNome = nome.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(daNome)) return daNome === "jpeg" ? "jpg" : daNome;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function caricaUnaFotoSku(
  formData: FormData
): Promise<{ ok: boolean; errore?: string; nome?: string }> {
  try {
    const skuId = Number(formData.get("skuId"));
    const file = formData.get("foto");
    if (!skuId || !(file instanceof File) || file.size === 0) {
      return { ok: false, errore: "Foto non valida." };
    }

    const [s] = await db.select({ skuCode: sku.skuCode }).from(sku).where(eq(sku.id, skuId));
    if (!s) return { ok: false, errore: "Sku non trovato." };

    const esistenti = await db
      .select({ url: fotoSku.url, ordine: fotoSku.ordine })
      .from(fotoSku)
      .where(eq(fotoSku.skuId, skuId));
    const maxOrdine = esistenti.reduce((m, f) => Math.max(m, f.ordine), -1);

    // Prossima lettera libera: dopo la piu' alta gia' presente nei nomi di
    // questo sku (SKU_a, SKU_b...), altrimenti dopo il numero di foto.
    const re = new RegExp(`${escapeRegExp(s.skuCode)}_([a-z])\\.`, "i");
    let prossima = esistenti.length;
    for (const f of esistenti) {
      const m = re.exec(f.url);
      if (m) prossima = Math.max(prossima, m[1].toLowerCase().charCodeAt(0) - 97 + 1);
    }
    const nome = `${s.skuCode}_${lettera(prossima)}.${estensioneFile(file.name, file.type)}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await caricaFotoSuShopify(bytes, nome, file.type || "image/jpeg");
    await db.insert(fotoSku).values({ skuId, url, ordine: maxOrdine + 1 });

    revalidatePath(`/magazzino/${skuId}`);
    return { ok: true, nome };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Caricamento non riuscito." };
  }
}

export async function eliminaFotoSku(formData: FormData) {
  const fotoId = Number(formData.get("fotoId"));
  const skuId = Number(formData.get("skuId"));
  if (!fotoId || !skuId) throw new Error("Riferimento foto non valido");

  await db.delete(fotoSku).where(eq(fotoSku.id, fotoId));

  revalidatePath(`/magazzino/${skuId}`);
  redirect(`/magazzino/${skuId}?fotoeliminata=1`);
}

// Sposta una foto su/giu' nella galleria scambiando l'ordine con la foto
// adiacente - cambia la copertina (ordine=0) senza cancellare/ricaricare.
export async function spostaFotoSku(formData: FormData) {
  const fotoId = Number(formData.get("fotoId"));
  const skuId = Number(formData.get("skuId"));
  const direzione = formData.get("direzione")?.toString();
  if (!fotoId || !skuId || (direzione !== "su" && direzione !== "giu")) {
    throw new Error("Parametri non validi");
  }

  const foto = await db
    .select({ id: fotoSku.id, ordine: fotoSku.ordine })
    .from(fotoSku)
    .where(eq(fotoSku.skuId, skuId))
    .orderBy(asc(fotoSku.ordine));

  const indice = foto.findIndex((f) => f.id === fotoId);
  if (indice < 0) throw new Error("Foto non trovata");

  const indiceVicino = direzione === "su" ? indice - 1 : indice + 1;
  if (indiceVicino >= 0 && indiceVicino < foto.length) {
    const corrente = foto[indice];
    const vicino = foto[indiceVicino];
    await db.transaction(async (tx) => {
      await tx.update(fotoSku).set({ ordine: vicino.ordine }).where(eq(fotoSku.id, corrente.id));
      await tx.update(fotoSku).set({ ordine: corrente.ordine }).where(eq(fotoSku.id, vicino.id));
    });
  }

  revalidatePath(`/magazzino/${skuId}`);
}

// --- Editing inline da tabella Magazzino (2026-09-23) -------------------
// Un solo campo puo' non bastare per una voce (es. "misura" tocca
// larghezza+altezza insieme): ogni voce porta un id + una mappa parziale
// campo->valore. Stesso meccanismo serve sia per il salvataggio (singola
// cella o applicazione in blocco su piu' righe selezionate) sia per
// l'annulla-ultima-modifica: il chiamante rimanda indietro i "precedenti"
// gia' restituiti da questa stessa funzione, senza dover ricalcolare nulla.
// CAMPI_EDITABILI_INLINE e i tipi associati vivono in @/lib/campi-inline
// (un file "use server" puo' esportare solo funzioni async).

const COLONNE_SKU_INLINE = {
  artista: sku.artista,
  opera: sku.opera,
  larghezza: sku.larghezza,
  altezza: sku.altezza,
  supporto: sku.supporto,
  anno: sku.anno,
  tipoId: sku.tipoId,
  condizione: sku.condizione,
  tag: sku.tag,
  note: sku.note,
  bloccatoVendita: sku.bloccatoVendita,
  valoreCarico: sku.valoreCarico,
  prezzoEbay: sku.prezzoEbay,
  prezzoCatawiki: sku.prezzoCatawiki,
  riservaCatawiki: sku.riservaCatawiki,
  prezzoShopify: sku.prezzoShopify,
  prezzoSubito: sku.prezzoSubito,
  prezzoBidspirit: sku.prezzoBidspirit,
  riservaBidspirit: sku.riservaBidspirit,
} as const;

function validaCampoInline(campo: CampoEditabileInline, valore: ValoreCampoInline): ValoreCampoInline {
  switch (campo) {
    case "artista":
    case "opera": {
      const v = testoOVuoto(valore as string);
      if (!v) throw new Error(campo === "artista" ? "Artista non puo' essere vuoto" : "Opera non puo' essere vuota");
      return v;
    }
    case "supporto":
    case "anno":
    case "tag":
    case "note":
      return testoOVuoto(valore as string);
    case "larghezza":
    case "altezza":
    case "valoreCarico":
    case "prezzoEbay":
    case "prezzoCatawiki":
    case "riservaCatawiki":
    case "prezzoShopify":
    case "prezzoSubito":
    case "prezzoBidspirit":
    case "riservaBidspirit":
      return numeroOVuoto(valore as string);
    case "condizione": {
      const v = (valore ?? "").toString();
      if (!CONDIZIONI.includes(v as (typeof CONDIZIONI)[number])) throw new Error("Condizione non valida");
      return v;
    }
    case "tipoId": {
      const n = Number(valore);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Tipo non valido");
      return n;
    }
    case "bloccatoVendita":
      return Boolean(valore);
  }
}

export async function aggiornaCampiSkuInline(
  voci: VoceModificaInline[]
): Promise<{ precedenti: PrecedentiModificaInline[] }> {
  if (!voci.length) return { precedenti: [] };

  const precedenti = await db.transaction(async (tx) => {
    const risultato: PrecedentiModificaInline[] = [];
    for (const voce of voci) {
      const campiRichiesti = Object.keys(voce.campi) as CampoEditabileInline[];
      if (!campiRichiesti.length) continue;

      const campiValidati: Partial<Record<CampoEditabileInline, ValoreCampoInline>> = {};
      for (const campo of campiRichiesti) {
        campiValidati[campo] = validaCampoInline(campo, voce.campi[campo] ?? null);
      }

      const selezione = Object.fromEntries(campiRichiesti.map((c) => [c, COLONNE_SKU_INLINE[c]]));
      const [prima] = await tx.select(selezione).from(sku).where(eq(sku.id, voce.id));
      if (!prima) throw new Error(`Sku ${voce.id} non trovato`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.update(sku).set({ ...(campiValidati as any), updatedAt: new Date() }).where(eq(sku.id, voce.id));

      risultato.push({ id: voce.id, campi: prima as Partial<Record<CampoEditabileInline, ValoreCampoInline>> });
    }
    return risultato;
  });

  revalidatePath("/");
  return { precedenti };
}

export async function eliminaSku(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Sku non valido");

  await db.transaction(async (tx) => {
    await tx.delete(fotoSku).where(eq(fotoSku.skuId, id));
    await tx.delete(skuTag).where(eq(skuTag.skuId, id));
    await tx.delete(silenziamentiErrore).where(eq(silenziamentiErrore.skuId, id));
    await tx.delete(storicoPortale).where(eq(storicoPortale.skuId, id));
    await tx.delete(overridePortale).where(eq(overridePortale.skuId, id));
    await tx.delete(esposizioneCanale).where(eq(esposizioneCanale.skuId, id));
    await tx.delete(bloccoSkuCanale).where(eq(bloccoSkuCanale.skuId, id));
    await tx.delete(movimentiMagazzino).where(eq(movimentiMagazzino.skuId, id));
    await tx.delete(sku).where(eq(sku.id, id));
  });

  revalidatePath("/");
  redirect("/?skueliminato=1");
}


// --- Eliminazione MULTIPLA di sku (Release 10, 2026-11-10) ----------------
// Due passi: anteprima (cosa si puo' eliminare e cosa no, con il motivo) e
// conferma. Uno sku inserito in un batch NON si elimina (prima va tolto dal
// batch). Prima di cancellare si scrive un backup su disco.
export type VoceAnteprimaEliminazione = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  foto: number;
  movimenti: number;
  pezzi: number;
  eliminabile: boolean;
  motivo?: string;
};

export async function anteprimaEliminaSku(skuIds: number[]): Promise<{ ok: boolean; errore?: string; voci: VoceAnteprimaEliminazione[] }> {
  try {
    if (!skuIds.length) return { ok: false, errore: "Nessuno sku selezionato", voci: [] };
    const righe = await db.select({ id: sku.id, skuCode: sku.skuCode, artista: sku.artista, opera: sku.opera }).from(sku).where(inArray(sku.id, skuIds));
    const foto = await db.select({ skuId: fotoSku.skuId, n: sql<number>`count(*)::int` }).from(fotoSku).where(inArray(fotoSku.skuId, skuIds)).groupBy(fotoSku.skuId);
    const mov = await db
      .select({ skuId: movimentiMagazzino.skuId, n: sql<number>`count(*)::int`, pezzi: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}),0)::int` })
      .from(movimentiMagazzino)
      .where(inArray(movimentiMagazzino.skuId, skuIds))
      .groupBy(movimentiMagazzino.skuId);
    const lotti = await db.select({ skuId: batchLotti.skuId, n: sql<number>`count(*)::int` }).from(batchLotti).where(inArray(batchLotti.skuId, skuIds)).groupBy(batchLotti.skuId);
    const mf = new Map(foto.map((r) => [r.skuId, r.n]));
    const mm = new Map(mov.map((r) => [r.skuId, r]));
    const ml = new Map(lotti.map((r) => [r.skuId, r.n]));
    const voci: VoceAnteprimaEliminazione[] = righe
      .map((r) => {
        const nl = ml.get(r.id) ?? 0;
        return {
          id: r.id,
          skuCode: r.skuCode,
          artista: r.artista,
          opera: r.opera,
          foto: mf.get(r.id) ?? 0,
          movimenti: mm.get(r.id)?.n ?? 0,
          pezzi: mm.get(r.id)?.pezzi ?? 0,
          eliminabile: nl === 0,
          motivo: nl > 0 ? `E' in ${nl} ${nl === 1 ? "batch" : "batch"}: toglilo prima dal batch` : undefined,
        };
      })
      .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
    return { ok: true, voci };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto", voci: [] };
  }
}

export async function eliminaSkuMultipli(skuIds: number[]): Promise<{ ok: boolean; errore?: string; eliminati: number; saltati: number; backup?: string }> {
  try {
    const ant = await anteprimaEliminaSku(skuIds);
    if (!ant.ok) return { ok: false, errore: ant.errore, eliminati: 0, saltati: 0 };
    const ids = ant.voci.filter((v) => v.eliminabile).map((v) => v.id);
    const saltati = ant.voci.length - ids.length;
    if (!ids.length) return { ok: false, errore: "Nessuno sku eliminabile fra quelli scelti", eliminati: 0, saltati };
    const { scriviBackupSuDisco } = await import("@/db/backup");
    const b = await scriviBackupSuDisco();
    await db.transaction(async (tx) => {
      await tx.delete(fotoSku).where(inArray(fotoSku.skuId, ids));
      await tx.delete(skuTag).where(inArray(skuTag.skuId, ids));
      await tx.delete(silenziamentiErrore).where(inArray(silenziamentiErrore.skuId, ids));
      await tx.delete(storicoPortale).where(inArray(storicoPortale.skuId, ids));
      await tx.delete(overridePortale).where(inArray(overridePortale.skuId, ids));
      await tx.delete(esposizioneCanale).where(inArray(esposizioneCanale.skuId, ids));
      await tx.delete(bloccoSkuCanale).where(inArray(bloccoSkuCanale.skuId, ids));
      await tx.delete(movimentiMagazzino).where(inArray(movimentiMagazzino.skuId, ids));
      await tx.delete(sku).where(inArray(sku.id, ids));
    });
    revalidatePath("/");
    return { ok: true, eliminati: ids.length, saltati, backup: b.percorso };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto", eliminati: 0, saltati: 0 };
  }
}

// --- Spostamenti fra depositi (Release 2) ---------------------------------
// Uno spostamento e' SEMPRE una coppia di movimenti (uscita dal deposito di
// origine + entrata in quello di destinazione, stesso proprietario): la
// quantita' totale dello sku non cambia mai. Esiti restituiti come oggetto
// (mai eccezioni) perche' in produzione Next maschera il testo degli errori.
export type EsitoSpostamento = {
  ok: boolean;
  errore?: string;
  messaggio?: string;
  avviso?: string;
  // Movimenti scritti: servono ad "Annulla" per cancellarli.
  movimentoIds?: number[];
  // Solo spostamento in blocco: movimenti scritti per ogni sku.
  movimentiPerSku?: { skuId: number; ids: number[] }[];
};

// Dal Magazzino: sposta TUTTI i pezzi degli sku selezionati nel deposito
// scelto, mantenendo il proprietario. I pezzi che si trovano in una casa
// d'asta restano dove sono (si muovono solo con Consegna/Rientro dal batch,
// o dalla scheda sku).
export async function spostaSkuInDeposito(
  skuIds: number[],
  destinazioneId: number,
  inRegistro: boolean = true
): Promise<EsitoSpostamento> {
  try {
    if (!skuIds.length) return { ok: false, errore: "Nessuno sku selezionato" };
    const dest = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, destinazioneId) });
    if (!dest || !dest.attivo) return { ok: false, errore: "Deposito di destinazione non valido o disattivato" };
    if (dest.tipo === "asta_fisica") {
      return { ok: false, errore: "Per portare i pezzi a una casa d'asta usa Consegna dal batch" };
    }

    const saldi = await db
      .select({
        skuId: movimentiMagazzino.skuId,
        proprietarioId: movimentiMagazzino.proprietarioId,
        ubicazioneId: movimentiMagazzino.ubicazioneId,
        tipoUbicazione: ubicazioni.tipo,
        saldo: sql<number>`sum(${movimentiMagazzino.quantitaDelta})`.mapWith(Number),
      })
      .from(movimentiMagazzino)
      .innerJoin(ubicazioni, eq(movimentiMagazzino.ubicazioneId, ubicazioni.id))
      .where(inArray(movimentiMagazzino.skuId, skuIds))
      .groupBy(
        movimentiMagazzino.skuId,
        movimentiMagazzino.proprietarioId,
        movimentiMagazzino.ubicazioneId,
        ubicazioni.tipo
      )
      .having(sql`sum(${movimentiMagazzino.quantitaDelta}) > 0`);

    const daSpostare = saldi.filter((x) => x.ubicazioneId !== destinazioneId && x.tipoUbicazione !== "asta_fisica");
    const pezziInAsta = saldi
      .filter((x) => x.tipoUbicazione === "asta_fisica")
      .reduce((tot, x) => tot + x.saldo, 0);

    const movimentiPerSku = new Map<number, number[]>();
    if (daSpostare.length > 0) {
      await db.transaction(async (tx) => {
        for (const x of daSpostare) {
          const nota = `Spostamento in blocco da Magazzino verso ${dest.nome}`;
          const causale = inRegistro ? "spostamento" : CAUSALE_CORREZIONE;
          const scritti = await tx
            .insert(movimentiMagazzino)
            .values([
              { skuId: x.skuId, proprietarioId: x.proprietarioId, ubicazioneId: x.ubicazioneId, causale, quantitaDelta: -x.saldo, note: nota },
              { skuId: x.skuId, proprietarioId: x.proprietarioId, ubicazioneId: destinazioneId, causale, quantitaDelta: x.saldo, note: nota },
            ])
            .returning();
          movimentiPerSku.set(x.skuId, [...(movimentiPerSku.get(x.skuId) ?? []), ...scritti.map((m) => m.id)]);
        }
      });
    }

    revalidatePath("/");
    const skuMossi = new Set(daSpostare.map((x) => x.skuId)).size;
    const pezziMossi = daSpostare.reduce((tot, x) => tot + x.saldo, 0);
    let messaggio =
      skuMossi > 0
        ? `Spostati ${pezziMossi} pezzi di ${skuMossi} sku in "${dest.nome}".`
        : `Nessun pezzo da spostare: erano gia' tutti in "${dest.nome}" o in una casa d'asta.`;
    if (pezziInAsta > 0) messaggio += ` ${pezziInAsta} pezzi in case d'asta sono rimasti dove sono.`;
    return {
      ok: true,
      messaggio,
      movimentiPerSku: Array.from(movimentiPerSku, ([skuId, ids]) => ({ skuId, ids })),
    };
  } catch (e) {
    return { ok: false, errore: `Spostamento non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Sposta `quantita` pezzi da (proprietario, deposito) a (proprietario, deposito)
// scelti. Puo' cambiare il deposito, il proprietario o entrambi; non tocca
// mai il valore di carico dello sku. Anche da una casa d'asta, mai verso una.
export async function spostaGiacenza(dati: {
  skuId: number;
  proprietarioId: number;
  daUbicazioneId: number;
  aUbicazioneId: number;
  aProprietarioId?: number;
  quantita: number;
  inRegistro?: boolean;
}): Promise<EsitoSpostamento> {
  try {
    const { skuId, proprietarioId, daUbicazioneId, aUbicazioneId } = dati;
    const aProprietarioId = dati.aProprietarioId ?? proprietarioId;
    const quantita = Math.trunc(Number(dati.quantita));
    if (!skuId || !proprietarioId || !daUbicazioneId || !aUbicazioneId) return { ok: false, errore: "Dati non validi" };
    if (!Number.isFinite(quantita) || quantita <= 0) return { ok: false, errore: "Quantita' non valida" };
    if (daUbicazioneId === aUbicazioneId && proprietarioId === aProprietarioId) {
      return { ok: false, errore: "Scegli un deposito o un proprietario diverso" };
    }

    const dest = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, aUbicazioneId) });
    const orig = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, daUbicazioneId) });
    if (!dest || !orig) return { ok: false, errore: "Deposito non valido" };
    if (dest.id !== orig.id && !dest.attivo) return { ok: false, errore: "Il deposito di destinazione e' disattivato" };
    if (dest.tipo === "asta_fisica" && dest.id !== orig.id) {
      return { ok: false, errore: "Per portare i pezzi a una casa d'asta usa Consegna dal batch" };
    }
    const nuovoProp = await db.query.proprietari.findFirst({ where: eq(proprietari.id, aProprietarioId) });
    if (!nuovoProp || (aProprietarioId !== proprietarioId && !nuovoProp.attivo)) {
      return { ok: false, errore: "Proprietario di destinazione non valido o disattivato" };
    }
    const vecchioProp = await db.query.proprietari.findFirst({ where: eq(proprietari.id, proprietarioId) });

    const [{ saldo }] = await db
      .select({ saldo: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number) })
      .from(movimentiMagazzino)
      .where(
        and(
          eq(movimentiMagazzino.skuId, skuId),
          eq(movimentiMagazzino.proprietarioId, proprietarioId),
          eq(movimentiMagazzino.ubicazioneId, daUbicazioneId)
        )
      );
    if (quantita > saldo) return { ok: false, errore: `Qui ci sono solo ${saldo} pezzi` };

    const parti: string[] = [];
    if (orig.id !== dest.id) parti.push(`da ${orig.nome} a ${dest.nome}`);
    if (proprietarioId !== aProprietarioId) parti.push(`da ${vecchioProp?.nome ?? "?"} a ${nuovoProp.nome}`);
    const nota = `Spostamento ${parti.join(", ")}`;

    const causale = dati.inRegistro === false ? CAUSALE_CORREZIONE : "spostamento";
    const scritti = await db.transaction(async (tx) =>
      tx
        .insert(movimentiMagazzino)
        .values([
          { skuId, proprietarioId, ubicazioneId: daUbicazioneId, causale, quantitaDelta: -quantita, note: nota },
          { skuId, proprietarioId: aProprietarioId, ubicazioneId: aUbicazioneId, causale, quantitaDelta: quantita, note: nota },
        ])
        .returning()
    );

    revalidatePath("/");
    revalidatePath(`/magazzino/${skuId}`);
    return { ok: true, messaggio: `Spostati ${quantita} pezzi (${parti.join(", ")}).`, movimentoIds: scritti.map((x) => x.id) };
  } catch (e) {
    return { ok: false, errore: `Spostamento non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Scrive il numero giusto: imposta a `nuovaQuantita` i pezzi di un
// proprietario in un deposito scrivendo UN movimento (la differenza), che
// compare nel registro se inRegistro (default) e resta nascosto altrimenti. Mai un numero sovrascritto: il totale resta la somma dei
// movimenti. Bloccata sulle case d'asta (li' i pezzi si muovono con Consegna/
// Rientro/Sposta). Sotto l'impegnato dei batch NON blocca: avvisa.
export async function correggiQuantita(dati: {
  skuId: number;
  proprietarioId: number;
  ubicazioneId: number;
  nuovaQuantita: number;
  inRegistro?: boolean;
  nota?: string;
}): Promise<EsitoSpostamento> {
  try {
    const { skuId, proprietarioId, ubicazioneId } = dati;
    const nuova = Number(dati.nuovaQuantita);
    if (!skuId || !proprietarioId || !ubicazioneId) return { ok: false, errore: "Dati non validi" };
    if (!Number.isInteger(nuova) || nuova < 0) return { ok: false, errore: "Scrivi un numero intero, zero o maggiore" };

    const ub = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, ubicazioneId) });
    if (!ub) return { ok: false, errore: "Deposito non valido" };
    if (ub.tipo === "asta_fisica") {
      return { ok: false, errore: "In una casa d'asta il numero non si corregge a mano: usa Sposta o Rientro" };
    }
    const prop = await db.query.proprietari.findFirst({ where: eq(proprietari.id, proprietarioId) });
    if (!prop) return { ok: false, errore: "Proprietario non valido" };

    const [{ saldo }] = await db
      .select({ saldo: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number) })
      .from(movimentiMagazzino)
      .where(
        and(
          eq(movimentiMagazzino.skuId, skuId),
          eq(movimentiMagazzino.proprietarioId, proprietarioId),
          eq(movimentiMagazzino.ubicazioneId, ubicazioneId)
        )
      );
    const delta = nuova - saldo;
    if (delta === 0) return { ok: true, messaggio: "Nessuna modifica" , movimentoIds: [] };

    const [scritto] = await db
      .insert(movimentiMagazzino)
      .values({
        skuId,
        proprietarioId,
        ubicazioneId,
        causale: dati.inRegistro === false ? CAUSALE_CORREZIONE : CAUSALE_MODIFICA,
        quantitaDelta: delta,
        note: dati.nota ?? `Quantita' portata da ${saldo} a ${nuova}`,
      })
      .returning();

    let avviso: string | undefined;
    const [totale, impegnato] = await Promise.all([getDisponibileSku(skuId), getImpegnatoPerSku(skuId)]);
    if (totale < impegnato) {
      avviso = `Attenzione: ora ci sono ${totale} pezzi ma ${impegnato} risultano impegnati in batch.`;
    }

    revalidatePath("/");
    revalidatePath(`/magazzino/${skuId}`);
    return { ok: true, messaggio: `Quantita' portata a ${nuova}.`, avviso, movimentoIds: [scritto.id] };
  } catch (e) {
    return { ok: false, errore: `Correzione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Annulla = cancella i movimenti scritti per ultimi su quello sku. Rifiuta se
// nel frattempo e' arrivato un altro movimento (qualcosa e' stato scritto
// dopo): in quel caso cancellare lascerebbe i conti incoerenti.
export async function annullaMovimenti(skuId: number, ids: number[]): Promise<{ ok: boolean; errore?: string }> {
  try {
    if (!skuId || !ids.length) return { ok: false, errore: "Niente da annullare" };
    const esito = await db.transaction(async (tx) => {
      const [{ maxId }] = await tx
        .select({ maxId: sql<number>`coalesce(max(${movimentiMagazzino.id}), 0)`.mapWith(Number) })
        .from(movimentiMagazzino)
        .where(eq(movimentiMagazzino.skuId, skuId));
      if (maxId > Math.max(...ids)) {
        return { ok: false as const, errore: "Dopo quell'operazione e' arrivato un altro movimento: non si puo' piu' annullare." };
      }
      await tx.delete(movimentiMagazzino).where(and(eq(movimentiMagazzino.skuId, skuId), inArray(movimentiMagazzino.id, ids)));
      return { ok: true as const };
    });
    if (esito.ok) {
      revalidatePath("/");
      revalidatePath(`/magazzino/${skuId}`);
    }
    return esito;
  } catch (e) {
    return { ok: false, errore: `Annulla non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// "Non scrivere nel registro" dopo l'operazione: rende nascosti i movimenti
// appena scritti (modifica quantita' o spostamento). Il totale non cambia.
export async function togliDalRegistro(skuId: number, ids: number[]): Promise<{ ok: boolean; errore?: string }> {
  try {
    if (!skuId || !ids.length) return { ok: false, errore: "Niente da modificare" };
    await db
      .update(movimentiMagazzino)
      .set({ causale: CAUSALE_CORREZIONE })
      .where(
        and(
          eq(movimentiMagazzino.skuId, skuId),
          inArray(movimentiMagazzino.id, ids),
          inArray(movimentiMagazzino.causale, [CAUSALE_MODIFICA, "spostamento"])
        )
      );
    revalidatePath("/");
    revalidatePath(`/magazzino/${skuId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Operazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Annulla di uno spostamento in blocco: cancella i movimenti scritti su tutti
// gli sku coinvolti, ma solo se per nessuno e' arrivato nel frattempo un altro
// movimento. Tutto o niente.
export async function annullaMovimentiMultipli(
  gruppi: { skuId: number; ids: number[] }[]
): Promise<{ ok: boolean; errore?: string }> {
  try {
    if (!gruppi.length) return { ok: false, errore: "Niente da annullare" };
    const esito = await db.transaction(async (tx) => {
      for (const g of gruppi) {
        const [{ maxId }] = await tx
          .select({ maxId: sql<number>`coalesce(max(${movimentiMagazzino.id}), 0)`.mapWith(Number) })
          .from(movimentiMagazzino)
          .where(eq(movimentiMagazzino.skuId, g.skuId));
        if (maxId > Math.max(...g.ids)) {
          return { ok: false as const, errore: "Su almeno uno sku e' arrivato un altro movimento dopo lo spostamento: non si puo' piu' annullare." };
        }
      }
      for (const g of gruppi) {
        await tx.delete(movimentiMagazzino).where(and(eq(movimentiMagazzino.skuId, g.skuId), inArray(movimentiMagazzino.id, g.ids)));
      }
      return { ok: true as const };
    });
    if (esito.ok) revalidatePath("/");
    return esito;
  } catch (e) {
    return { ok: false, errore: `Annulla non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}


// --- Codici sku: prossimo libero e blocchi prenotati (Release 10) ----------
export async function getStatoCodiciSku() {
  const [prossimo, blocchi] = await Promise.all([prossimoSkuLibero(), getBlocchiConUso()]);
  return { prossimo, blocchi };
}

export async function prenotaCodiciAction(quanti: number): Promise<{ ok: boolean; errore?: string; da?: string; a?: string }> {
  try {
    const n = Math.floor(Number(quanti) || DIMENSIONE_BLOCCO_STANDARD);
    if (n < 1 || n > 500) return { ok: false, errore: "Scegli da 1 a 500 codici" };
    const b = await prenotaBlocco(n);
    revalidatePath("/");
    return { ok: true, da: `Z-${String(b.da).padStart(5, "0")}`, a: `Z-${String(b.a).padStart(5, "0")}` };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}

export async function rilasciaCodiciAction(id: string): Promise<{ ok: boolean; errore?: string }> {
  try {
    await rilasciaBlocco(id);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto" };
  }
}


// --- Regola dei tre valori: "Ripristina valore da Excel" (Release 10) -------
const CAMPI_RIPRISTINABILI = ["artista", "opera", "larghezza", "altezza", "supporto", "anno", "note", "valoreCarico", "prezzoEbay", "prezzoCatawiki", "riservaCatawiki"] as const;

export async function ripristinaDaExcelAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const campo = String(formData.get("campo") ?? "");
  if (!id || !(CAMPI_RIPRISTINABILI as readonly string[]).includes(campo)) throw new Error("Richiesta non valida");
  const riga = await db.query.sku.findFirst({ where: eq(sku.id, id) });
  const valoriExcel = (riga?.valoriExcel ?? {}) as Record<string, string>;
  const valore = valoriExcel[campo];
  if (!riga || valore === undefined) throw new Error("Nessun valore da Excel per questo campo");
  await db
    .update(sku)
    .set({ [campo]: valore, updatedAt: new Date() })
    .where(eq(sku.id, id));
  revalidatePath(`/magazzino/${id}`);
  revalidatePath("/");
  redirect(`/magazzino/${id}?salvato=1`);
}
