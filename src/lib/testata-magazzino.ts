// Tre numeri della testata del Magazzino. Informativi, calcolati su TUTTO il
// magazzino (non sui filtri attivi). Gli sku bloccati alla vendita non contano in nessuno.
import { campiMancanti } from "@/lib/campi-mancanti-pubblicazione";
import type { RigaMagazzino } from "@/db/queries";

export type DatiTestata = {
  // Somma di (valore di carico x pezzi) dei soli proprietari con "Conta nel valore del magazzino".
  valoreCarico: number;
  // Base di Esposti e Completi: sku non bloccati con almeno un pezzo.
  disponibili: number;
  esposti: number;
  completi: number;
};

function numero(v: string | null): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcolaTestata(
  righe: Pick<RigaMagazzino, "id" | "skuCode" | "bloccatoVendita" | "quantitaDisponibile" | "valoreCarico" | "giacenze" | "prezzoEbay" | "prezzoCatawiki" | "anno" | "numeroFoto">[],
  proprietariCheContano: Set<number>,
  skuEsposti: Set<number>,
  sogliaCatawiki: number
): DatiTestata {
  let valore = 0;
  let disponibili = 0;
  let esposti = 0;
  let completi = 0;
  for (const r of righe) {
    if (r.skuCode === "IGNORA" || r.bloccatoVendita) continue;
    const unitario = numero(r.valoreCarico);
    if (unitario > 0) {
      const pezzi = r.giacenze.filter((g) => proprietariCheContano.has(g.proprietarioId)).reduce((s, g) => s + g.saldo, 0);
      if (pezzi > 0) valore += unitario * pezzi;
    }
    if (r.quantitaDisponibile <= 0) continue;
    disponibili += 1;
    if (skuEsposti.has(r.id)) esposti += 1;
    if (r.numeroFoto > 0 && campiMancanti(r, sogliaCatawiki).length === 0) completi += 1;
  }
  return { valoreCarico: valore, disponibili, esposti, completi };
}
