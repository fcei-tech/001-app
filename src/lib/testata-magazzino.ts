// Testata del Magazzino. Informativa, calcolata su TUTTO il magazzino (non sui
// filtri attivi). Rifatta il 2026-11-25 (richiesta esplicita cliente, barre
// colorate come in Pubblicazione + peso reale di senza-foto/mancanti/bloccati
// invece del semplice sì/no - vedi mockup approvato in chat).
import { campiMancanti } from "@/lib/campi-mancanti-pubblicazione";
import type { RigaMagazzino } from "@/db/queries";

// Soglie fascia di prezzo (costo unitario di carico), scelte sui dati reali
// del cliente (file val_carico_fp.xlsx, sessione 2026-11-25): 5 fasce, nessuna
// sotto il 10% di peso in valore, cosi' non serve nessuna larghezza minima
// forzata per restare leggibili in barra.
const SOGLIE_FASCIA = [30, 80, 200, 600] as const;
const ETICHETTE_FASCIA = ["fino €30", "€30–80", "€80–200", "€200–600", "oltre €600"] as const;

export type FasciaPrezzo = { etichetta: string; valore: number; pezzi: number };

export type DatiTestata = {
  // Somma di (valore di carico x pezzi) dei soli proprietari con "Conta nel valore del magazzino".
  // Sku bloccati esclusi (invariato rispetto a prima - non oggetto di questa richiesta).
  valoreCarico: number;
  pezziConValoreDichiarato: number;
  // 0 se pezziConValoreDichiarato e' 0 (nessuna divisione per zero).
  costoMedio: number;
  // Stesso perimetro di valoreCarico, suddiviso per fascia di costo unitario.
  fasce: FasciaPrezzo[];
  // Articoli completi: sku con giacenza > 0 (esauriti esclusi ovunque, non
  // solo da "completi" - richiesta esplicita cliente), in 3 fette mutuamente
  // esclusive che sommano sempre a conGiacenza.
  conGiacenza: number;
  completi: number;
  incompleti: number;
  bloccati: number;
};

function numero(v: string | null): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function indiceFascia(unitario: number): number {
  for (let i = 0; i < SOGLIE_FASCIA.length; i++) {
    if (unitario < SOGLIE_FASCIA[i]) return i;
  }
  return SOGLIE_FASCIA.length;
}

export function calcolaTestata(
  righe: Pick<RigaMagazzino, "id" | "skuCode" | "bloccatoVendita" | "quantitaDisponibile" | "valoreCarico" | "giacenze" | "prezzoEbay" | "prezzoCatawiki" | "anno" | "numeroFoto">[],
  proprietariCheContano: Set<number>,
  sogliaCatawiki: number
): DatiTestata {
  let valoreCarico = 0;
  let pezziConValoreDichiarato = 0;
  const fasce: FasciaPrezzo[] = ETICHETTE_FASCIA.map((etichetta) => ({ etichetta, valore: 0, pezzi: 0 }));
  let conGiacenza = 0;
  let completi = 0;
  let incompleti = 0;
  let bloccati = 0;

  for (const r of righe) {
    if (r.skuCode === "IGNORA") continue;

    // Valore di carico + fasce di prezzo: come prima, bloccati esclusi.
    if (!r.bloccatoVendita) {
      const unitario = numero(r.valoreCarico);
      if (unitario > 0) {
        const pezzi = r.giacenze.filter((g) => proprietariCheContano.has(g.proprietarioId)).reduce((s, g) => s + g.saldo, 0);
        if (pezzi > 0) {
          valoreCarico += unitario * pezzi;
          pezziConValoreDichiarato += pezzi;
          const f = fasce[indiceFascia(unitario)];
          f.valore += unitario * pezzi;
          f.pezzi += pezzi;
        }
      }
    }

    // Articoli completi: esauriti esclusi ovunque, bloccati = fetta a parte.
    if (r.quantitaDisponibile <= 0) continue;
    conGiacenza += 1;
    if (r.bloccatoVendita) {
      bloccati += 1;
    } else if (campiMancanti(r, sogliaCatawiki).length === 0) {
      completi += 1;
    } else {
      incompleti += 1;
    }
  }

  return {
    valoreCarico,
    pezziConValoreDichiarato,
    costoMedio: pezziConValoreDichiarato > 0 ? valoreCarico / pezziConValoreDichiarato : 0,
    fasce,
    conGiacenza,
    completi,
    incompleti,
    bloccati,
  };
}
