import Link from "next/link";
import { Download, FileSpreadsheet, Images, Upload, Plus, Smartphone, TableProperties, type LucideIcon } from "lucide-react";
import { Header } from "@/components/header";
import { getSkuDaRiportare } from "@/db/righe-excel-queries";

export const dynamic = "force-dynamic";

type Voce = { href: string; titolo: string; testo: string; Icona: LucideIcon; verso: "Importa" | "Esporta"; badge?: string };

// Vista "Dati": importazioni ed esportazioni sullo stesso livello, distinte da
// un'etichetta piccola e da un'icona sulla scheda.
export default async function CaricaPage() {
  const { voci, senzaFoglio } = await getSkuDaRiportare();
  const daRiportare = voci.length + senzaFoglio.length;

  const schede: Voce[] = [
    { href: "/importa-schede", titolo: "Nuovi articoli", testo: "Da BATCH Web: sku e foto", Icona: Smartphone, verso: "Importa" },
    { href: "/magazzino/nuovo", titolo: "Nuovo sku", testo: "Uno alla volta, a mano", Icona: Plus, verso: "Importa" },
    { href: "/importa-excel", titolo: "Importa da Excel", testo: "STOCK FP e fogli CV", Icona: FileSpreadsheet, verso: "Importa" },
    { href: "/importa-foto", titolo: "Importa foto", testo: "In blocco, per codice sku", Icona: Images, verso: "Importa" },
    {
      href: "/righe-excel",
      titolo: "Righe per Excel",
      testo: "Le righe nuove per STOCK",
      Icona: TableProperties,
      verso: "Esporta",
      badge: daRiportare > 0 ? `${daRiportare} da riportare` : undefined,
    },
  ];

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Dati</h1>
          <p className="text-sm text-muted-foreground">Quello che entra e quello che esce da BATCH.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schede.map((v) => {
            const Freccia = v.verso === "Importa" ? Download : Upload;
            return (
              <Link
                key={v.href}
                href={v.href}
                className="flex flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <span className="flex items-start justify-between">
                  <v.Icona className="size-5 text-primary" />
                  <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Freccia className="size-3" />
                    {v.verso}
                  </span>
                </span>
                <span className="mt-1 text-sm font-medium">{v.titolo}</span>
                <span className="text-xs text-muted-foreground">{v.testo}</span>
                {v.badge && <span className="mt-1 w-fit rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{v.badge}</span>}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
