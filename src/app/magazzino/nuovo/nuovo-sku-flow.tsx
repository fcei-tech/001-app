"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cercaCandidati,
  creaNuovoSku,
  aggiungiCaricoSkuEsistente,
} from "@/app/magazzino/actions";

type Candidato = Awaited<ReturnType<typeof cercaCandidati>>[number];
type Vocabolario = { id: number; nome: string }[];

export function NuovoSkuFlow({
  tipi,
  ubicazioni,
}: {
  tipi: Vocabolario;
  ubicazioni: Vocabolario;
}) {
  const [query, setQuery] = React.useState("");
  const [candidati, setCandidati] = React.useState<Candidato[]>([]);
  const [cercando, setCercando] = React.useState(false);
  const [mostraForm, setMostraForm] = React.useState(false);
  const [candidatoScelto, setCandidatoScelto] = React.useState<Candidato | null>(null);

  // Ricerca con debounce: un effect che sottoscrive un timer esterno e
  // aggiorna lo stato in risposta e' il caso d'uso legittimo per un effect
  // (vedi https://react.dev/learn/you-might-not-need-an-effect#debouncing).
  React.useEffect(() => {
    if (!query.trim()) return;
    let annullato = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCercando(true);
    const t = setTimeout(() => {
      cercaCandidati(query).then((risultati) => {
        if (annullato) return;
        setCandidati(risultati);
        setCercando(false);
      });
    }, 300);
    return () => {
      annullato = true;
      clearTimeout(t);
    };
  }, [query]);

  if (candidatoScelto) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carica su sku esistente</CardTitle>
          <CardDescription>
            {candidatoScelto.skuCode} — {candidatoScelto.artista}, {candidatoScelto.opera}
            {" "}(disponibili oggi: {candidatoScelto.quantitaDisponibile})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={aggiungiCaricoSkuEsistente} className="flex flex-col gap-4 max-w-sm">
            <input type="hidden" name="skuId" value={candidatoScelto.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proprieta">Proprieta&apos;</Label>
              <Select name="proprieta" defaultValue="FP">
                <SelectTrigger id="proprieta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FP">FP</SelectItem>
                  <SelectItem value="CV">CV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ubicazioneId">Ubicazione</Label>
              <Select name="ubicazioneId" defaultValue={String(ubicazioni[0]?.id ?? "")}>
                <SelectTrigger id="ubicazioneId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ubicazioni.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantita">Quantita&apos; caricata</Label>
              <Input id="quantita" name="quantita" type="number" min={1} defaultValue={1} required />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Aggiungi carico</Button>
              <Button type="button" variant="ghost" onClick={() => setCandidatoScelto(null)}>
                Annulla
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (mostraForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nuovo sku</CardTitle>
          <CardDescription>Verra&apos; generato il prossimo codice Z-NNNNN disponibile.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={creaNuovoSku} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="artista">Artista *</Label>
                <Input id="artista" name="artista" defaultValue={query} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opera">Opera *</Label>
                <Input id="opera" name="opera" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="larghezza">Larghezza (cm)</Label>
                <Input id="larghezza" name="larghezza" inputMode="decimal" placeholder="es. 70" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="altezza">Altezza (cm)</Label>
                <Input id="altezza" name="altezza" inputMode="decimal" placeholder="es. 100" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supporto">Supporto</Label>
                <Input id="supporto" name="supporto" placeholder="es. CARTA, TELATO" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="anno">Anno / epoca</Label>
                <Input id="anno" name="anno" placeholder="es. circa 1965" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tipoId">Tipo</Label>
                <Select name="tipoId" defaultValue={String(tipi[0]?.id ?? "")}>
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
                <Select name="condizione" defaultValue="A-">
                  <SelectTrigger id="condizione">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A", "A-", "B+", "B", "B-", "C"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                Dove va caricato (facoltativo, puoi anche lasciare a magazzino senza copie)
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="proprieta">Proprieta&apos;</Label>
                  <Select name="proprieta" defaultValue="FP">
                    <SelectTrigger id="proprieta">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FP">FP</SelectItem>
                      <SelectItem value="CV">CV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ubicazioneId">Ubicazione</Label>
                  <Select name="ubicazioneId" defaultValue={String(ubicazioni[0]?.id ?? "")}>
                    <SelectTrigger id="ubicazioneId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ubicazioni.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantita">Quantita&apos;</Label>
                  <Input id="quantita" name="quantita" type="number" min={0} defaultValue={1} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                Dati commerciali (facoltativi, puoi compilarli dopo)
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="valoreCarico">Valore di carico</Label>
                  <Input id="valoreCarico" name="valoreCarico" inputMode="decimal" placeholder="€ (obbligatorio se FP)" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prezzoEbay">Prezzo eBay</Label>
                  <Input id="prezzoEbay" name="prezzoEbay" inputMode="decimal" placeholder="€" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prezzoCatawiki">Prezzo Catawiki</Label>
                  <Input id="prezzoCatawiki" name="prezzoCatawiki" inputMode="decimal" placeholder="€" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="riservaCatawiki">Riserva Catawiki</Label>
                  <Input id="riservaCatawiki" name="riservaCatawiki" inputMode="decimal" placeholder="€" />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">Crea sku</Button>
              <Button type="button" variant="ghost" onClick={() => setMostraForm(false)}>
                Annulla
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuovo sku</CardTitle>
        <CardDescription>
          Prima cerchiamo se esiste gia&apos; — stesso artista/opera vuol dire aggiungere copie,
          non duplicare lo sku.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Artista o opera..."
            className="pl-8"
          />
        </div>

        {query.trim() && (
          <div className="rounded-lg border divide-y">
            {cercando ? (
              <p className="p-4 text-sm text-muted-foreground">Cerco...</p>
            ) : candidati.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nessun risultato per &quot;{query}&quot;.</p>
            ) : (
              candidati.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCandidatoScelto(c)}
                  className="flex w-full items-center justify-between gap-4 p-3 text-left text-sm hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">
                      {c.artista} — {c.opera}
                    </p>
                    <p className="text-muted-foreground">
                      {c.skuCode} · {c.larghezza ?? "?"} × {c.altezza ?? "?"} cm
                      {c.supporto ? ` · ${c.supporto}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{c.quantitaDisponibile} disp.</Badge>
                </button>
              ))
            )}
          </div>
        )}

        <div>
          <Button type="button" variant="outline" onClick={() => setMostraForm(true)}>
            <Plus /> Nessuno di questi, crea nuovo sku
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
