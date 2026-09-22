import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getMagazzino } from "@/db/queries";
import { Search, Plus, FileSpreadsheet, Images } from "lucide-react";

function formatMisura(l: string | null, h: string | null) {
  if (!l && !h) return "—";
  return `${l ?? "?"} × ${h ?? "?"} cm`;
}
function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

export const dynamic = "force-dynamic";

export default async function MagazzinoPage({ searchParams }: { searchParams: Promise<{ q?: string; skueliminato?: string }> }) {
  const { q, skueliminato } = await searchParams;
  const righe = await getMagazzino(q);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {skueliminato && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Sku eliminato.</div>
        )}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Magazzino</h1>
            <p className="text-sm text-muted-foreground">{righe.length} sku {q ? `per "${q}"` : "totali"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary"><Link href="/importa-excel"><FileSpreadsheet /> Importa da Excel</Link></Button>
            <Button asChild variant="secondary"><Link href="/importa-foto"><Images /> Importa Foto</Link></Button>
            <Button asChild><Link href="/magazzino/nuovo"><Plus /> Nuovo sku</Link></Button>
          </div>
        </div>

        <form className="mb-4 flex max-w-sm items-center gap-2" action="/">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q ?? ""} placeholder="Cerca artista, opera o sku..." className="pl-8" />
          </div>
          <Button type="submit" variant="secondary">Cerca</Button>
        </form>

        <div className="rounded-xl border">
          {righe.length === 0 ? (
            <TableEmpty><p className="font-medium text-foreground">Nessuno sku trovato</p><p>Prova a modificare i termini di ricerca.</p></TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead><TableHead>Artista</TableHead><TableHead>Opera</TableHead><TableHead>Misura</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Condizione</TableHead><TableHead className="text-right">Disponibile</TableHead>
                  <TableHead className="text-right">Prezzo eBay</TableHead><TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block font-mono text-xs p-3">{r.skuCode}</Link></TableCell>
                    <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block p-3">{r.artista}</Link></TableCell>
                    <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block p-3">{r.opera}</Link></TableCell>
                    <TableCell className="text-muted-foreground">{formatMisura(r.larghezza, r.altezza)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.tipo}</TableCell>
                    <TableCell><Badge variant={condizioneVariant(r.condizione)}>{r.condizione}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantitaDisponibile}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.prezzoEbay ? `€ ${r.prezzoEbay}` : "—"}</TableCell>
                    <TableCell>{r.bloccatoVendita ? <Badge variant="destructive">Bloccato</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
