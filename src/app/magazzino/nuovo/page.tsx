import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getTipiOggetto, getUbicazioniAttive } from "@/db/queries";
import { NuovoSkuFlow } from "./nuovo-sku-flow";

export default async function NuovoSkuPage() {
  const [tipi, ubicazioni] = await Promise.all([getTipiOggetto(), getUbicazioniAttive()]);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft /> Torna al Magazzino
          </Link>
        </Button>
        <NuovoSkuFlow tipi={tipi} ubicazioni={ubicazioni} />
      </main>
    </div>
  );
}
