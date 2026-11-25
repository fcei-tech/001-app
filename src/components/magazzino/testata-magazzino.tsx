import type { DatiTestata } from "@/lib/testata-magazzino";

// Scheda informativa in testa al Magazzino: non cliccabile, fondo piatto, tre dati.
// Calcolata su tutto il magazzino (non sui filtri); gli sku bloccati non contano.
const euro = (n: number) => `€ ${Math.round(n).toLocaleString("it-IT")}`;

function Percentuale({ etichetta, valore, totale, titolo }: { etichetta: string; valore: number; totale: number; titolo: string }) {
  const pct = totale > 0 ? Math.round((valore / totale) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 p-4" title={titolo}>
      <span className="text-xs font-medium text-muted-foreground">{etichetta}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums leading-none">{pct}%</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {valore} su {totale}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-primary/15" role="img" aria-label={`${etichetta}: ${pct}%`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TestataMagazzino({ dati }: { dati: DatiTestata }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
      <div className="flex flex-col gap-2 bg-card p-4" title="Valore di carico dei pezzi dei proprietari che contano nel valore del magazzino. Sku bloccati esclusi.">
        <span className="text-xs font-medium text-muted-foreground">Valore di carico</span>
        <span className="text-2xl font-semibold tabular-nums leading-none">{euro(dati.valoreCarico)}</span>
        <span className="text-xs text-muted-foreground">proprietari che contano</span>
      </div>
      <div className="bg-card">
        <Percentuale
          etichetta="Esposti"
          valore={dati.esposti}
          totale={dati.disponibili}
          titolo="Sku in vetrina su almeno un portale, sul totale di quelli disponibili (non bloccati, con almeno un pezzo)."
        />
      </div>
      <div className="bg-card">
        <Percentuale
          etichetta="Completi"
          valore={dati.completi}
          totale={dati.disponibili}
          titolo="Sku disponibili con foto e senza dati mancanti (prezzo eBay, prezzo Catawiki, anno)."
        />
      </div>
    </div>
  );
}
