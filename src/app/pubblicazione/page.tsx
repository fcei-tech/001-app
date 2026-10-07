import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCanaliConConteggio } from "@/db/pubblicazione-queries";
import { calcolaDaFare } from "@/db/esposizione-queries";
import { coloreCanale, fasceCanale } from "@/lib/colori-canali";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";

const ETICHETTE_TIPO: Record<string, string> = {
  statico: "Statico",
  asta_online: "Asta online",
  asta_fisica: "Asta fisica",
};

export const dynamic = "force-dynamic";

export default async function PubblicazionePage() {
  const [canali, { righe: daFareMap }] = await Promise.all([getCanaliConConteggio(), calcolaDaFare()]);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Pubblicazione</h1>
            <p className="text-sm text-muted-foreground">
              Canali di vendita — seleziona un canale per creare o aprire un batch di pubblicazione.
            </p>
          </div>
          {/* Pagina dedicata silenziamenti (2026-09-28, generazione output
              Catawiki) - link diretto qui, non nascosto dentro un singolo
              batch, dato che elenca TUTTI i silenziamenti di TUTTI i canali. */}
          <Link href="/pubblicazione/silenziamenti" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Silenziamenti
          </Link>
        </div>

        {canali.filter((c) => c.attivo).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun canale trovato.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {canali.filter((c) => c.attivo).map((c) => {
              const colore = coloreCanale(c.nome);
              const fasce = fasceCanale(c.nome);
              // Portali statici: quante cose da sistemare (registro esposto).
              const nDaFare = daFareMap.get(c.id)?.length ?? 0;
              return (
              <Link key={c.id} href={`/pubblicazione/${c.id}`}>
                {/* Accento colore brand/canale (2026-09-25, richiesta esplicita
                    utente 2026-09-24 - vedi COLORE_CANALE in
                    src/lib/colori-canali.ts): bordo colorato, non riempimento
                    pieno, per non compromettere leggibilita' su colori chiari
                    (es. giallo eBay statico, verde Shopify).
                    2026-09-29: bordo portato a 20px (SPESSORE_BORDO_CANALE_PX,
                    "opzione C") per tutti; eBay/eBay Asta usano invece
                    BarraCanale (4 fasce, vedi barra-canale.tsx) - "pl-5"
                    riserva sul Card la stessa larghezza che altrove occupa il
                    border-l-[20px], cosi' il testo parte dallo stesso punto in
                    entrambi i casi. "relative overflow-hidden" e' quello che
                    garantisce che la fascia non sconfini mai oltre l'angolo
                    arrotondato della card (vedi commento in barra-canale.tsx). */}
                <Card
                  className={`relative h-full overflow-hidden transition-colors hover:border-primary/40 ${fasce ? "pl-5" : "border-l-[20px]"}`}
                  style={!fasce && colore ? { borderLeftColor: colore } : undefined}
                >
                  {fasce && <BarraCanale nomeCanale={c.nome} />}
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <div className="flex items-center gap-2">
                      {colore && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colore }} />}
                      <div>
                        <CardTitle>{c.nome}</CardTitle>
                        <CardDescription>{ETICHETTE_TIPO[c.tipo] ?? c.tipo}</CardDescription>
                      </div>
                    </div>
                    {c.esclusivo && <Badge variant="warning">Esclusivo</Badge>}
                    {nDaFare > 0 && <Badge variant="warning">{nDaFare} da fare</Badge>}
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {c.batchTotali === 0 ? (
                      "Nessun batch"
                    ) : (
                      <>
                        {c.batchTotali} batch totali
                        {c.batchInBozza > 0 && (
                          <>
                            {" "}
                            · <span className="font-medium text-foreground">{c.batchInBozza} in bozza</span>
                          </>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
