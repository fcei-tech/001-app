import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getTipiOggetto, getUbicazioniAttive } from "@/db/queries";
import { ImportaSchedeFlow } from "./importa-schede-flow";

export const dynamic = "force-dynamic";

export default async function ImportaSchedePage() {
  const [tipi, ubicazioni] = await Promise.all([getTipiOggetto(), getUbicazioniAttive()]);
  const depositi = ubicazioni.filter((u) => u.tipo === "deposito");
  const primoDeposito = [...depositi].sort((a, b) => a.id - b.id)[0];
  const poster = tipi.find((t) => t.nome === "Poster") ?? tipi[0];
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/"><ArrowLeft /> Torna al Magazzino</Link>
        </Button>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Importa schede da telefono</h1>
          <p className="text-sm text-muted-foreground">
            Carica lo zip uscito dalla pagina del telefono: BATCH crea gli sku e carica le foto su Shopify.
          </p>
        </div>
        <ImportaSchedeFlow
          depositi={depositi.map((d) => ({ id: d.id, nome: d.nome }))}
          tipi={tipi.map((t) => ({ id: t.id, nome: t.nome }))}
          depositoIniziale={primoDeposito?.id ?? null}
          tipoIniziale={poster?.id ?? null}
        />
      </main>
    </div>
  );
}
