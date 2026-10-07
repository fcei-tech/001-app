import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { movimentiMagazzino } from "./schema";
import { CAUSALE_CORREZIONE } from "@/lib/giacenza";

// "Consolida": fonde SOLO le righe nascoste (correzione_quantita) dello
// stesso sku/proprietario/deposito in una riga sola, con la somma. Le
// quantita' non cambiano mai; i movimenti visibili restano intatti.

export type AnteprimaConsolida = {
  righeNascoste: number;
  gruppiDaFondere: number;
  righeDaEliminare: number;
  righeDopo: number;
  skuCoinvolti: number;
};

type Riga = typeof movimentiMagazzino.$inferSelect;

async function leggiNascoste(skuId?: number): Promise<Riga[]> {
  const cond = skuId
    ? and(eq(movimentiMagazzino.causale, CAUSALE_CORREZIONE), eq(movimentiMagazzino.skuId, skuId))
    : eq(movimentiMagazzino.causale, CAUSALE_CORREZIONE);
  return db.select().from(movimentiMagazzino).where(cond);
}

function raggruppa(righe: Riga[]): Riga[][] {
  const m = new Map<string, Riga[]>();
  for (const r of righe) {
    const k = `${r.skuId}:${r.proprietarioId}:${r.ubicazioneId}`;
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return Array.from(m.values()).filter((g) => g.length > 1);
}

export async function anteprimaConsolida(skuId?: number): Promise<AnteprimaConsolida> {
  const righe = await leggiNascoste(skuId);
  const gruppi = raggruppa(righe);
  const eliminate = gruppi.reduce((a, g) => a + g.length, 0);
  const create = gruppi.filter((g) => g.reduce((s, r) => s + r.quantitaDelta, 0) !== 0).length;
  return {
    righeNascoste: righe.length,
    gruppiDaFondere: gruppi.length,
    righeDaEliminare: eliminate,
    righeDopo: righe.length - eliminate + create,
    skuCoinvolti: new Set(gruppi.map((g) => g[0].skuId)).size,
  };
}

export async function eseguiConsolida(skuId?: number): Promise<AnteprimaConsolida> {
  const righe = await leggiNascoste(skuId);
  const gruppi = raggruppa(righe);
  const anteprima = await anteprimaConsolida(skuId);
  await db.transaction(async (tx) => {
    for (const g of gruppi) {
      const somma = g.reduce((s, r) => s + r.quantitaDelta, 0);
      const ultima = g.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), g[0].createdAt);
      await tx.delete(movimentiMagazzino).where(inArray(movimentiMagazzino.id, g.map((r) => r.id)));
      if (somma !== 0) {
        await tx.insert(movimentiMagazzino).values({
          skuId: g[0].skuId,
          proprietarioId: g[0].proprietarioId,
          ubicazioneId: g[0].ubicazioneId,
          causale: CAUSALE_CORREZIONE,
          quantitaDelta: somma,
          note: null,
          createdAt: ultima,
        });
      }
    }
  });
  return anteprima;
}
