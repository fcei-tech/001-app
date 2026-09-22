import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ImportFotoFlow } from "./import-foto-flow";

export default function ImportaFotoPage() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft /> Torna al Magazzino
          </Link>
        </Button>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Importa Foto (da Master)</h1>
          <p className="text-sm text-muted-foreground">
            Recupera nel Magazzino le foto gia&apos; caricate su Shopify prima di questo software,
            leggendo gli URL gia&apos; presenti in MASTER!URL_STORICA. Una tantum per il pregresso -
            le foto nuove si aggiungono dalla scheda articolo.
          </p>
        </div>
        <ImportFotoFlow />
      </main>
    </div>
  );
}
