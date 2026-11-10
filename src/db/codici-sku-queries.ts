import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { impostazioniApp, sku } from "@/db/schema";
import {
  CHIAVE_CODICI_PRENOTATI,
  formattaCodice,
  nuovoBlocco,
  normalizzaBlocchi,
  primoNumeroLibero,
  type BloccoPrenotato,
} from "@/lib/codici-sku";

export async function getMaxNumeroSku(): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(cast(substring(${sku.skuCode} from 3) as integer)), 0)`.mapWith(Number) })
    .from(sku)
    .where(sql`${sku.skuCode} ~ '^Z-[0-9]+$'`);
  return max ?? 0;
}

export async function getBlocchiPrenotati(): Promise<BloccoPrenotato[]> {
  try {
    const riga = await db.query.impostazioniApp.findFirst({ where: eq(impostazioniApp.chiave, CHIAVE_CODICI_PRENOTATI) });
    return normalizzaBlocchi(riga?.valore);
  } catch {
    return [];
  }
}

async function salvaBlocchi(blocchi: BloccoPrenotato[]) {
  const valore = { blocchi };
  await db
    .insert(impostazioniApp)
    .values({ chiave: CHIAVE_CODICI_PRENOTATI, valore })
    .onConflictDoUpdate({ target: impostazioniApp.chiave, set: { valore, updatedAt: new Date() } });
}

export async function prossimoSkuLibero(): Promise<string> {
  const [max, blocchi] = await Promise.all([getMaxNumeroSku(), getBlocchiPrenotati()]);
  return formattaCodice(primoNumeroLibero(max, blocchi));
}

export async function prenotaBlocco(quanti: number): Promise<BloccoPrenotato> {
  const [max, blocchi] = await Promise.all([getMaxNumeroSku(), getBlocchiPrenotati()]);
  const b = nuovoBlocco(max, blocchi, quanti);
  await salvaBlocchi([...blocchi, b]);
  return b;
}

export async function rilasciaBlocco(id: string): Promise<void> {
  const blocchi = await getBlocchiPrenotati();
  await salvaBlocchi(blocchi.filter((b) => b.id !== id));
}

// Per ogni blocco: quanti codici sono gia' diventati sku.
export async function getBlocchiConUso(): Promise<(BloccoPrenotato & { usati: number })[]> {
  const blocchi = await getBlocchiPrenotati();
  const out: (BloccoPrenotato & { usati: number })[] = [];
  for (const b of blocchi) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sku)
      .where(sql`${sku.skuCode} ~ '^Z-[0-9]+$' AND cast(substring(${sku.skuCode} from 3) as integer) between ${b.da} and ${b.a}`);
    out.push({ ...b, usati: n });
  }
  return out;
}
