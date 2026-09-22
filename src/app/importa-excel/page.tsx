import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ImportExcelFlow } from "./import-excel-flow";

export default function ImportaExcelPage() {
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
          <h1 className="text-xl font-semibold tracking-tight">Importa da Excel</h1>
          <p className="text-sm text-muted-foreground">
            Allinea il Magazzino ai due fogli grezzi STOCK FP / STOCK FOGLI CV del Master.
          </p>
        </div>
        <ImportExcelFlow />
      </main>
    </div>
  );
}
