import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Header } from "@/components/header";
import { getCanaliConConteggio } from "@/db/pubblicazione-queries";
import { calcolaDaFare } from "@/db/portale-queries";
import { getNumeriPubblicazione, type NumeriCanale } from "@/db/pubblicazione-numeri";
import { colorePrincipale, fasceDelCanale } from "@/lib/colori-canali";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";

// Un tasto per portale: nome grande, barra live (esposti su disponibili per i portali,
// costo e riserva per le aste) e un contatore a 4 cifre. Un portale nuovo compare da solo.
const GRUPPI = [
  { titolo: "Portali", tipi: ["statico"] },
  { titolo: "Aste", tipi: ["asta_online", "asta_fisica"] },
];

export const dynamic = "force-dynamic";

const euro = (n: number) => `€ ${Math.round(n).toLocaleString("it-IT")}`;

// Testo nero su colori chiari, bianco su colori scuri.
function testoSu(hex: string | undefined): string {
  if (!hex) return "#fff";
  const v = parseInt(hex.slice(1), 16);
  const l = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  return l > 150 ? "#111" : "#fff";
}

function Contatore({ valore, etichetta }: { valore: number; etichetta: string }) {
  const cifre = String(Math.min(valore, 9999)).padStart(4, "0");
  const zeri = cifre.length - String(Math.min(valore, 9999)).length;
  return (
    <div className="flex h-[60px] w-[104px] shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/40">
      <span className="font-mono text-2xl font-semibold tabular-nums leading-none">
        <span className="opacity-25">{cifre.slice(0, zeri)}</span>
        {cifre.slice(zeri)}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{etichetta}</span>
    </div>
  );
}

function Striscia({ n, colore, maxRiserva, daInviare }: { n: NumeriCanale | undefined; colore: string; maxRiserva: number; daInviare: number }) {
  const testo = testoSu(colore);
  if (!n) return null;
  if (n.tipo === "vetrina") {
    const pct = n.disponibili > 0 ? Math.min(100, Math.round((n.esposti / n.disponibili) * 100)) : 0;
    return (
      <>
        <div className="relative flex h-[60px] min-w-0 flex-1 overflow-hidden rounded-lg" style={{ backgroundColor: `${colore}1F` }}>
          <div className="flex h-full items-center gap-2 px-3" style={{ width: `${pct}%`, minWidth: 128, backgroundColor: colore, color: testo }}>
            <span className="text-2xl font-semibold tabular-nums leading-none">{n.esposti}</span>
            <span className="flex flex-col text-[11px] leading-tight">
              <span className="font-semibold">{pct}%</span>
              <span className="opacity-80">esposti</span>
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 px-3 text-right">
            <span className="text-xl font-semibold tabular-nums leading-none">{n.disponibili}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">disponibili</span>
          </div>
        </div>
        <Contatore valore={daInviare} etichetta="da inviare" />
      </>
    );
  }
  const larghezza = maxRiserva > 0 ? Math.max(35, Math.round((n.riserva / maxRiserva) * 100)) : 35;
  const scuro = n.riserva > 0 ? Math.min(100, (n.costo / n.riserva) * 100) : 0;
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center">
        <div className="relative flex h-[60px] overflow-hidden rounded-lg" style={{ width: `${larghezza}%`, backgroundColor: `${colore}33` }}>
          {n.lotti > 0 && (
            <div className="flex h-full items-center px-3" style={{ width: `${scuro}%`, minWidth: 96, backgroundColor: colore, color: testo }}>
              <span className="whitespace-nowrap text-lg font-semibold tabular-nums">{n.costoIncompleto ? "costo incompleto" : euro(n.costo)}</span>
            </div>
          )}
          <div className="flex flex-1 items-center justify-end px-3">
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums">{n.lotti > 0 ? euro(n.riserva) : "—"}</span>
          </div>
        </div>
      </div>
      <Contatore valore={n.lotti} etichetta="lotti" />
    </>
  );
}

export default async function PubblicazionePage() {
  const [canali, { righe: daFareMap }, numeri] = await Promise.all([getCanaliConConteggio(), calcolaDaFare(), getNumeriPubblicazione()]);
  const maxRiserva = Math.max(0, ...[...numeri.values()].map((n) => (n.tipo === "asta" ? n.riserva : 0)));

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Pubblicazione</h1>
            <p className="text-sm text-muted-foreground">Scegli il portale su cui lavorare.</p>
          </div>
          <Link href="/pubblicazione/silenziamenti" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Silenziamenti
          </Link>
        </div>

        {canali.filter((c) => c.attivo).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun portale.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {GRUPPI.map((gruppo) => {
              const elenco = canali.filter((c) => c.attivo && gruppo.tipi.includes(c.tipo));
              if (elenco.length === 0) return null;
              return (
                <section key={gruppo.titolo} aria-label={gruppo.titolo}>
                  <h2 className="mb-3 text-sm font-semibold">{gruppo.titolo}</h2>
                  <div className="flex flex-col gap-3">
                    {elenco.map((c) => {
                      const colore = colorePrincipale(c) ?? "#6B7280";
                      const fasce = fasceDelCanale(c);
                      const daInviare = daFareMap.get(c.id)?.length ?? 0;
                      return (
                        <Link
                          key={c.id}
                          href={`/pubblicazione/${c.id}`}
                          className="group relative flex h-[92px] items-center gap-4 overflow-hidden rounded-xl border bg-card pl-9 pr-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
                        >
                          {fasce ? (
                            <BarraCanale fasce={fasce} />
                          ) : (
                            <span className="pointer-events-none absolute inset-y-0 left-0 w-5" style={{ backgroundColor: colore }} aria-hidden />
                          )}
                          <span className="w-[150px] shrink-0 truncate text-[22px] font-semibold tracking-tight">{c.nome}</span>
                          <Striscia n={numeri.get(c.id)} colore={colore} maxRiserva={maxRiserva} daInviare={daInviare} />
                          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
