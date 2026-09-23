import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCanaliConConteggio } from "@/db/pubblicazione-queries";

const ETICHETTE_TIPO: Record<string, string> = {
  statico: "Statico",
  asta_online: "Asta online",
  asta_fisica: "Asta fisica",
};

export const dynamic = "force-dynamic";

export default async function PubblicazionePage() {
  const canali = await getCanaliConConteggio();

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Pubblicazione</h1>
          <p className="text-sm text-muted-foreground">
            Canali di vendita — seleziona un canale per creare o aprire un batch di pubblicazione.
          </p>
        </div>

        {canali.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun canale trovato.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {canali.map((c) => (
              <Link key={c.id} href={`/pubblicazione/${c.id}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <div>
                      <CardTitle>{c.nome}</CardTitle>
                      <CardDescription>{ETICHETTE_TIPO[c.tipo] ?? c.tipo}</CardDescription>
                    </div>
                    {c.esclusivo && <Badge variant="warning">Esclusivo</Badge>}
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
