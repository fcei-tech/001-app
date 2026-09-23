"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Search, Columns3, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { RigaMagazzino, ColonnaOrdinabile } from "@/db/queries";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

// Chiave localStorage per ricordare le colonne scelte da questo utente su
// questo Mac - preferenza personale di visualizzazione, non un dato del
// Magazzino: non sincronizzata, non salvata nel database.
const CHIAVE_COLONNE = "posterclub.magazzino.colonneVisibili.v1";

type ColonnaId =
  | "artista"
  | "opera"
  | "misura"
  | "supporto"
  | "anno"
  | "tipo"
  | "condizione"
  | "proprieta"
  | "disponibile"
  | "numeroFoto"
  | "valoreCarico"
  | "prezzoEbay"
  | "prezzoCatawiki"
  | "riservaCatawiki"
  | "tag"
  | "note"
  | "stato"
  | "creato"
  | "aggiornato";

type DefinizioneColonna = {
  id: ColonnaId;
  etichetta: string;
  defaultVisibile: boolean;
  allineaDestra?: boolean;
  render: (r: RigaMagazzino) => React.ReactNode;
};

function formatMisura(l: string | null, h: string | null) {
  if (!l && !h) return "—";
  return `${l ?? "?"} × ${h ?? "?"} cm`;
}
function formatEuro(v: string | null) {
  return v ? `€ ${v}` : "—";
}
function formatData(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}
function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

// Colonne su cui e' possibile ordinare la lista cliccando l'intestazione
// (2026-09-23) -> chiave lato server in src/db/queries.ts/ColonnaOrdinabile.
// "misura" (colonna visiva L x H) ordina per larghezza, unica dimensione
// numerica delle due - stessa semplificazione gia' notata nel delta.
const MAPPA_ORDINABILI: Partial<Record<ColonnaId, ColonnaOrdinabile>> = {
  artista: "artista",
  opera: "opera",
  misura: "larghezza",
  supporto: "supporto",
  anno: "anno",
  tipo: "tipo",
  condizione: "condizione",
};

function IntestazioneOrdinabile({
  etichetta,
  chiave,
  attiva,
  direzione,
  allineaDestra,
  onOrdina,
}: {
  etichetta: string;
  chiave: ColonnaOrdinabile;
  attiva: boolean;
  direzione: "asc" | "desc";
  allineaDestra?: boolean;
  onOrdina: (chiave: ColonnaOrdinabile) => void;
}) {
  const Icona = attiva ? (direzione === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead className={allineaDestra ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onOrdina(chiave)}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${attiva ? "font-medium text-foreground" : "text-muted-foreground"}`}
      >
        {etichetta}
        <Icona className={`size-3.5 ${attiva ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

// Elenco colonne opzionali. Per aggiungerne una nuova in futuro: un'altra
// voce qui (con render) + un'intestazione nella riga TableHeader sotto.
const COLONNE: DefinizioneColonna[] = [
  { id: "artista", etichetta: "Artista", defaultVisibile: true, render: (r) => r.artista },
  { id: "opera", etichetta: "Opera", defaultVisibile: true, render: (r) => r.opera },
  { id: "misura", etichetta: "Misura", defaultVisibile: true, render: (r) => <span className="text-muted-foreground">{formatMisura(r.larghezza, r.altezza)}</span> },
  { id: "supporto", etichetta: "Supporto", defaultVisibile: false, render: (r) => r.supporto ?? "—" },
  { id: "anno", etichetta: "Anno / epoca", defaultVisibile: false, render: (r) => r.anno ?? "—" },
  { id: "tipo", etichetta: "Tipo", defaultVisibile: true, render: (r) => <span className="text-muted-foreground">{r.tipo}</span> },
  { id: "condizione", etichetta: "Condizione", defaultVisibile: true, render: (r) => <Badge variant={condizioneVariant(r.condizione)}>{r.condizione}</Badge> },
  { id: "proprieta", etichetta: "Proprietà", defaultVisibile: false, render: (r) => r.proprieta || "—" },
  { id: "disponibile", etichetta: "Disponibile", defaultVisibile: true, allineaDestra: true, render: (r) => r.quantitaDisponibile },
  { id: "numeroFoto", etichetta: "N. foto", defaultVisibile: false, allineaDestra: true, render: (r) => r.numeroFoto },
  { id: "valoreCarico", etichetta: "Valore di carico", defaultVisibile: false, allineaDestra: true, render: (r) => formatEuro(r.valoreCarico) },
  { id: "prezzoEbay", etichetta: "Prezzo eBay", defaultVisibile: true, allineaDestra: true, render: (r) => formatEuro(r.prezzoEbay) },
  { id: "prezzoCatawiki", etichetta: "Prezzo Catawiki", defaultVisibile: false, allineaDestra: true, render: (r) => formatEuro(r.prezzoCatawiki) },
  { id: "riservaCatawiki", etichetta: "Riserva Catawiki", defaultVisibile: false, allineaDestra: true, render: (r) => formatEuro(r.riservaCatawiki) },
  { id: "tag", etichetta: "Tag", defaultVisibile: false, render: (r) => r.tag ?? "—" },
  { id: "note", etichetta: "Note", defaultVisibile: false, render: (r) => r.note ?? "—" },
  { id: "stato", etichetta: "Stato", defaultVisibile: true, render: (r) => (r.bloccatoVendita ? <Badge variant="destructive">Bloccato</Badge> : <span className="text-muted-foreground">—</span>) },
  { id: "creato", etichetta: "Creato il", defaultVisibile: false, render: (r) => <span className="text-muted-foreground">{formatData(r.createdAt)}</span> },
  { id: "aggiornato", etichetta: "Aggiornato il", defaultVisibile: false, render: (r) => <span className="text-muted-foreground">{formatData(r.updatedAt)}</span> },
];

function colonneDiDefault(): Record<ColonnaId, boolean> {
  return Object.fromEntries(COLONNE.map((c) => [c.id, c.defaultVisibile])) as Record<ColonnaId, boolean>;
}

// Store esterno minimo per le colonne visibili (preferenza salvata in
// localStorage). Usare useSyncExternalStore invece di un useEffect+setState
// evita il mismatch di idratazione in modo pulito: il server e la prima
// passata client vedono sempre lo stesso oggetto di default, il valore vero
// letto dal browser arriva subito dopo, senza render lampo scorretti.
//
// Il default va calcolato UNA sola volta a livello di modulo: getServerSnapshot
// (il terzo argomento di useSyncExternalStore) deve restituire sempre lo
// stesso riferimento fra una chiamata e l'altra, altrimenti React avvisa
// "getServerSnapshot should be cached to avoid an infinite loop" - chiamare
// colonneDiDefault() ad ogni render creava un oggetto nuovo ogni volta.
const COLONNE_DI_DEFAULT = colonneDiDefault();

let colonneCache: Record<ColonnaId, boolean> | null = null;
const colonneListeners = new Set<() => void>();

function leggiColonneSalvate(): Record<ColonnaId, boolean> {
  if (colonneCache) return colonneCache;
  if (typeof window === "undefined") return COLONNE_DI_DEFAULT;
  try {
    const salvate = window.localStorage.getItem(CHIAVE_COLONNE);
    colonneCache = salvate
      ? { ...COLONNE_DI_DEFAULT, ...(JSON.parse(salvate) as Partial<Record<ColonnaId, boolean>>) }
      : COLONNE_DI_DEFAULT;
  } catch {
    colonneCache = COLONNE_DI_DEFAULT;
  }
  return colonneCache;
}

function scriviColonneSalvate(next: Record<ColonnaId, boolean>) {
  colonneCache = next;
  try {
    window.localStorage.setItem(CHIAVE_COLONNE, JSON.stringify(next));
  } catch {
    // preferenza non salvata (es. storage pieno/bloccato) - non blocca l'uso
  }
  colonneListeners.forEach((l) => l());
}

function sottoscriviColonne(listener: () => void) {
  colonneListeners.add(listener);
  return () => colonneListeners.delete(listener);
}

export type FiltriIniziali = {
  q: string;
  tipo: string;
  condizione: string;
  proprieta: string;
  bloccato: string;
  disponibilita: string;
  senzafoto: string;
};

export function VistaMagazzino({
  righe,
  tipi,
  filtriIniziali,
  filtriAttivi,
  ordinaAttuale,
  direzioneAttuale,
}: {
  righe: RigaMagazzino[];
  tipi: { id: number; nome: string }[];
  filtriIniziali: FiltriIniziali;
  filtriAttivi: boolean;
  ordinaAttuale?: ColonnaOrdinabile;
  direzioneAttuale: "asc" | "desc";
}) {
  const router = useRouter();
  const [filtri, setFiltri] = useState(filtriIniziali);
  const ordinamentoCorrente: ColonnaOrdinabile = ordinaAttuale ?? "skuCode";
  const colonne = useSyncExternalStore(sottoscriviColonne, leggiColonneSalvate, () => COLONNE_DI_DEFAULT);

  function impostaColonna(id: ColonnaId, visibile: boolean) {
    scriviColonneSalvate({ ...colonne, [id]: visibile });
  }

  const colonneVisibili = useMemo(() => COLONNE.filter((c) => colonne[c.id]), [colonne]);

  // ordinaOverride/direzioneOverride sono passati SOLO dal click su
  // un'intestazione ordinabile - in quel caso sostituiscono l'ordinamento
  // corrente mantenendo i filtri; un submit normale del form (bottone
  // "Applica filtri" o azzeraFiltri sotto) mantiene invece l'ordinamento
  // gia' attivo, per non perderlo ogni volta che si tocca un filtro.
  function applicaFiltri(f: typeof filtri, ordinaOverride?: ColonnaOrdinabile, direzioneOverride?: "asc" | "desc") {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.tipo !== "tutti") params.set("tipo", f.tipo);
    if (f.condizione !== "tutti") params.set("condizione", f.condizione);
    if (f.proprieta !== "tutti") params.set("proprieta", f.proprieta);
    if (f.bloccato !== "tutti") params.set("bloccato", f.bloccato);
    if (f.disponibilita !== "tutti") params.set("disponibilita", f.disponibilita);
    if (f.senzafoto === "si") params.set("senzafoto", "si");
    const ordinaFinale = ordinaOverride ?? ordinaAttuale;
    const direzioneFinale = ordinaOverride ? (direzioneOverride ?? "asc") : direzioneAttuale;
    if (ordinaFinale) params.set("ordina", ordinaFinale);
    if (ordinaFinale && direzioneFinale === "desc") params.set("direzione", "desc");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  function azzeraFiltri() {
    const vuoti: typeof filtri = { q: "", tipo: "tutti", condizione: "tutti", proprieta: "tutti", bloccato: "tutti", disponibilita: "tutti", senzafoto: "no" };
    setFiltri(vuoti);
    applicaFiltri(vuoti);
  }

  function gestisciOrdinamento(chiave: ColonnaOrdinabile) {
    const attiva = ordinamentoCorrente === chiave;
    const prossimaDirezione: "asc" | "desc" = attiva && direzioneAttuale === "asc" ? "desc" : "asc";
    applicaFiltri(filtri, chiave, prossimaDirezione);
  }

  return (
    <>
      <form
        className="mb-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          applicaFiltri(filtri);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtri.q}
              onChange={(e) => setFiltri((f) => ({ ...f, q: e.target.value }))}
              placeholder="Cerca artista, opera o sku..."
              className="pl-8"
            />
          </div>

          <Select value={filtri.tipo} onValueChange={(v) => setFiltri((f) => ({ ...f, tipo: v }))}>
            <SelectTrigger className="w-40" aria-label="Tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i tipi</SelectItem>
              {tipi.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtri.condizione} onValueChange={(v) => setFiltri((f) => ({ ...f, condizione: v }))}>
            <SelectTrigger className="w-36" aria-label="Condizione"><SelectValue placeholder="Condizione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte le condizioni</SelectItem>
              {CONDIZIONI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtri.proprieta} onValueChange={(v) => setFiltri((f) => ({ ...f, proprieta: v }))}>
            <SelectTrigger className="w-36" aria-label="Proprieta'"><SelectValue placeholder="Proprieta'" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte le proprieta&apos;</SelectItem>
              <SelectItem value="FP">FP</SelectItem>
              <SelectItem value="CV">CV</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtri.bloccato} onValueChange={(v) => setFiltri((f) => ({ ...f, bloccato: v }))}>
            <SelectTrigger className="w-44" aria-label="Bloccato vendita"><SelectValue placeholder="Bloccato vendita" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Bloccato: tutti</SelectItem>
              <SelectItem value="si">Solo bloccati</SelectItem>
              <SelectItem value="no">Solo non bloccati</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtri.disponibilita} onValueChange={(v) => setFiltri((f) => ({ ...f, disponibilita: v }))}>
            <SelectTrigger className="w-44" aria-label="Disponibilita'"><SelectValue placeholder="Disponibilita'" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Disponibilita&apos;: tutti</SelectItem>
              <SelectItem value="disponibile">Disponibile (&gt;0)</SelectItem>
              <SelectItem value="esaurito">Esaurito (=0)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtri.senzafoto} onValueChange={(v) => setFiltri((f) => ({ ...f, senzafoto: v }))}>
            <SelectTrigger className="w-40" aria-label="Foto"><SelectValue placeholder="Foto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Foto: tutti</SelectItem>
              <SelectItem value="si">Solo senza foto</SelectItem>
            </SelectContent>
          </Select>

          <Button type="submit" variant="secondary">Applica filtri</Button>
          {filtriAttivi && (
            <Button type="button" variant="ghost" size="sm" onClick={azzeraFiltri}>
              <X /> Azzera filtri
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="ml-auto">
                <Columns3 /> Colonne
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
              <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLONNE.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={colonne[c.id]}
                  onCheckedChange={(v) => impostaColonna(c.id, v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.etichetta}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </form>

      <div className="rounded-xl border overflow-x-auto">
        {righe.length === 0 ? (
          <TableEmpty><p className="font-medium text-foreground">Nessuno sku trovato</p><p>Prova a modificare la ricerca o i filtri.</p></TableEmpty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <IntestazioneOrdinabile
                  etichetta="SKU"
                  chiave="skuCode"
                  attiva={ordinamentoCorrente === "skuCode"}
                  direzione={direzioneAttuale}
                  onOrdina={gestisciOrdinamento}
                />
                {colonneVisibili.map((c) => {
                  const chiaveOrdinamento = MAPPA_ORDINABILI[c.id];
                  if (!chiaveOrdinamento) {
                    return (
                      <TableHead key={c.id} className={c.allineaDestra ? "text-right" : undefined}>{c.etichetta}</TableHead>
                    );
                  }
                  return (
                    <IntestazioneOrdinabile
                      key={c.id}
                      etichetta={c.etichetta}
                      chiave={chiaveOrdinamento}
                      attiva={ordinamentoCorrente === chiaveOrdinamento}
                      direzione={direzioneAttuale}
                      allineaDestra={c.allineaDestra}
                      onOrdina={gestisciOrdinamento}
                    />
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block font-mono text-xs p-3">{r.skuCode}</Link></TableCell>
                  {colonneVisibili.map((c) => (
                    <TableCell key={c.id} className={c.allineaDestra ? "text-right tabular-nums" : undefined}>
                      {c.render(r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
