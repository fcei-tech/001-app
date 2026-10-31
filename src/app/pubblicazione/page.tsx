import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pl } from "@/lib/plurale";
import { getCanaliConConteggio } from "@/db/pubblicazione-queries";
import { calcolaDaFare } from "@/db/portale-queries";
import { coloreCanale, fasceCanale } from "@/lib/colori-canali";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";

// Due gruppi con titolo al posto delle etichette "Statico / Asta online / Asta fisica".
const GRUPPI = [
  { titolo: "Vendita diretta", tipi: ["statico"] },
  { titolo: "Aste", tipi: ["asta_online", "asta_fisica"] },
];

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
          <div className="flex flex-col gap-8">
            {GRUPPI.map((gruppo) => {
              const elenco = canali.filter((c) => c.attivo && gruppo.tipi.includes(c.tipo));
              if (elenco.length === 0) return null;
              return (
                <section key={gruppo.titolo} aria-label={gruppo.titolo}>
                  <h2 className="mb-3 text-sm font-semibold">{gruppo.titolo}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {elenco.map((c) => {
                      const colore = coloreCanale(c.nome);
                      const fasce = fasceCanale(c.nome);
                      // Portali con tabella (Shopify, eBay, Subito): quante cose da sistemare.
                      const nDaFare = daFareMap.get(c.id)?.length ?? 0;
                      return (
                        <Link key={c.id} href={`/pubblicazione/${c.id}`}>
                          {/* Accento colore del canale (bordo colorato, non riempimento:
                              resta leggibile anche su colori chiari). eBay/eBay Asta usano
                              invece BarraCanale (4 fasce); "pl-5" riserva la stessa
                              larghezza del bordo, e "overflow-hidden" tiene la fascia
                              dentro l'angolo arrotondato. */}
                          <Card
                            className={`relative h-full overflow-hidden transition-colors hover:border-primary/40 ${fasce ? "pl-5" : "border-l-[20px]"}`}
                            style={!fasce && colore ? { borderLeftColor: colore } : undefined}
                          >
                            {fasce && <BarraCanale nomeCanale={c.nome} />}
                            <CardHeader className="space-y-0">
                              <div className="flex items-center gap-2">
                                {colore && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colore }} />}
                                <CardTitle>{c.nome}</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                              {c.tipo === "statico" ? (
                                nDaFare > 0 ? (
                                  <span className="font-medium text-foreground">
                                    {nDaFare} {pl(nDaFare, "modifica da inviare", "modifiche da inviare")}
                                  </span>
                                ) : (
                                  "Tutto allineato"
                                )
                              ) : c.batchInBozza > 0 ? (
                                <span className="font-medium text-foreground">
                                  {c.batchInBozza} batch in preparazione
                                </span>
                              ) : c.batchTotali === 0 ? (
                                "Nessun batch"
                              ) : (
                                `${c.batchTotali} batch`
                              )}
                            </CardContent>
                          </Card>
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
