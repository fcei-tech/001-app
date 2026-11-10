import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getSkuDaRiportare } from "@/db/righe-excel-queries";
import { RigheExcelFlow } from "./righe-excel-flow";

export const dynamic = "force-dynamic";

export default async function RigheExcelPage() {
  const { voci, senzaFoglio } = await getSkuDaRiportare();
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/carica"><ArrowLeft /> Torna a Carica</Link>
        </Button>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Righe per Excel</h1>
          <p className="text-sm text-muted-foreground">
            Gli sku nuovi creati in BATCH, pronti da copiare nei fogli STOCK FP / STOCK FOGLI CV.
          </p>
        </div>
        <RigheExcelFlow
          voci={voci.map((v) => ({ id: v.id, skuCode: v.skuCode, artista: v.artista, opera: v.opera, fogli: v.righe.map((r) => `${r.foglio} × ${r.quantita}`).join(" + ") }))}
          senzaFoglio={senzaFoglio}
        />
      </main>
    </div>
  );
}
