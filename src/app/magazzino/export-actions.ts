"use server";

// Esporta dal Magazzino (Release 12): azione che costruisce il file e azioni
// per i modelli salvati (es. "Inventario FP"). I modelli stanno in
// impostazioni_app (chiave "modelli_export_magazzino"), come le regole prezzi.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { impostazioniApp } from "@/db/schema";
import { getFotoPerSkuIds, getMagazzino } from "@/db/queries";
import { getCampiPersonalizzati } from "@/db/campi-personalizzati-queries";
import {
  catalogoColonne,
  colonneScelte,
  costruisciCsv,
  costruisciRighe,
  costruisciXlsx,
  nomeFileExport,
  type ModelloExport,
  type OpzioniExport,
} from "@/lib/export-magazzino";
import { costruisciPdf } from "@/lib/export-magazzino-pdf";

const CHIAVE_MODELLI = "modelli_export_magazzino";

export async function esportaMagazzinoAction(
  o: OpzioniExport
): Promise<{ ok: true; base64: string; filename: string; mime: string; righe: number; senzaMiniatura: number } | { ok: false; errore: string }> {
  try {
    if (o.colonne.length === 0) return { ok: false, errore: "Scegli almeno una colonna." };
    const tutti = await getMagazzino({});
    const ids = new Set(o.skuIds);
    const scelti = o.ambito === "tutto" ? tutti : tutti.filter((r) => ids.has(r.id));
    if (scelti.length === 0) return { ok: false, errore: "Nessuno sku da esportare." };

    const fotoMappa = await getFotoPerSkuIds(scelti.map((r) => r.id));
    const foto = new Map<number, string[]>();
    for (const [id, f] of fotoMappa) foto.set(id, f.map((x) => x.url));

    const righe = costruisciRighe(scelti, foto, { soloConPezzi: o.soloConPezzi, proprietarioId: o.proprietarioId, giacenza: o.giacenza });
    if (righe.length === 0) return { ok: false, errore: "Con queste scelte non resta nessuna riga (controlla \"solo con pezzi\" e il proprietario)." };

    const catalogo = catalogoColonne(await getCampiPersonalizzati());
    const cols = colonneScelte(catalogo, o.colonne);
    if (cols.length === 0) return { ok: false, errore: "Le colonne scelte non esistono piu'." };

    const filename = nomeFileExport(o.formato);
    if (o.formato === "xlsx") {
      const buf = costruisciXlsx(cols, righe, o.titolo, o.conData);
      return { ok: true, base64: buf.toString("base64"), filename, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", righe: righe.length, senzaMiniatura: 0 };
    }
    if (o.formato === "csv") {
      const csv = costruisciCsv(cols, righe, o.titolo, o.conData);
      return { ok: true, base64: Buffer.from(csv, "utf8").toString("base64"), filename, mime: "text/csv;charset=utf-8", righe: righe.length, senzaMiniatura: 0 };
    }
    const pdf = await costruisciPdf(cols, righe, o.titolo, o.conData, o.pdfFoto);
    return { ok: true, base64: Buffer.from(pdf.bytes).toString("base64"), filename, mime: "application/pdf", righe: righe.length, senzaMiniatura: pdf.senzaMiniatura };
  } catch (e) {
    return { ok: false, errore: `Esportazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// Modelli di fabbrica: "Inventario FP" = tutto cio' che e' di FP ed esiste.
export async function leggiModelliExportAction(): Promise<ModelloExport[]> {
  try {
    const riga = await db.query.impostazioniApp.findFirst({ where: eq(impostazioniApp.chiave, CHIAVE_MODELLI) });
    const v = riga?.valore;
    return Array.isArray(v) ? (v as ModelloExport[]) : [];
  } catch {
    return [];
  }
}

async function scriviModelli(modelli: ModelloExport[]) {
  await db
    .insert(impostazioniApp)
    .values({ chiave: CHIAVE_MODELLI, valore: modelli })
    .onConflictDoUpdate({ target: impostazioniApp.chiave, set: { valore: modelli, updatedAt: new Date() } });
}

export async function salvaModelloExportAction(modello: ModelloExport): Promise<{ ok: boolean; errore?: string }> {
  try {
    const nome = modello.nome.trim();
    if (!nome) return { ok: false, errore: "Dai un nome al modello." };
    const esistenti = await leggiModelliExportAction();
    const altri = esistenti.filter((m) => m.nome.toLowerCase() !== nome.toLowerCase());
    await scriviModelli([...altri, { ...modello, nome }]);
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function eliminaModelloExportAction(nome: string): Promise<{ ok: boolean; errore?: string }> {
  try {
    const esistenti = await leggiModelliExportAction();
    await scriviModelli(esistenti.filter((m) => m.nome !== nome));
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}
