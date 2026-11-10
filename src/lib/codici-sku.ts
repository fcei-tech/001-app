// Codici sku Z-NNNNN e blocchi PRENOTATI (Release 10, 2026-11-10).
// Un blocco prenotato e' un intervallo di numeri [da, a] che BATCH non
// assegna a nuovi sku: servono a chi scrive nuove righe direttamente su
// Excel (STOCK FP / CV) senza rischiare doppioni. Funzioni pure, nessun DB.

export const CHIAVE_CODICI_PRENOTATI = "codici_prenotati";
export const DIMENSIONE_BLOCCO_STANDARD = 20;

export type BloccoPrenotato = { id: string; da: number; a: number; creato: string };

export function formattaCodice(n: number): string {
  return `Z-${String(n).padStart(5, "0")}`;
}

export function numeroDaCodice(codice: string): number | null {
  const m = /^Z-(\d+)$/.exec(codice.trim());
  return m ? Number(m[1]) : null;
}

export function normalizzaBlocchi(grezzo: unknown): BloccoPrenotato[] {
  const lista = (grezzo as { blocchi?: unknown } | null)?.blocchi;
  if (!Array.isArray(lista)) return [];
  const out: BloccoPrenotato[] = [];
  for (const b of lista) {
    const o = b as Partial<BloccoPrenotato>;
    if (typeof o?.id === "string" && Number.isInteger(o.da) && Number.isInteger(o.a) && (o.a as number) >= (o.da as number)) {
      out.push({ id: o.id, da: o.da as number, a: o.a as number, creato: typeof o.creato === "string" ? o.creato : "" });
    }
  }
  return out.sort((x, y) => x.da - y.da);
}

// Primo numero libero: oltre il massimo esistente, saltando i blocchi prenotati.
export function primoNumeroLibero(maxEsistente: number, blocchi: BloccoPrenotato[]): number {
  let n = maxEsistente + 1;
  for (let cambiato = true; cambiato; ) {
    cambiato = false;
    for (const b of blocchi) {
      if (n >= b.da && n <= b.a) {
        n = b.a + 1;
        cambiato = true;
      }
    }
  }
  return n;
}

// Nuovo blocco di `quanti` numeri subito dopo il massimo (sku esistenti o blocchi).
export function nuovoBlocco(maxEsistente: number, blocchi: BloccoPrenotato[], quanti: number, adesso = new Date()): BloccoPrenotato {
  const maxBlocchi = blocchi.reduce((m, b) => Math.max(m, b.a), 0);
  const da = Math.max(maxEsistente, maxBlocchi) + 1;
  return { id: `b${adesso.getTime()}`, da, a: da + quanti - 1, creato: adesso.toISOString() };
}
