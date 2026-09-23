import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getCanaleById, getBatchPerCanale } from "@/db/pubblicazione-queries";
import { creaBatch } from "../actions";

const ETICHETTE_STATO: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  confermato: { label: "Confermato", variant: "success" },
  generato: { label: "Generato", variant: "outline" },
};

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

export default async function CanalePubblicazionePage({
  params,
}: {
  params: Promise<{ canaleId: string }>;
}) {
  const { canaleId } = await params;
  const id = Number(canaleId);
  const [canale, batch] = await Promise.all([getCanaleById(id), getBatchPerCanale(id)]);

  if (!canale) notFound();

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link
          href="/pubblicazione"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Tutti i canali
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{canale.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {canale.esclusivo
                ? "Canale esclusivo — un pezzo alla volta, consuma disponibilita' alla conferma/accettazione"
                : "Canale parallelo — nessun consumo di disponibilita' condivisa"}
            </p>
          </div>
          <form action={creaBatch}>
            <input type="hidden" name="canaleId" value={canale.id} />
            <Button type="submit">Nuovo batch</Button>
          </form>
        </div>

        <div className="rounded-lg border">
          {batch.length === 0 ? (
            <TableEmpty>Nessun batch per questo canale. Creane uno per iniziare.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creato il</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Lotti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.map((b) => {
                  const stato = ETICHETTE_STATO[b.stato] ?? { label: b.stato, variant: "outline" as const };
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="p-0">
                        <Link href={`/pubblicazione/${canale.id}/${b.id}`} className="block px-4 py-2">
                          {formatData(b.createdAt)}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0">
                        <Link href={`/pubblicazione/${canale.id}/${b.id}`} className="block px-4 py-2">
                          <Badge variant={stato.variant}>{stato.label}</Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-right">
                        <Link href={`/pubblicazione/${canale.id}/${b.id}`} className="block px-4 py-2">
                          {b.lotti.length}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
