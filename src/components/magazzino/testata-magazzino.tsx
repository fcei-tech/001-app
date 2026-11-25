import type { DatiTestata } from "@/lib/testata-magazzino";

// Testata del Magazzino: barre colorate come in Pubblicazione, non piu' percentuali
// sottili. Rifatta il 2026-11-25 su richiesta esplicita cliente dopo vari mockup in
// chat - vedi anche testata-magazzino.ts per il dettaglio del calcolo.
const euro = (n: number) => `€ ${Math.round(n).toLocaleString("it-IT")}`;

// Blu dal piu' chiaro al piu' scuro: 5 fasce, stessa famiglia di colore del
// resto (nessun significato semantico diverso da "piu' caro" = piu' scuro).
const COLORI_FASCIA = ["#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8", "#1e3a8a"];
const TESTO_SCURO_FASCIA = [true, false, false, false, false];

export function TestataMagazzino({ dati }: { dati: DatiTestata }) {
  const valoreFasce = dati.fasce.reduce((s, f) => s + f.valore, 0);

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="rounded-xl border bg-card p-4" title="Costo di carico dei pezzi disponibili, solo dei proprietari che contano nel valore del magazzino. Sku bloccati esclusi.">
        <div className="mb-3 flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Valore di carico</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{euro(dati.valoreCarico)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Pezzi con valore dichiarato</div>
            <div className="mt-1 text-lg font-semibold tabular-nums leading-none">{dati.pezziConValoreDichiarato}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Costo medio</div>
            <div className="mt-1 text-lg font-semibold tabular-nums leading-none">{euro(dati.costoMedio)}</div>
          </div>
        </div>

        {valoreFasce > 0 && (
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">Valore di magazzino per fascia di prezzo</div>
            <div className="flex h-14 overflow-hidden rounded-lg">
              {dati.fasce.map((f, i) => {
                if (f.valore <= 0) return null;
                const percent = (f.valore / valoreFasce) * 100;
                // Fasce molto strette (es. €200-600 nei dati reali) non hanno spazio per
                // l'etichetta su due parole senza che vada a capo sopra al valore: sotto
                // soglia mostriamo solo il valore, l'etichetta resta nel title al passaggio
                // del mouse. Sotto una soglia ancora piu' stretta nascondiamo anche quello,
                // lasciando solo il colore (il title copre comunque il dato).
                const mostraEtichetta = percent >= 12;
                const mostraValore = percent >= 5;
                return (
                  <div
                    key={f.etichetta}
                    className="flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5"
                    style={{ width: `${percent}%`, backgroundColor: COLORI_FASCIA[i], color: TESTO_SCURO_FASCIA[i] ? "#1e3a5f" : "#fff" }}
                    title={`${f.etichetta}: ${euro(f.valore)}, ${f.pezzi} pezzi`}
                  >
                    {mostraEtichetta && <span className="whitespace-nowrap text-[10px] opacity-85">{f.etichetta}</span>}
                    {mostraValore && <span className="whitespace-nowrap text-base font-semibold tabular-nums leading-none">{euro(f.valore)}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex text-[10px] text-muted-foreground">
              {dati.fasce.map((f) =>
                f.valore > 0 ? (
                  <div key={f.etichetta} className="text-center" style={{ width: `${(f.valore / valoreFasce) * 100}%` }}>
                    {f.pezzi} pezzi
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Articoli completi</span>
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-success">{dati.completi} completi</span> ·{" "}
            <span className="font-semibold text-warning">{dati.incompleti} incompleti</span> ·{" "}
            <span className="font-semibold text-destructive">{dati.bloccati} bloccati</span>{" "}
            ({dati.conGiacenza} con giacenza)
          </span>
        </div>
        {dati.conGiacenza > 0 && (
          <div className="flex h-11 overflow-hidden rounded-lg" title="Articoli completi, incompleti e bloccati, sul totale degli sku con giacenza (gli esauriti non entrano in questo conteggio).">
            {dati.completi > 0 && <div className="bg-success" style={{ width: `${(dati.completi / dati.conGiacenza) * 100}%` }} />}
            {dati.incompleti > 0 && <div className="bg-warning" style={{ width: `${(dati.incompleti / dati.conGiacenza) * 100}%` }} />}
            {dati.bloccati > 0 && <div className="bg-destructive" style={{ width: `${(dati.bloccati / dati.conGiacenza) * 100}%` }} />}
          </div>
        )}
      </div>
    </div>
  );
}
