import { notFound } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { getSkuById, getTipiOggetto, getUbicazioniAttive, getMovimentiSku, getFotoSku } from "@/db/queries";
import { eliminaFotoSku, spostaFotoSku } from "@/app/magazzino/actions";
import { MovimentoForm } from "./movimento-form";
import { FotoForm } from "./foto-form";
import { SchedaSkuForm } from "./scheda-form";

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

export default async function ModificaSkuPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { id } = await params;
  const skuId = Number(id);
  const sp = await searchParams;
  const esito = sp.creato
    ? "creato"
    : sp.carico
      ? "carico"
      : sp.salvato
        ? "salvato"
        : sp.movimento
          ? "movimento"
          : sp.foto
            ? "foto"
            : sp.fotoeliminata
              ? "fotoeliminata"
              : undefined;

  const [item, tipi, ubicazioni, movimenti, foto] = await Promise.all([
    getSkuById(skuId),
    getTipiOggetto(),
    getUbicazioniAttive(),
    getMovimentiSku(skuId),
    getFotoSku(skuId),
  ]);

  if (!item) notFound();

  const disponibile = movimenti.reduce((tot, m) => tot + m.quantitaDelta, 0);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <SchedaSkuForm item={item} tipi={tipi} disponibile={disponibile} esito={esito} />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Foto</CardTitle>
            <CardDescription>Galleria ordinata su Shopify CDN — la prima e&apos; la copertina.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {foto.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {foto.map((f, i) => (
                  <div key={f.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="size-24 rounded-md border object-cover" />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">copertina</span>
                    )}
                    <form action={eliminaFotoSku} className="absolute -right-2 -top-2">
                      <input type="hidden" name="fotoId" value={f.id} />
                      <input type="hidden" name="skuId" value={item.id} />
                      <Button type="submit" variant="destructive" size="icon" className="size-5 rounded-full" title="Rimuovi foto">×</Button>
                    </form>
                    <div className="absolute -left-2 -bottom-2 flex flex-col gap-0.5">
                      <form action={spostaFotoSku}>
                        <input type="hidden" name="fotoId" value={f.id} />
                        <input type="hidden" name="skuId" value={item.id} />
                        <input type="hidden" name="direzione" value="su" />
                        <Button type="submit" variant="secondary" size="icon" className="size-5 rounded-full" title="Sposta su (copertina se in cima)" disabled={i === 0}>
                          <ChevronUp className="size-3" />
                        </Button>
                      </form>
                      <form action={spostaFotoSku}>
                        <input type="hidden" name="fotoId" value={f.id} />
                        <input type="hidden" name="skuId" value={item.id} />
                        <input type="hidden" name="direzione" value="giu" />
                        <Button type="submit" variant="secondary" size="icon" className="size-5 rounded-full" title="Sposta giu'" disabled={i === foto.length - 1}>
                          <ChevronDown className="size-3" />
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <FotoForm skuId={item.id} />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Movimenti</CardTitle>
            <CardDescription>La quantita&apos; disponibile e&apos; sempre calcolata dalla somma di questi movimenti.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MovimentoForm skuId={item.id} ubicazioni={ubicazioni} />
            <div className="rounded-lg border">
              {movimenti.length === 0 ? (
                <TableEmpty>Nessun movimento registrato.</TableEmpty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Causale</TableHead>
                      <TableHead>Proprieta&apos;</TableHead>
                      <TableHead>Ubicazione</TableHead>
                      <TableHead className="text-right">Quantita&apos;</TableHead>
                      <TableHead>Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimenti.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-muted-foreground">{formatData(m.createdAt)}</TableCell>
                        <TableCell>{m.causale}</TableCell>
                        <TableCell>{m.proprieta}</TableCell>
                        <TableCell>{m.ubicazione}</TableCell>
                        <TableCell className={`text-right tabular-nums ${m.quantitaDelta < 0 ? "text-destructive" : ""}`}>
                          {m.quantitaDelta > 0 ? `+${m.quantitaDelta}` : m.quantitaDelta}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
