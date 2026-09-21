import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import {
  getSkuById,
  getTipiOggetto,
  getUbicazioniAttive,
  getMovimentiSku,
  getFotoSku,
} from "@/db/queries";
import { modificaSku, eliminaFotoSku } from "@/app/magazzino/actions";
import { MovimentoForm } from "./movimento-form";
import { FotoForm } from "./foto-form";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const MESSAGGI: Record<string, string> = {
  creato: "Sku creato.",
  carico: "Carico registrato.",
  salvato: "Modifiche salvate.",
  movimento: "Movimento registrato.",
  foto: "Foto caricata su Shopify CDN.",
  fotoeliminata: "Foto rimossa dalla galleria.",
};

// Questa pagina legge dal database: va costruita a ogni richiesta, mai
// "pre-generata" durante la build (in build il database non esiste).
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
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft /> Torna al Magazzino
          </Link>
        </Button>

        {esito && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            {MESSAGGI[esito]}
          </div>
        )}

        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight">{item.skuCode}</h1>
            <p className="text-sm text-muted-foreground">
              {item.artista} — {item.opera}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Disponibile: <span className="font-medium text-foreground">{disponibile}</span>
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Dati sku</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={modificaSku} className="flex flex-col gap-6">
              <input type="hidden" name="id" value={item.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="artista">Artista *</Label>
                  <Input id="artista" name="artista" defaultValue={item.artista} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="opera">Opera *</Label>
                  <Input id="opera" name="opera" defaultValue={item.opera} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="larghezza">Larghezza (cm)</Label>
                  <Input id="larghezza" name="larghezza" inputMode="decimal" defaultValue={item.larghezza ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="altezza">Altezza (cm)</Label>
                  <Input id="altezza" name="altezza" inputMode="decimal" defaultValue={item.altezza ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="supporto">Supporto</Label>
                  <Input id="supporto" name="supporto" defaultValue={item.supporto ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anno">Anno / epoca</Label>
                  <Input id="anno" name="anno" defaultValue={item.anno ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tipoId">Tipo</Label>
                  <Select name="tipoId" defaultValue={String(item.tipoId)}>
                    <SelectTrigger id="tipoId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tipi.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="condizione">Condizione</Label>
                  <Select name="condizione" defaultValue={item.condizione}>
                    <SelectTrigger id="condizione">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDIZIONI.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="tag">Tag (testo libero)</Label>
                  <Input id="tag" name="tag" defaultValue={item.tag ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="note">Note</Label>
                  <Input id="note" name="note" defaultValue={item.note ?? ""} />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium text-muted-foreground">Dati commerciali</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="valoreCarico">Valore di carico</Label>
                    <Input id="valoreCarico" name="valoreCarico" inputMode="decimal" defaultValue={item.valoreCarico ?? ""} placeholder="€ (obbligatorio se FP)" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="prezzoEbay">Prezzo eBay</Label>
                    <Input id="prezzoEbay" name="prezzoEbay" inputMode="decimal" defaultValue={item.prezzoEbay ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="prezzoCatawiki">Prezzo Catawiki</Label>
                    <Input id="prezzoCatawiki" name="prezzoCatawiki" inputMode="decimal" defaultValue={item.prezzoCatawiki ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="riservaCatawiki">Riserva Catawiki</Label>
                    <Input id="riservaCatawiki" name="riservaCatawiki" inputMode="decimal" defaultValue={item.riservaCatawiki ?? ""} />
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="bloccatoVendita" defaultChecked={item.bloccatoVendita} />
                Bloccato per la vendita (escluso da tutti i portali)
              </label>

              <div>
                <Button type="submit">Salva modifiche</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Foto</CardTitle>
            <CardDescription>
              Galleria ordinata su Shopify CDN — la prima e&apos; la copertina.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {foto.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {foto.map((f, i) => (
                  <div key={f.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt=""
                      className="size-24 rounded-md border object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                        copertina
                      </span>
                    )}
                    <form action={eliminaFotoSku} className="absolute -right-2 -top-2">
                      <input type="hidden" name="fotoId" value={f.id} />
                      <input type="hidden" name="skuId" value={item.id} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="icon"
                        className="size-5 rounded-full"
                        title="Rimuovi foto"
                      >
                        ×
                      </Button>
                    </form>
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
            <CardDescription>
              La quantita&apos; disponibile e&apos; sempre calcolata dalla somma di questi movimenti.
            </CardDescription>
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
                        <TableCell className="text-muted-foreground">
                          {formatData(m.createdAt)}
                        </TableCell>
                        <TableCell>{m.causale}</TableCell>
                        <TableCell>{m.proprieta}</TableCell>
                        <TableCell>{m.ubicazione}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${m.quantitaDelta < 0 ? "text-destructive" : ""}`}
                        >
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
