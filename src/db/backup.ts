import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  tipiOggetto,
  proprietari,
  ubicazioni,
  sku,
  fotoSku,
  movimentiMagazzino,
  canali,
  batchPubblicazione,
  batchLotti,
  silenziamentiErrore,
  esposizioneCanale,
  bloccoSkuCanale,
} from "./schema";

// Backup/ripristino MANUALE dei dati dell'app in un file JSON sul Mac.
// Le foto NON sono incluse (sono su Shopify: nel database ci sono solo gli
// indirizzi). Ordine = ordine delle chiavi esterne (prima i padri).
const TABELLE: PgTable[] = [
  tipiOggetto,
  proprietari,
  ubicazioni,
  sku,
  fotoSku,
  movimentiMagazzino,
  canali,
  batchPubblicazione,
  batchLotti,
  silenziamentiErrore,
  esposizioneCanale,
  bloccoSkuCanale,
];

const nomeTabella = (t: PgTable) => getTableConfig(t).name;

export type FileBackup = {
  app: "BATCH_";
  versione: 1;
  creatoIl: string;
  tabelle: Record<string, Record<string, unknown>[]>;
};

export function cartellaBackup(): string {
  return path.join(os.homedir(), "Documents", "BATCH_ backup");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualunque = any;

export async function generaBackup(): Promise<FileBackup> {
  const tabelle: FileBackup["tabelle"] = {};
  for (const t of TABELLE) {
    tabelle[nomeTabella(t)] = (await (db as Qualunque).select().from(t)) as Record<string, unknown>[];
  }
  return { app: "BATCH_", versione: 1, creatoIl: new Date().toISOString(), tabelle };
}

export function nomeFileBackup(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export async function scriviBackupSuDisco(): Promise<{ percorso: string; righe: number }> {
  const dati = await generaBackup();
  const cartella = cartellaBackup();
  fs.mkdirSync(cartella, { recursive: true });
  const percorso = path.join(cartella, nomeFileBackup());
  fs.writeFileSync(percorso, JSON.stringify(dati));
  const righe = Object.values(dati.tabelle).reduce((a, r) => a + r.length, 0);
  return { percorso, righe };
}

export type VoceBackup = { nome: string; dimensione: number; modificato: string };

export function elencaBackup(): VoceBackup[] {
  const cartella = cartellaBackup();
  if (!fs.existsSync(cartella)) return [];
  return fs
    .readdirSync(cartella)
    .filter((n) => /^backup-.*\.json$/.test(n))
    .map((n) => {
      const st = fs.statSync(path.join(cartella, n));
      return { nome: n, dimensione: st.size, modificato: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modificato.localeCompare(a.modificato));
}

export function leggiBackupDaDisco(nome: string): FileBackup {
  if (path.basename(nome) !== nome || !/^backup-.*\.json$/.test(nome)) throw new Error("Nome file non valido.");
  return validaBackup(JSON.parse(fs.readFileSync(path.join(cartellaBackup(), nome), "utf8")));
}

export function leggiBackupDaTesto(testo: string): FileBackup {
  return validaBackup(JSON.parse(testo));
}

function validaBackup(x: unknown): FileBackup {
  const o = x as Partial<FileBackup> | null;
  if (!o || o.app !== "BATCH_" || o.versione !== 1 || typeof o.tabelle !== "object" || o.tabelle === null) {
    throw new Error("Il file non e' un backup di BATCH_.");
  }
  return o as FileBackup;
}

export type AnteprimaRipristino = {
  creatoIl: string;
  tabelle: { nome: string; righeNelBackup: number; righeAdesso: number }[];
};

export async function anteprimaRipristino(b: FileBackup): Promise<AnteprimaRipristino> {
  const tabelle: AnteprimaRipristino["tabelle"] = [];
  for (const t of TABELLE) {
    const n = nomeTabella(t);
    const r = await (db as Qualunque).execute(sql.raw(`select count(*)::int as c from "${n}"`));
    tabelle.push({ nome: n, righeNelBackup: b.tabelle[n]?.length ?? 0, righeAdesso: Number(r.rows[0].c) });
  }
  return { creatoIl: b.creatoIl, tabelle };
}

// Riporta le date (nel JSON sono testo) a oggetti Date per le colonne timestamp.
function rivediRiga(t: PgTable, riga: Record<string, unknown>): Record<string, unknown> {
  const cfg = getTableConfig(t);
  const out: Record<string, unknown> = { ...riga };
  for (const col of cfg.columns) {
    const chiave = Object.keys(t).find((k) => (t as Qualunque)[k] === col);
    if (!chiave) continue;
    const v = out[chiave];
    if (col.dataType === "date" && typeof v === "string") out[chiave] = new Date(v);
  }
  return out;
}

// SOSTITUISCE tutti i dati con quelli del backup, in un'unica transazione:
// se qualcosa va storto non cambia nulla.
export async function ripristinaDaBackup(b: FileBackup): Promise<number> {
  let totale = 0;
  await (db as Qualunque).transaction(async (tx: Qualunque) => {
    for (const t of [...TABELLE].reverse()) await tx.delete(t);
    for (const t of TABELLE) {
      const righe = (b.tabelle[nomeTabella(t)] ?? []).map((r) => rivediRiga(t, r));
      for (let i = 0; i < righe.length; i += 200) {
        await tx.insert(t).values(righe.slice(i, i + 200));
      }
      totale += righe.length;
    }
    for (const t of TABELLE) {
      const cfg = getTableConfig(t);
      if (!cfg.columns.some((c) => c.name === "id" && c.columnType === "PgSerial")) continue;
      const n = cfg.name;
      await tx.execute(
        sql.raw(
          `select setval(pg_get_serial_sequence('"${n}"', 'id'), coalesce((select max(id) from "${n}"), 1), (select max(id) from "${n}") is not null)`
        )
      );
    }
  });
  return totale;
}
