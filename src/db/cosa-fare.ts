import { and, eq, ne } from "drizzle-orm";
import { db } from "./index";
import { batchLotti, batchPubblicazione, canali } from "./schema";
import { calcolaDaFare } from "./portale-queries";

// Elenco "cosa devi fare" mostrato all'apertura dell'app (2026-10-30). Solo
// lettura: conta cose gia' presenti nel software, nessun dato nuovo.
export type VoceCosaFare = {
  id: string;
  gruppo: "Portali" | "Aste";
  testo: string;
  href: string;
};

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

export async function getCosaFare(): Promise<VoceCosaFare[]> {
  const voci: VoceCosaFare[] = [];

  // Portali statici: sku da aggiungere, aggiornare, togliere.
  const { canali: statici, righe } = await calcolaDaFare();
  for (const c of statici) {
    const lista = righe.get(c.id) ?? [];
    if (!lista.length) continue;
    const conta = (stato: string) => lista.filter((r) => r.stato === stato).length;
    const parti: string[] = [];
    if (conta("nuovo")) parti.push(plurale(conta("nuovo"), "nuovo", "nuovi"));
    if (conta("modificato")) parti.push(`${conta("modificato")} da aggiornare`);
    if (conta("esaurito")) parti.push(plurale(conta("esaurito"), "esaurito", "esauriti"));
    if (conta("archiviare")) parti.push(`${conta("archiviare")} da archiviare`);
    voci.push({
      id: `portale-${c.id}`,
      gruppo: "Portali",
      testo: `${c.nome}: ${parti.join(", ")}`,
      href: `/pubblicazione/${c.id}`,
    });
  }

  // Aste: batch in preparazione, batch pronti da inviare, lotti proposti in attesa.
  const batch = await db
    .select({ canaleId: canali.id, nome: canali.nome, stato: batchPubblicazione.stato })
    .from(batchPubblicazione)
    .innerJoin(canali, eq(canali.id, batchPubblicazione.canaleId))
    .where(and(ne(canali.tipo, "statico"), eq(canali.attivo, true)));
  const perCanale = new Map<number, { nome: string; bozza: number; pronti: number }>();
  for (const b of batch) {
    const e = perCanale.get(b.canaleId) ?? { nome: b.nome, bozza: 0, pronti: 0 };
    if (b.stato === "bozza") e.bozza++;
    if (b.stato === "confermato") e.pronti++;
    perCanale.set(b.canaleId, e);
  }
  for (const [id, e] of perCanale) {
    const parti: string[] = [];
    if (e.bozza) parti.push(`${plurale(e.bozza, "batch", "batch")} in preparazione`);
    if (e.pronti) parti.push(`${plurale(e.pronti, "batch pronto", "batch pronti")} da inviare`);
    if (parti.length) voci.push({ id: `asta-${id}`, gruppo: "Aste", testo: `${e.nome}: ${parti.join(", ")}`, href: `/pubblicazione/${id}` });
  }

  const proposti = await db
    .select({ canaleId: canali.id, nome: canali.nome })
    .from(batchLotti)
    .innerJoin(batchPubblicazione, eq(batchPubblicazione.id, batchLotti.batchId))
    .innerJoin(canali, eq(canali.id, batchPubblicazione.canaleId))
    .where(
      and(
        eq(canali.tipo, "asta_fisica"),
        eq(canali.attivo, true),
        eq(batchPubblicazione.stato, "pubblicato"),
        eq(batchLotti.statoRiga, "candidato")
      )
    );
  const propostiPerCanale = new Map<number, { nome: string; n: number }>();
  for (const p of proposti) {
    const e = propostiPerCanale.get(p.canaleId) ?? { nome: p.nome, n: 0 };
    e.n++;
    propostiPerCanale.set(p.canaleId, e);
  }
  for (const [id, e] of propostiPerCanale) {
    voci.push({
      id: `proposti-${id}`,
      gruppo: "Aste",
      testo: `${e.nome}: ${plurale(e.n, "lotto proposto", "lotti proposti")} da accettare o rifiutare`,
      href: `/pubblicazione/${id}`,
    });
  }

  return voci;
}
