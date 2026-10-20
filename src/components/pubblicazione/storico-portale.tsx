import type { RigaStorico } from "@/db/esposizione-queries";

const ETICHETTA: Record<string, string> = {
  aggiunto: "Aggiunto",
  tolto: "Tolto",
  abbassato: "Quantità abbassata",
  riprezzato: "Prezzo aggiornato",
  ritirato: "Ritirato da te",
  rimesso: "Rimesso in vendita",
  bloccato: "Bloccato",
  sbloccato: "Sbloccato",
  annullato: "Annullato",
};

const formatta = (d: Date) =>
  new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// Storico delle operazioni su un portale statico (ultime 300 righe).
export function StoricoPortale({ nomePortale, righe }: { nomePortale: string; righe: RigaStorico[] }) {
  if (righe.length === 0) return null;
  return (
    <details className="mb-6 rounded-xl border" aria-label={`Storico ${nomePortale}`}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Storico operazioni su {nomePortale} (ultime {righe.length})</summary>
      <ul className="max-h-96 overflow-y-auto border-t">
        {righe.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t px-4 py-2 text-sm first:border-t-0">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{formatta(r.quando)}</span>
            <span className="w-40 shrink-0">{ETICHETTA[r.azione] ?? r.azione}</span>
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs">{r.skuCode}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.artista} — {r.opera}
              </span>
            </span>
            {r.dettaglio && <span className="whitespace-nowrap text-xs text-muted-foreground">{r.dettaglio}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
