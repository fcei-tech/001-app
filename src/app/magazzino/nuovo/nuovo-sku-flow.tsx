"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CasellaRegistro } from "@/components/magazzino/casella-registro";
import { CampiPrezzi } from "@/components/magazzino/campi-prezzi";
import { PerPubblicare } from "@/components/magazzino/per-pubblicare";
import { CampoPersonalizzatoInput } from "@/components/magazzino/campo-personalizzato-input";
import { SelettoreFamiglie, type FamigliaOpzione } from "@/components/magazzino/selettore-famiglie";
import type { CampoPersonalizzato } from "@/lib/campi-personalizzati";
import type { RegolePrezzi } from "@/lib/regole-prezzi-config";
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
import { SelettoreProprietario, type ProprietarioOpzione } from "@/components/magazzino/selettore-proprietario";
import {
  cercaCandidati,
  creaNuovoSku,
  aggiungiCaricoSkuEsistente,
} from "@/app/magazzino/actions";

type Candidato = Awaited<ReturnType<typeof cercaCandidati>>[number];

// Sku di partenza per "Duplica": il form si apre gia' compilato, nessun salvataggio finche' non si preme Salva.
export type DuplicaDa = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  note: string | null;
  tipoId: number;
  condizione: string;
  valoreCarico: string | null;
  prezzoEbay: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
  prezzoShopify: string | null;
  prezzoSubito: string | null;
  prezzoBidspirit: string | null;
  riservaBidspirit: string | null;
  valoriCampi: Record<number, string | number | boolean>;
  tagIds: number[];
  numeroFoto: number;
};
type Vocabolario = { id: number; nome: string }[];
type UbicazioneOpzione = { id: number; nome: string; tipo: string };

// Deposito predefinito del carico: il primo deposito attivo (per id), come
// nell'importazione Excel; se non ce n'e', la prima ubicazione.
function depositoPredefinito(ubicazioni: UbicazioneOpzione[]): string {
  const d = ubicazioni.filter((u) => u.tipo === "deposito").sort((a, b) => a.id - b.id)[0] ?? ubicazioni[0];
  return String(d?.id ?? "");
}

// Dati che servono per pubblicare (stessi controlli del Magazzino: prezzo eBay,
// prezzo Catawiki sopra soglia, anno/epoca, foto). La foto si aggiunge dalla
// scheda dopo la creazione, quindi qui e' sempre "da fare dopo".
type StatoPubblicazione = { prezzoEbay: boolean; prezzoCatawiki: boolean; anno: boolean };
const STATO_INIZIALE: StatoPubblicazione = { prezzoEbay: false, prezzoCatawiki: false, anno: false };

function leggiStato(form: HTMLFormElement, soglia: number): StatoPubblicazione {
  const fd = new FormData(form);
  const num = (k: string) => Number(String(fd.get(k) ?? "").trim().replace(",", "."));
  const eb = num("prezzoEbay");
  const ca = num("prezzoCatawiki");
  return {
    prezzoEbay: Number.isFinite(eb) && eb > 0,
    prezzoCatawiki: Number.isFinite(ca) && ca >= soglia,
    anno: String(fd.get("anno") ?? "").trim().length > 0,
  };
}

function TitoloSezione({ n, titolo, nota }: { n: number; titolo: string; nota?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium">{n}</span>
      <p className="text-sm font-semibold">{titolo}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export function NuovoSkuFlow({
  tipi,
  ubicazioni,
  proprietari,
  regole,
  campiPersonalizzati,
  famiglie,
  duplicaDa,
}: {
  famiglie: FamigliaOpzione[];
  duplicaDa?: DuplicaDa;
  regole: RegolePrezzi;
  campiPersonalizzati: CampoPersonalizzato[];
  tipi: Vocabolario;
  ubicazioni: UbicazioneOpzione[];
  proprietari: ProprietarioOpzione[];
}) {
  const [query, setQuery] = React.useState("");
  const [candidati, setCandidati] = React.useState<Candidato[]>([]);
  const [cercando, setCercando] = React.useState(false);
  const [mostraForm, setMostraForm] = React.useState(Boolean(duplicaDa));
  const [artistaForm, setArtistaForm] = React.useState(duplicaDa?.artista ?? "");
  const [operaForm, setOperaForm] = React.useState(duplicaDa?.opera ?? "");
  const [nFamiglie, setNFamiglie] = React.useState(duplicaDa?.tagIds.length ?? 0);
  const [copiaFoto, setCopiaFoto] = React.useState(false);
  const [candidatoScelto, setCandidatoScelto] = React.useState<Candidato | null>(null);
  const [stato, setStato] = React.useState<StatoPubblicazione>(() => {
    if (!duplicaDa) return STATO_INIZIALE;
    const eb = Number(String(duplicaDa.prezzoEbay ?? "").replace(",", "."));
    const ca = Number(String(duplicaDa.prezzoCatawiki ?? "").replace(",", "."));
    return {
      prezzoEbay: Number.isFinite(eb) && eb > 0,
      prezzoCatawiki: Number.isFinite(ca) && ca >= regole.sogliaMinimaCatawiki,
      anno: (duplicaDa.anno ?? "").trim().length > 0,
    };
  });

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
              <SelettoreProprietario proprietari={proprietari} idBase="proprietario-esistente" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ubicazioneId">Ubicazione</Label>
              <Select name="ubicazioneId" defaultValue={depositoPredefinito(ubicazioni)}>
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
            <CasellaRegistro id="registro-esistente" name="inRegistro" defaultChecked />
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
          <CardTitle>{duplicaDa ? "Duplica sku" : "Nuovo sku"}</CardTitle>
          <CardDescription>
            {duplicaDa
              ? `Copia di ${duplicaDa.skuCode}. Il codice nuovo si assegna quando salvi.`
              : "Verra' generato il prossimo codice Z-NNNNN disponibile."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={creaNuovoSku}
            className="flex flex-col gap-6"
            onChange={(e) => {
              const f = e.currentTarget;
              setStato(leggiStato(f, regole.sogliaMinimaCatawiki));
              const fd = new FormData(f);
              setArtistaForm(String(fd.get("artista") ?? ""));
              setOperaForm(String(fd.get("opera") ?? ""));
            }}
          >
            {duplicaDa && copiaFoto && <input type="hidden" name="copiaFotoDa" value={duplicaDa.id} />}
            <div>
              <TitoloSezione n={1} titolo="L'opera" nota="* obbligatori per creare lo sku" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="artista">Artista *</Label>
                <Input id="artista" name="artista" defaultValue={duplicaDa?.artista ?? query} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opera">Opera *</Label>
                <Input id="opera" name="opera" defaultValue={duplicaDa?.opera ?? ""} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="larghezza">Larghezza (cm)</Label>
                <Input id="larghezza" name="larghezza" inputMode="decimal" placeholder="es. 70" defaultValue={duplicaDa?.larghezza ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="altezza">Altezza (cm)</Label>
                <Input id="altezza" name="altezza" inputMode="decimal" placeholder="es. 100" defaultValue={duplicaDa?.altezza ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supporto">Supporto</Label>
                <Input id="supporto" name="supporto" placeholder="es. CARTA, TELATO" defaultValue={duplicaDa?.supporto ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="anno">Anno / epoca<PerPubblicare ok={stato.anno} /></Label>
                <Input id="anno" name="anno" placeholder="es. circa 1965" defaultValue={duplicaDa?.anno ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tipoId">Tipo</Label>
                <Select name="tipoId" defaultValue={String(duplicaDa?.tipoId ?? tipi[0]?.id ?? "")}>
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
                <Select name="condizione" defaultValue={duplicaDa?.condizione ?? "A-"}>
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
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="note">Note</Label>
                <Input id="note" name="note" placeholder="facoltative" defaultValue={duplicaDa?.note ?? ""} />
              </div>
            </div>
            {famiglie.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5">
                <Label>Famiglia *</Label>
                <SelettoreFamiglie
                  famiglie={famiglie}
                  iniziali={duplicaDa?.tagIds ?? []}
                  artista={artistaForm}
                  opera={operaForm}
                  suggerisci={!duplicaDa}
                  onCambia={setNFamiglie}
                />
              </div>
            )}
            {duplicaDa && duplicaDa.numeroFoto > 0 && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={copiaFoto} onChange={(e) => setCopiaFoto(e.target.checked)} className="size-4" />
                Copia anche le foto ({duplicaDa.numeroFoto})
              </label>
            )}
            </div>

            <div className="border-t pt-4">
              <TitoloSezione n={2} titolo="Dove va caricato" nota="facoltativo: puoi anche creare lo sku senza copie" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <SelettoreProprietario proprietari={proprietari} idBase="proprietario-nuovo" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ubicazioneId">Ubicazione</Label>
                  <Select name="ubicazioneId" defaultValue={depositoPredefinito(ubicazioni)}>
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
                  <Input id="quantita" name="quantita" type="number" min={0} defaultValue={duplicaDa ? 0 : 1} />
                </div>
              </div>
              <div className="mt-4">
                <CasellaRegistro id="registro-nuovo" name="inRegistro" defaultChecked />
              </div>
            </div>

            <div className="border-t pt-4">
              <TitoloSezione n={3} titolo="Prezzi" nota="facoltativi ora, ma servono per pubblicare" />
              <CampiPrezzi
                regole={regole}
                evidenziaPubblicazione
                iniziali={duplicaDa ?? undefined}
              />
            </div>

            {campiPersonalizzati.length > 0 && (
              <div className="border-t pt-4">
                <TitoloSezione n={4} titolo="Campi personalizzati" nota="i tuoi campi (Impostazioni > Campi personalizzati), tutti facoltativi" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {campiPersonalizzati.map((c) => (
                    <CampoPersonalizzatoInput key={c.id} campo={c} valore={duplicaDa?.valoriCampi[c.id]} />
                  ))}
                </div>
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t bg-card/95 px-6 py-3 backdrop-blur">
              <Button type="submit" disabled={famiglie.length > 0 && nFamiglie === 0}>{duplicaDa ? "Salva copia" : "Crea sku"}</Button>
              {duplicaDa ? (
                <Button asChild variant="ghost">
                  <Link href={`/magazzino/${duplicaDa.id}`}>Annulla</Link>
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setMostraForm(false)}>
                  Annulla
                </Button>
              )}
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Per pubblicare:{" "}
                {([
                  [stato.prezzoEbay, "prezzo eBay"],
                  [stato.prezzoCatawiki, `prezzo Catawiki (da ${regole.sogliaMinimaCatawiki} €)`],
                  [stato.anno, "anno"],
                ] as const).map(([ok, nome], i) => (
                  <span key={nome} className={ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-400"}>
                    {i > 0 && " · "}
                    {ok ? "✓ " : "mancano: "}
                    {nome}
                  </span>
                ))}
                <span> · foto: si aggiunge dalla scheda dopo la creazione</span>
              </p>
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
          <Button type="button" variant="outline" onClick={() => { setArtistaForm(query); setOperaForm(""); setMostraForm(true); }}>
            <Plus /> Nessuno di questi, crea nuovo sku
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
