import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getMagazzino, getTipiOggetto } from "@/db/queries";
import { Search, Plus, FileSpreadsheet, Images, X } from "lucide-react";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

function formatMisura(l: string | null, h: string | null) {
  if (!l && !h) return "—";
  return `${l ?? "?"} × ${h ?? "?"} cm`;
}
function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

type SearchParams = {
  q?: string;
  tipo?: string;
  condizione?: string;
  proprieta?: string;
  bloccato?: string;
  disponibilita?: string;
  senzafoto?: string;
  skueliminato?: string;
};

export const dynamic = "force-dynamic";

export default async function MagazzinoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { q, skueliminato } = sp;

  const tipoId = sp.tipo && sp.tipo !== "tutti" ? Number(sp.tipo) : undefined;
  const condizione = sp.condizione && sp.condizione !== "tutti" ? sp.condizione : undefined;
  const proprieta = sp.proprieta === "FP" || sp.proprieta === "CV" ? sp.proprieta : undefined;
  const bloccato = sp.bloccato === "si" || sp.bloccato === "no" ? sp.bloccato : undefined;
  const disponibilita = sp.disponibilita === "disponibile" || sp.disponibilita === "esaurito" ? sp.disponibilita : undefined;
  const senzaFoto = sp.senzafoto === "si";

  const filtriAttivi = Boolean(q || tipoId || condizione || proprieta || bloccato || disponibilita || senzaFoto);

  const [righe, tipi] = await Promise.all([
    getMagazzino({ ricerca: q, tipoId, condizione, proprieta, bloccato, disponibilita, senzaFoto }),
    getTipiOggetto(),
  ]);

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
            <p className="text-sm text-muted-foreground">{righe.length} sku {filtriAttivi ? "con questi filtri" : "totali"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary"><Link href="/importa-excel"><FileSpreadsheet /> Importa da Excel</Link></Button>
            <Button asChild variant="secondary"><Link href="/importa-foto"><Images /> Importa Foto</Link></Button>
            <Button asChild><Link href="/magazzino/nuovo"><Plus /> Nuovo sku</Link></Button>
          </div>
        </div>

        <form className="mb-4 flex flex-col gap-3" action="/">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q ?? ""} placeholder="Cerca artista, opera o sku..." className="pl-8" />
            </div>

            <Select name="tipo" defaultValue={tipoId ? String(tipoId) : "tutti"}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i tipi</SelectItem>
                {tipi.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select name="condizione" defaultValue={condizione ?? "tutti"}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Condizione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte le condizioni</SelectItem>
                {CONDIZIONI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select name="proprieta" defaultValue={proprieta ?? "tutti"}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Proprieta'" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte le proprieta&apos;</SelectItem>
                <SelectItem value="FP">FP</SelectItem>
                <SelectItem value="CV">CV</SelectItem>
              </SelectContent>
            </Select>

            <Select name="bloccato" defaultValue={bloccato ?? "tutti"}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Bloccato vendita" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Bloccato: tutti</SelectItem>
                <SelectItem value="si">Solo bloccati</SelectItem>
                <SelectItem value="no">Solo non bloccati</SelectItem>
              </SelectContent>
            </Select>

            <Select name="disponibilita" defaultValue={disponibilita ?? "tutti"}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Disponibilita'" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Disponibilita&apos;: tutti</SelectItem>
                <SelectItem value="disponibile">Disponibile (&gt;0)</SelectItem>
                <SelectItem value="esaurito">Esaurito (=0)</SelectItem>
              </SelectContent>
            </Select>

            <Select name="senzafoto" defaultValue={senzaFoto ? "si" : "no"}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Foto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Foto: tutti</SelectItem>
                <SelectItem value="si">Solo senza foto</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit" variant="secondary">Applica filtri</Button>
            {filtriAttivi && (
              <Button asChild type="button" variant="ghost" size="sm"><Link href="/"><X /> Azzera filtri</Link></Button>
            )}
          </div>
        </form>

        <div className="rounded-xl border">
          {righe.length === 0 ? (
            <TableEmpty><p className="font-medium text-foreground">Nessuno sku trovato</p><p>Prova a modificare la ricerca o i filtri.</p></TableEmpty>
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
