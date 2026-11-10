import { eq } from "drizzle-orm";
import { db } from "@/db";
import { impostazioniApp } from "@/db/schema";
import { CHIAVE_REGOLE_PREZZI, normalizzaRegole, type RegolePrezzi } from "@/lib/regole-prezzi-config";

// Regole prezzi in vigore: valori salvati, completati con gli standard.
// Se la tabella non c'e' ancora o la lettura fallisce, valgono gli standard
// (mai un errore che blocchi un export).
export async function getRegolePrezzi(): Promise<RegolePrezzi> {
  try {
    const riga = await db.query.impostazioniApp.findFirst({ where: eq(impostazioniApp.chiave, CHIAVE_REGOLE_PREZZI) });
    return normalizzaRegole(riga?.valore);
  } catch {
    return normalizzaRegole(null);
  }
}

export async function salvaRegolePrezzi(regole: RegolePrezzi) {
  const valore = normalizzaRegole(regole);
  await db
    .insert(impostazioniApp)
    .values({ chiave: CHIAVE_REGOLE_PREZZI, valore })
    .onConflictDoUpdate({ target: impostazioniApp.chiave, set: { valore, updatedAt: new Date() } });
}

export async function ripristinaRegolePrezziStandard() {
  await db.delete(impostazioniApp).where(eq(impostazioniApp.chiave, CHIAVE_REGOLE_PREZZI));
}
