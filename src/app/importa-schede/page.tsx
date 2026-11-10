import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getProprietariAttivi, getTipiOggetto, getUbicazioniAttive } from "@/db/queries";
import { ImportaSchedeFlow } from "./importa-schede-flow";

export const dynamic = "force-dynamic";

export default async function ImportaSchedePage() {
  const [tipi, ubicazioni, proprietari] = await Promise.all([getTipiOggetto(), getUbicazioniAttive(), getProprietariAttivi()]);
  // Il deposito scritto sul telefono può essere qualsiasi ubicazione attiva (es. una asta fisica): le offro tutte.
  const depositi = ubicazioni;
  const primoDeposito = [...ubicazioni.filter((u) => u.tipo === "deposito")].sort((a, b) => a.id - b.id)[0] ?? [...ubicazioni].sort((a, b) => a.id - b.id)[0];
  const poster = tipi.find((t) => t.nome === "Poster") ?? tipi[0];
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/carica"><ArrowLeft /> Torna a Carica</Link>
        </Button>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Importa nuovi articoli</h1>
          <p className="text-sm text-muted-foreground">
            Carica lo zip uscito da BATCH Web (inserimento nuovi articoli): BATCH crea gli sku e carica le foto su Shopify.
          </p>
        </div>
        <ImportaSchedeFlow
          depositi={depositi.map((d) => ({ id: d.id, nome: d.nome }))}
          tipi={tipi.map((t) => ({ id: t.id, nome: t.nome }))}
          proprietari={proprietari.map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo }))}
          depositoIniziale={primoDeposito?.id ?? null}
          tipoIniziale={poster?.id ?? null}
        />
      </main>
    </div>
  );
}
