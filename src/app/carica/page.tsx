import Link from "next/link";
import { FileSpreadsheet, Images, Plus, Smartphone, TableProperties, type LucideIcon } from "lucide-react";
import { Header } from "@/components/header";
import { getSkuDaRiportare } from "@/db/righe-excel-queries";

export const dynamic = "force-dynamic";

type Voce = { href: string; titolo: string; testo: string; Icona: LucideIcon; badge?: string };

// Vista "Carica" (Release 11): tutto quello che entra in BATCH, in un posto solo,
// raggruppato per scopo. I bottoni che stavano sopra il Magazzino sono qui.
export default async function CaricaPage() {
  const { voci, senzaFoglio } = await getSkuDaRiportare();
  const daRiportare = voci.length + senzaFoglio.length;

  const gruppi: { titolo: string; voci: Voce[] }[] = [
    {
      titolo: "Nuovi sku",
      voci: [
        { href: "/importa-schede", titolo: "Nuovi articoli", testo: "Da BATCH Web: sku e foto", Icona: Smartphone },
        { href: "/magazzino/nuovo", titolo: "Nuovo sku", testo: "Uno alla volta, a mano", Icona: Plus },
        { href: "/importa-excel", titolo: "Importa da Excel", testo: "STOCK FP e fogli CV", Icona: FileSpreadsheet },
      ],
    },
    {
      titolo: "Foto",
      voci: [{ href: "/importa-foto", titolo: "Importa foto", testo: "In blocco, per codice sku", Icona: Images }],
    },
    {
      titolo: "Verso Excel",
      voci: [
        {
          href: "/righe-excel",
          titolo: "Righe per Excel",
          testo: "Le righe nuove per STOCK",
          Icona: TableProperties,
          badge: daRiportare > 0 ? `${daRiportare} da riportare` : undefined,
        },
      ],
    },
  ];

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Carica</h1>
          <p className="text-sm text-muted-foreground">Tutto quello che entra in BATCH, in un posto solo.</p>
        </div>
        <div className="flex flex-col gap-6">
          {gruppi.map((g) => (
            <section key={g.titolo}>
              <h2 className="mb-2 text-xs font-medium text-muted-foreground">{g.titolo}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.voci.map((v) => (
                  <Link
                    key={v.href}
                    href={v.href}
                    className="flex flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-start justify-between">
                      <v.Icona className="size-5 text-primary" />
                      {v.badge && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{v.badge}</span>}
                    </span>
                    <span className="mt-1 text-sm font-medium">{v.titolo}</span>
                    <span className="text-xs text-muted-foreground">{v.testo}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
