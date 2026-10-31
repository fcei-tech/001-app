"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Columns3, X, ArrowUp, ArrowDown, ArrowUpDown, Undo2, RotateCcw, TriangleAlert, Pencil, Ellipsis, Warehouse, ChevronDown } from "lucide-react";
import type { RigaMagazzino, ColonnaOrdinabile } from "@/db/queries";
import { aggiornaCampiSkuInline, spostaSkuInDeposito, correggiQuantita, annullaMovimenti, annullaMovimentiMultipli, togliDalRegistro } from "@/app/magazzino/actions";
import { CasellaRegistro } from "@/components/magazzino/casella-registro";
import { GiacenzaSku } from "@/app/magazzino/[id]/giacenza-sku";
import { CellaQuantita } from "@/components/magazzino/cella-quantita";
import type { GiacenzaRiga } from "@/lib/giacenza";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import {
  CAMPI_EDITABILI_INLINE,
  type CampoEditabileInline,
  type ValoreCampoInline,
  type VoceModificaInline,
} from "@/lib/campi-inline";
import { annullaEsposizioneAction, ritiraDaPortaliAction } from "@/app/pubblicazione/esposizione-actions";
import type { DaSistemare } from "@/db/portale-queries";
import { CellTesto, CellSelect, CellMisura } from "@/components/magazzino/editable-cell";
import { FiltroTag } from "@/components/tag/filtro-tag";
import { BarraFiltri, CampoFiltro, Scorciatoia, type ChipFiltro } from "@/components/filtri/barra-filtri";
import { MenuOrdina } from "@/components/filtri/menu-ordina";
import { MenuViste } from "@/components/filtri/menu-viste";
import { BarraSelezione } from "@/components/filtri/barra-selezione";
import { AssegnaTagSelezione } from "@/components/tag/assegna-tag-dialog";
import type { TagBreve } from "@/db/tag-queries";
import { leggiTagParam, scriviTagParam } from "@/lib/tag-filtro";
import { campiMancanti, ETICHETTA_CAMPO_MANCANTE, SPIEGAZIONE_CAMPO_MANCANTE } from "@/lib/campi-mancanti-pubblicazione";

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
  | "deposito"
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
  | "aggiornato"
  | "datiMancanti";

// Etichette leggibili dei campi editabili inline - usate sia nella barra di
// modifica in blocco sia nella descrizione del pulsante "Annulla ultima
// modifica" (es. "Condizione di Z-00123", "Condizione → B+ (20 sku)").
const ETICHETTE_CAMPI: Record<CampoEditabileInline, string> = {
  artista: "Artista",
  opera: "Opera",
  larghezza: "Larghezza (cm)",
  altezza: "Altezza (cm)",
  supporto: "Supporto",
  anno: "Anno / epoca",
  tipoId: "Tipo",
  condizione: "Condizione",
  tag: "Tag",
  note: "Note",
  bloccatoVendita: "Bloccato per la vendita",
  valoreCarico: "Valore di carico",
  prezzoEbay: "Prezzo eBay",
  prezzoCatawiki: "Prezzo Catawiki",
  riservaCatawiki: "Riserva Catawiki",
};

// Campi proposti per la modifica in blocco. Esclude larghezza/altezza
// singole: modificarle in blocco su piu' sku e' un caso raro, per ora si fa
// riga per riga con CellMisura (si puo' aggiungere in futuro se serve).
// "tag" escluso (2026-10-30): i tag si assegnano col bottone "Tag…" della barra di selezione.
const CAMPI_BULK = CAMPI_EDITABILI_INLINE.filter((c) => c !== "larghezza" && c !== "altezza" && c !== "tag");

type RenderCtx = {
  tipi: { id: number; nome: string }[];
  salvaTesto: (r: RigaMagazzino, campo: CampoEditabileInline, valore: string) => void;
  salvaMisura: (r: RigaMagazzino, larghezza: string, altezza: string) => void;
  salvaCondizione: (r: RigaMagazzino, valore: string) => void;
  salvaTipo: (r: RigaMagazzino, tipoId: number) => void;
  salvaBloccato: (r: RigaMagazzino, valore: boolean) => void;
  correggiDaTabella: (r: RigaMagazzino, riga: GiacenzaRiga, nuova: number) => void;
  apriGiacenza: (r: RigaMagazzino) => void;
};

type DefinizioneColonna = {
  id: ColonnaId;
  etichetta: string;
  defaultVisibile: boolean;
  allineaDestra?: boolean;
  render: (r: RigaMagazzino, ctx: RenderCtx) => React.ReactNode;
};

function formatEuro(v: string) {
  return `€ ${v}`;
}
function formatData(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}
function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

// REGOLA PERMANENTE (2026-09-23, richiesta esplicita cliente dopo v0.1.18
// parziale): ogni colonna della tabella Magazzino deve essere ordinabile,
// senza eccezioni - non solo un sottoinsieme. Per questo la mappa e' un
// Record TOTALE (non Partial) su ColonnaId: se in futuro si aggiunge una
// voce a ColonnaId senza aggiungerla qui, il progetto non compila piu' -
// impossibile dimenticare una colonna non ordinabile per svista.
// "misura" (colonna visiva L x H) ordina per larghezza, unica dimensione
// numerica delle due - stessa semplificazione gia' notata nel delta.
// Chiavi lato server in src/db/queries.ts/ColonnaOrdinabile (whitelist
// anche in src/app/page.tsx/COLONNE_ORDINABILI per validare il parametro URL).
const MAPPA_ORDINABILI: Record<ColonnaId, ColonnaOrdinabile> = {
  artista: "artista",
  opera: "opera",
  misura: "larghezza",
  supporto: "supporto",
  anno: "anno",
  tipo: "tipo",
  condizione: "condizione",
  proprieta: "proprieta",
  deposito: "deposito",
  disponibile: "disponibile",
  numeroFoto: "numeroFoto",
  valoreCarico: "valoreCarico",
  prezzoEbay: "prezzoEbay",
  prezzoCatawiki: "prezzoCatawiki",
  riservaCatawiki: "riservaCatawiki",
  tag: "tag",
  note: "note",
  stato: "stato",
  creato: "creato",
  aggiornato: "aggiornato",
  datiMancanti: "datiMancanti",
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
// I campi che corrispondono a una colonna vera della tabella sku sono
// editabili inline (click sul valore); proprieta'/disponibile/numeroFoto/
// creato/aggiornato sono derivati (movimenti, foto, timestamp automatici) e
// restano sola lettura - stessa regola gia' concordata per i futuri campi
// calcolati (es. PREZZO_SHOPIFY): mai editabili direttamente.
const COLONNE: DefinizioneColonna[] = [
  {
    id: "artista", etichetta: "Artista", defaultVisibile: true,
    render: (r, ctx) => <CellTesto valore={r.artista} onSalva={(v) => ctx.salvaTesto(r, "artista", v)} />,
  },
  {
    id: "opera", etichetta: "Opera", defaultVisibile: true,
    render: (r, ctx) => <CellTesto valore={r.opera} onSalva={(v) => ctx.salvaTesto(r, "opera", v)} />,
  },
  {
    id: "misura", etichetta: "Misura", defaultVisibile: true,
    render: (r, ctx) => <CellMisura larghezza={r.larghezza} altezza={r.altezza} onSalva={(l, h) => ctx.salvaMisura(r, l, h)} />,
  },
  {
    id: "supporto", etichetta: "Supporto", defaultVisibile: true,
    render: (r, ctx) => <CellTesto valore={r.supporto} onSalva={(v) => ctx.salvaTesto(r, "supporto", v)} />,
  },
  {
    id: "anno", etichetta: "Anno / epoca", defaultVisibile: true,
    render: (r, ctx) => <CellTesto valore={r.anno} onSalva={(v) => ctx.salvaTesto(r, "anno", v)} />,
  },
  {
    id: "tipo", etichetta: "Tipo", defaultVisibile: true,
    render: (r, ctx) => (
      <CellSelect
        display={<span className="text-muted-foreground">{r.tipo}</span>}
        valoreAttuale={String(r.tipoId)}
        opzioni={ctx.tipi.map((t) => ({ value: String(t.id), label: t.nome }))}
        larghezzaClasse="w-36"
        onSalva={(v) => ctx.salvaTipo(r, Number(v))}
      />
    ),
  },
  {
    id: "condizione", etichetta: "Condizione", defaultVisibile: true,
    render: (r, ctx) => (
      <CellSelect
        display={<Badge variant={condizioneVariant(r.condizione)}>{r.condizione}</Badge>}
        valoreAttuale={r.condizione}
        opzioni={CONDIZIONI.map((c) => ({ value: c, label: c }))}
        larghezzaClasse="w-20"
        onSalva={(v) => ctx.salvaCondizione(r, v)}
      />
    ),
  },
  { id: "proprieta", etichetta: "Proprietario", defaultVisibile: false, render: (r, ctx) => (
      <button type="button" onClick={() => ctx.apriGiacenza(r)} title="Clicca per vedere e spostare i pezzi" className="-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded px-1.5 py-1 text-left hover:bg-muted/60">
        {r.proprieta || "—"}
      </button>
    ) },
  { id: "deposito", etichetta: "Deposito", defaultVisibile: true, render: (r) => r.depositi || "—" },
  { id: "disponibile", etichetta: "Disponibile", defaultVisibile: true, allineaDestra: true,
    render: (r, ctx) => (
      <CellaQuantita
        totale={r.quantitaDisponibile}
        giacenze={r.giacenze}
        onSalvaDiretta={(riga, nuovo) => ctx.correggiDaTabella(r, riga, nuovo)}
        onApriGiacenza={() => ctx.apriGiacenza(r)}
      />
    ) },
  { id: "numeroFoto", etichetta: "N. foto", defaultVisibile: true, allineaDestra: true, render: (r) => r.numeroFoto },
  {
    id: "valoreCarico", etichetta: "Valore di carico", defaultVisibile: false, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.valoreCarico} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "valoreCarico", v)} />,
  },
  {
    id: "prezzoEbay", etichetta: "Prezzo eBay", defaultVisibile: true, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.prezzoEbay} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "prezzoEbay", v)} />,
  },
  {
    id: "prezzoCatawiki", etichetta: "Prezzo Catawiki", defaultVisibile: true, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.prezzoCatawiki} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "prezzoCatawiki", v)} />,
  },
  {
    id: "riservaCatawiki", etichetta: "Riserva Catawiki", defaultVisibile: true, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.riservaCatawiki} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "riservaCatawiki", v)} />,
  },
  {
    id: "tag", etichetta: "Tag", defaultVisibile: true,
    // Sola lettura (2026-10-30): i tag si cambiano dalla scheda sku o col bottone "Tag…".
    render: (r) => <span className="text-sm">{r.tag || <span className="text-muted-foreground">—</span>}</span>,
  },
  {
    id: "note", etichetta: "Note", defaultVisibile: false,
    render: (r, ctx) => <CellTesto valore={r.note} onSalva={(v) => ctx.salvaTesto(r, "note", v)} />,
  },
  {
    id: "stato", etichetta: "Stato", defaultVisibile: true,
    render: (r, ctx) => (
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={r.bloccatoVendita} onCheckedChange={(v) => ctx.salvaBloccato(r, v === true)} />
        {r.bloccatoVendita ? <Badge variant="destructive">Bloccato</Badge> : <span className="text-muted-foreground">—</span>}
      </label>
    ),
  },
  {
    // "Dati mancanti" (2026-09-29, richiesta esplicita cliente dopo il test
    // batch #58 - allarme visivo su sku senza le informazioni necessarie
    // alla pubblicazione). Sola lettura, come proprieta'/disponibile/
    // numeroFoto/creato/aggiornato - derivata, non un campo modificabile.
    // Etichette brevi in cella, spiegazione estesa (con la soglia Catawiki)
    // solo nel title/tooltip, altrimenti la cella diventa larghissima con
    // piu' campi mancanti insieme.
    id: "datiMancanti", etichetta: "Dati mancanti", defaultVisibile: true,
    render: (r) => {
      const mancanti = campiMancanti(r);
      if (mancanti.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className="inline-flex items-start gap-1 text-warning"
          title={mancanti.map((m) => SPIEGAZIONE_CAMPO_MANCANTE[m]).join(" · ")}
        >
          <TriangleAlert className="size-3.5 mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{mancanti.map((m) => ETICHETTA_CAMPO_MANCANTE[m]).join(", ")}</span>
        </span>
      );
    },
  },
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

// Traduce una mappa campo->valore (formato server action) in una porzione
// di RigaMagazzino per l'aggiornamento ottimistico locale. Unico caso
// speciale: tipoId non esiste come colonna a se' in RigaMagazzino, la vista
// mostra "tipo" (il nome) - va risolto contro l'elenco tipi gia' in mano al
// componente.
function campiInlineARiga(
  campi: Partial<Record<CampoEditabileInline, ValoreCampoInline>>,
  tipiMap: Map<number, string>
): Partial<RigaMagazzino> {
  const out: Partial<RigaMagazzino> = {};
  for (const chiave of Object.keys(campi) as CampoEditabileInline[]) {
    const valore = campi[chiave];
    if (chiave === "tipoId") {
      out.tipo = tipiMap.get(Number(valore)) ?? "";
      out.tipoId = Number(valore);
      continue;
    }
    // Stesso nome di campo in CampoEditabileInline e RigaMagazzino per tutti
    // gli altri casi (artista, opera, larghezza, condizione, ...).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[chiave] = valore;
  }
  return out;
}

type UndoSlot = {
  descrizione: string;
  ripristina: () => void;
  // Solo per le modifiche di quantita': "Non scrivere nel registro".
  togliDalRegistro?: () => void;
};

export type FiltriIniziali = {
  q: string;
  tipo: string;
  condizione: string;
  proprieta: string;
  deposito: string;
  bloccato: string;
  disponibilita: string;
  senzafoto: string;
  // "Solo con dati mancanti" (2026-09-29) - vedi colonna "datiMancanti" sopra.
  mancanti: string;
  // Tag scelti come filtro: id separati da virgola ("" = nessuno).
  tag: string;
};

export function VistaMagazzino({
  righe,
  tipi,
  proprietari,
  ubicazioni,
  filtriIniziali,
  ordinaAttuale,
  direzioneAttuale,
  daSistemare,
  canaliStatici,
  tagDisponibili,
}: {
  tagDisponibili: TagBreve[];
  daSistemare: Record<number, DaSistemare[]>;
  canaliStatici: { id: number; nome: string }[];
  righe: RigaMagazzino[];
  tipi: { id: number; nome: string }[];
  proprietari: { id: number; nome: string }[];
  ubicazioni: { id: number; nome: string; tipo: string }[];
  filtriIniziali: FiltriIniziali;
  filtriAttivi: boolean;
  ordinaAttuale?: ColonnaOrdinabile;
  direzioneAttuale: "asc" | "desc";
}) {
  const router = useRouter();
  const [filtri, setFiltri] = useState(filtriIniziali);
  const ordinamentoCorrente: ColonnaOrdinabile = ordinaAttuale ?? "skuCode";
  const colonne = useSyncExternalStore(sottoscriviColonne, leggiColonneSalvate, () => COLONNE_DI_DEFAULT);

  // Copia locale delle righe per l'aggiornamento ottimistico dell'editing
  // inline: l'autosave non deve aspettare un giro completo di navigazione
  // per farsi vedere. router.refresh() (mai router.push, che cambierebbe
  // filtri/ordinamento nell'URL) la riallinea con la verita' del database
  // dopo ogni salvataggio, sia riuscito che fallito.
  const [righeLocal, setRigheLocal] = useState(righe);
  // Ogni volta che il prop righe cambia riferimento (nuova query da filtri/
  // ordinamento via router.push, o riallineamento via router.refresh() dopo
  // un salvataggio inline) la copia locale riparte da li' - le modifiche
  // ottimistiche intermedie sono gia' state scritte a database a quel punto.
  // Adeguamento durante il render (non un effetto) per non aggiungere un
  // giro di render extra - stesso pattern usato in editable-cell.tsx.
  const [rigeRifPrecedente, setRigheRifPrecedente] = useState(righe);
  if (righe !== rigeRifPrecedente) {
    setRigheRifPrecedente(righe);
    setRigheLocal(righe);
  }

  // Filtro locale "Da sistemare su un portale" (portali statici): non
  // tocca l'URL, filtra solo le righe gia' caricate.
  const [soloDaSistemare, setSoloDaSistemare] = useState(false);
  const nDaSistemare = useMemo(() => righeLocal.filter((r) => daSistemare[r.id]?.length).length, [righeLocal, daSistemare]);
  const righeMostrate = useMemo(
    () => (soloDaSistemare ? righeLocal.filter((r) => daSistemare[r.id]?.length) : righeLocal),
    [soloDaSistemare, righeLocal, daSistemare]
  );
  // Blocco su portale in blocco (Altre azioni)
  const [dialogBloccoAperto, setDialogBloccoAperto] = useState<"blocca" | "sblocca" | null>(null);
  const [canaliBlocco, setCanaliBlocco] = useState<number[]>([]);

  const tipiMap = useMemo(() => new Map(tipi.map((t) => [t.id, t.nome])), [tipi]);

  // La ricerca a testo si applica da sola dopo una breve pausa di scrittura
  // (o subito con Invio); tutti gli altri filtri si applicano al clic.
  const qApplicata = useRef(filtriIniziali.q);
  useEffect(() => {
    if (filtri.q === qApplicata.current) return;
    const t = setTimeout(() => applicaFiltri(filtri), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtri.q]);

  function cambia(patch: Partial<typeof filtri>) {
    const nuovi = { ...filtri, ...patch };
    setFiltri(nuovi);
    applicaFiltri(nuovi);
  }

  function applicaVista(qs: string) {
    const p = new URLSearchParams(qs);
    const nuovi: typeof filtri = {
      q: p.get("q") ?? "",
      tipo: p.get("tipo") ?? "tutti",
      condizione: p.get("condizione") ?? "tutti",
      proprieta: p.get("proprieta") ?? "tutti",
      deposito: p.get("deposito") ?? "tutti",
      bloccato: p.get("bloccato") ?? "tutti",
      disponibilita: p.get("disponibilita") ?? "tutti",
      senzafoto: p.get("senzafoto") === "si" ? "si" : "no",
      mancanti: p.get("mancanti") === "si" ? "si" : "no",
      tag: p.get("tag") ?? "",
    };
    setFiltri(nuovi);
    qApplicata.current = nuovi.q;
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // Selezione multipla stile file-manager (shift+click estende a un
  // intervallo) - 2026-09-25, punto 3 del backlog UX FINALIZZATO, vedi
  // src/lib/selezione-multipla.ts.
  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(righeMostrate.map((r) => r.id));
  const [errore, setErrore] = useState<string | null>(null);
  const [undoSlot, setUndoSlot] = useState<UndoSlot | null>(null);

  const [campoBulk, setCampoBulk] = useState<CampoEditabileInline | "">("");
  const [valoreBulk, setValoreBulk] = useState<ValoreCampoInline>("");
  const [dialogBulkAperto, setDialogBulkAperto] = useState(false);
  // Sposta selezionati in un deposito (Release 2)
  const [depositoBulk, setDepositoBulk] = useState("");
  const [dialogSpostaAperto, setDialogSpostaAperto] = useState(false);
  const [spostaInCorso, setSpostaInCorso] = useState(false);
  const [registroBulk, setRegistroBulk] = useState(true);
  const [infoOk, setInfoOk] = useState<string | null>(null);
  const [avvisoMsg, setAvvisoMsg] = useState<string | null>(null);
  // Finestra Giacenza (numero, Sposta, Aggiungi, Annulla) di uno sku.
  const [giacenzaSkuId, setGiacenzaSkuId] = useState<number | null>(null);

  async function salvaCampi(voci: VoceModificaInline[], descrizioneUndo: string) {
    setErrore(null);
    const snapshot = righeLocal;
    setRigheLocal((prev) =>
      prev.map((r) => {
        const voce = voci.find((v) => v.id === r.id);
        if (!voce) return r;
        return { ...r, ...campiInlineARiga(voce.campi, tipiMap) };
      })
    );

    try {
      const { precedenti } = await aggiornaCampiSkuInline(voci);
      setUndoSlot({
        descrizione: descrizioneUndo,
        ripristina: async () => {
          const vociRipristino: VoceModificaInline[] = precedenti.map((p) => ({ id: p.id, campi: p.campi }));
          setRigheLocal((prev) =>
            prev.map((r) => {
              const voce = vociRipristino.find((v) => v.id === r.id);
              if (!voce) return r;
              return { ...r, ...campiInlineARiga(voce.campi, tipiMap) };
            })
          );
          try {
            await aggiornaCampiSkuInline(vociRipristino);
          } catch (err) {
            setErrore(err instanceof Error ? err.message : "Annulla non riuscito - ricarico i dati");
          }
          setUndoSlot(null);
          router.refresh();
        },
      });
      router.refresh();
    } catch (err) {
      setRigheLocal(snapshot);
      setErrore(err instanceof Error ? err.message : "Salvataggio non riuscito");
    }
  }

  // Scrive il numero giusto da tabella: la modifica va nel registro di default;
  // il messaggio offre "Annulla" (cancella quel movimento, rifiutato se nel
  // frattempo ne e' arrivato un altro) e "Non scrivere nel registro" (la
  // modifica resta nei totali ma sparisce dalla lista Movimenti). Sotto
  // l'impegnato avvisa, non blocca.
  async function correggiDaTabella(r: RigaMagazzino, riga: GiacenzaRiga, nuova: number) {
    setErrore(null);
    setInfoOk(null);
    setAvvisoMsg(null);
    const esito = await correggiQuantita({
      skuId: r.id,
      proprietarioId: riga.proprietarioId,
      ubicazioneId: riga.ubicazioneId,
      nuovaQuantita: nuova,
    });
    if (!esito.ok) {
      setErrore(esito.errore ?? "Correzione non riuscita");
      router.refresh();
      return;
    }
    if (esito.avviso) setAvvisoMsg(esito.avviso);
    const ids = esito.movimentoIds ?? [];
    if (ids.length > 0) {
      setUndoSlot({
        descrizione: `Quantità di ${r.skuCode}: ${riga.saldo} → ${nuova}`,
        ripristina: async () => {
          const e = await annullaMovimenti(r.id, ids);
          if (!e.ok) setErrore(e.errore ?? "Annulla non riuscito");
          setUndoSlot(null);
          setAvvisoMsg(null);
          router.refresh();
        },
        togliDalRegistro: async () => {
          const e = await togliDalRegistro(r.id, ids);
          if (!e.ok) {
            setErrore(e.errore ?? "Operazione non riuscita");
            setUndoSlot(null);
          } else {
            setUndoSlot((prev) =>
              prev ? { ...prev, descrizione: `${prev.descrizione} (non scritto nel registro)`, togliDalRegistro: undefined } : prev
            );
          }
          router.refresh();
        },
      });
    }
    router.refresh();
  }

  const ctx: RenderCtx = {
    correggiDaTabella,
    apriGiacenza: (r) => setGiacenzaSkuId(r.id),
    tipi,
    salvaTesto: (r, campo, valore) => salvaCampi([{ id: r.id, campi: { [campo]: valore } }], `${ETICHETTE_CAMPI[campo]} di ${r.skuCode}`),
    salvaMisura: (r, larghezza, altezza) => salvaCampi([{ id: r.id, campi: { larghezza, altezza } }], `Misura di ${r.skuCode}`),
    salvaCondizione: (r, valore) => salvaCampi([{ id: r.id, campi: { condizione: valore } }], `Condizione di ${r.skuCode} → ${valore}`),
    salvaTipo: (r, tipoId) => salvaCampi([{ id: r.id, campi: { tipoId } }], `Tipo di ${r.skuCode} → ${tipiMap.get(tipoId) ?? ""}`),
    salvaBloccato: (r, valore) => salvaCampi([{ id: r.id, campi: { bloccatoVendita: valore } }], `${r.skuCode} ${valore ? "bloccato" : "sbloccato"} per la vendita`),
  };

  function impostaColonna(id: ColonnaId, visibile: boolean) {
    scriviColonneSalvate({ ...colonne, [id]: visibile });
  }

  // "Ripristina colonne predefinite" (2026-09-25, richiesta esplicita
  // cliente dopo aver toccato a mano ogni colonna nel menu "Colonne" e
  // trovato scomodo tornare indietro voce per voce) - riscrive l'intera
  // preferenza salvata sul default di fabbrica (le 8 colonne visibili di
  // serie, vedi COLONNE_DI_DEFAULT sopra), un solo click invece di
  // riattivare/disattivare ogni checkbox a mano.
  function ripristinaColonne() {
    scriviColonneSalvate(COLONNE_DI_DEFAULT);
  }

  const colonneVisibili = useMemo(() => COLONNE.filter((c) => colonne[c.id]), [colonne]);

  function applicaFiltri(
    f: typeof filtri,
    ordinaOverride?: ColonnaOrdinabile,
    direzioneOverride?: "asc" | "desc",
    azzeraOrdinamento?: boolean
  ) {
    qApplicata.current = f.q;
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.tipo !== "tutti") params.set("tipo", f.tipo);
    if (f.condizione !== "tutti") params.set("condizione", f.condizione);
    if (f.proprieta !== "tutti") params.set("proprieta", f.proprieta);
    if (f.deposito !== "tutti") params.set("deposito", f.deposito);
    if (f.bloccato !== "tutti") params.set("bloccato", f.bloccato);
    if (f.disponibilita !== "tutti") params.set("disponibilita", f.disponibilita);
    if (f.senzafoto === "si") params.set("senzafoto", "si");
    if (f.mancanti === "si") params.set("mancanti", "si");
    if (f.tag) params.set("tag", f.tag);
    if (!azzeraOrdinamento) {
      const ordinaFinale = ordinaOverride ?? ordinaAttuale;
      const direzioneFinale = ordinaOverride ? (direzioneOverride ?? "asc") : direzioneAttuale;
      if (ordinaFinale) params.set("ordina", ordinaFinale);
      if (ordinaFinale && direzioneFinale === "desc") params.set("direzione", "desc");
    }
    const qs = params.toString();
    // scroll: false (2026-09-23 sera, feedback utente dopo test
    // installazione reale: "tocco i filtri e la finestra scrolla verso
    // l'alto") - stesso identico fix gia' applicato in
    // src/components/pubblicazione/selettore-lotti.tsx, vedi commento la'
    // per la spiegazione completa.
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // "Azzera tutto" toglie tutti i filtri (ricerca compresa); l'ordinamento ha
  // la sua voce "Togli l'ordinamento" nel menu Ordina.
  function azzeraFiltri() {
    const vuoti: typeof filtri = { q: "", tipo: "tutti", condizione: "tutti", proprieta: "tutti", deposito: "tutti", bloccato: "tutti", disponibilita: "tutti", senzafoto: "no", mancanti: "no", tag: "" };
    setFiltri(vuoti);
    setSoloDaSistemare(false);
    applicaFiltri(vuoti);
  }

  // Ciclo a tre stati sulla stessa intestazione: asc -> desc -> azzerato
  // (torna al default SKU asc, icona inattiva) invece del vecchio ciclo a
  // due stati asc<->desc che non permetteva mai di tornare "non ordinato"
  // senza un controllo separato.
  function gestisciOrdinamento(chiave: ColonnaOrdinabile) {
    const attiva = ordinamentoCorrente === chiave;
    const ordinamentoEsplicito = ordinaAttuale === chiave;
    if (attiva && ordinamentoEsplicito && direzioneAttuale === "desc") {
      applicaFiltri(filtri, undefined, undefined, true);
      return;
    }
    const prossimaDirezione: "asc" | "desc" = attiva && direzioneAttuale === "asc" ? "desc" : "asc";
    applicaFiltri(filtri, chiave, prossimaDirezione);
  }

  const tuttiSelezionati = righeMostrate.length > 0 && righeMostrate.every((r) => selezionati.has(r.id));
  const alcuniSelezionati = !tuttiSelezionati && righeMostrate.some((r) => selezionati.has(r.id));

  function etichettaValoreBulk(): string {
    if (!campoBulk) return "";
    if (campoBulk === "tipoId") return tipiMap.get(Number(valoreBulk)) ?? String(valoreBulk);
    if (campoBulk === "bloccatoVendita") return valoreBulk ? "Sì" : "No";
    const s = (valoreBulk ?? "").toString().trim();
    return s.length ? s : "(vuoto)";
  }

  const depositiDestinazione = ubicazioni.filter((u) => u.tipo !== "asta_fisica");
  const nomeDepositoBulk = depositiDestinazione.find((u) => String(u.id) === depositoBulk)?.nome ?? "";

  async function confermaSposta() {
    const ids = Array.from(selezionati);
    setDialogSpostaAperto(false);
    setSpostaInCorso(true);
    setErrore(null);
    setInfoOk(null);
    const esito = await spostaSkuInDeposito(ids, Number(depositoBulk), registroBulk);
    setSpostaInCorso(false);
    if (esito.ok) {
      setInfoOk(esito.messaggio ?? "Spostamento eseguito.");
      const gruppi = esito.movimentiPerSku ?? [];
      if (gruppi.length > 0) {
        setUndoSlot({
          descrizione: `${gruppi.length} sku spostati in ${nomeDepositoBulk}`,
          ripristina: async () => {
            const e = await annullaMovimentiMultipli(gruppi);
            if (!e.ok) setErrore(e.errore ?? "Annulla non riuscito");
            else setInfoOk(null);
            setUndoSlot(null);
            router.refresh();
          },
        });
      }
      setSelezionati(new Set());
      setDepositoBulk("");
      setRegistroBulk(true);
    } else {
      setErrore(esito.errore ?? "Spostamento non riuscito");
    }
    router.refresh();
  }

  // "Ritira da portali…" / "Rimetti in vendita su portali…": stessa operazione
  // su uno o piu' portali insieme.
  async function confermaBlocco() {
    if (!dialogBloccoAperto || canaliBlocco.length === 0) return;
    const ids = Array.from(selezionati);
    const ritirare = dialogBloccoAperto === "blocca";
    const scelti = canaliBlocco;
    setDialogBloccoAperto(null);
    setErrore(null);
    setInfoOk(null);
    const esito = await ritiraDaPortaliAction(ids, scelti, ritirare);
    if (esito.ok) {
      setInfoOk(esito.messaggio ?? "Fatto.");
      const annullabili = esito.annullabili ?? [];
      if (annullabili.length > 0) {
        const nomi = scelti.map((id) => canaliStatici.find((c) => c.id === id)?.nome ?? "portale").join(", ");
        setUndoSlot({
          descrizione: `${ids.length} sku ${ritirare ? "ritirati da" : "rimessi in vendita su"} ${nomi}`,
          ripristina: async () => {
            let errore: string | undefined;
            for (const a of annullabili) {
              const e = await annullaEsposizioneAction(a);
              if (!e.ok) errore = e.errore ?? "Annulla non riuscito";
            }
            if (errore) setErrore(errore);
            else setInfoOk(null);
            setUndoSlot(null);
            router.refresh();
          },
        });
      }
      setSelezionati(new Set());
    } else {
      setErrore(esito.errore ?? "Operazione non riuscita");
    }
    setCanaliBlocco([]);
    router.refresh();
  }

  const bulkPronto = (() => {
    if (!campoBulk) return false;
    if (campoBulk === "bloccatoVendita") return true; // sempre un valore booleano valido
    if (campoBulk === "condizione") return typeof valoreBulk === "string" && valoreBulk !== "";
    if (campoBulk === "tipoId") return typeof valoreBulk === "number" && valoreBulk > 0;
    if (campoBulk === "artista" || campoBulk === "opera") {
      return typeof valoreBulk === "string" && valoreBulk.trim().length > 0;
    }
    return true; // altri campi testo/numero: anche vuoto e' un valore valido (es. svuotare Note in blocco)
  })();

  function apriModifica(c: CampoEditabileInline) {
    setCampoBulk(c);
    setValoreBulk(c === "bloccatoVendita" ? false : "");
    setDialogBulkAperto(true);
  }

  function chiudiModifica() {
    setDialogBulkAperto(false);
    setCampoBulk("");
    setValoreBulk("");
  }

  async function confermaBulk() {
    if (!campoBulk) return;
    const ids = Array.from(selezionati);
    const voci: VoceModificaInline[] = ids.map((id) => ({ id, campi: { [campoBulk]: valoreBulk } }));
    const descrizione = `${ETICHETTE_CAMPI[campoBulk]} → ${etichettaValoreBulk()} (${ids.length} sku)`;
    setDialogBulkAperto(false);
    await salvaCampi(voci, descrizione);
    setSelezionati(new Set());
    setCampoBulk("");
    setValoreBulk("");
  }

  const nomeDi = (elenco: { id: number; nome: string }[], id: string) => elenco.find((x) => String(x.id) === id)?.nome ?? id;
  const chips: ChipFiltro[] = [];
  if (filtri.tipo !== "tutti") chips.push({ id: "tipo", etichetta: "Tipo", valore: nomeDi(tipi, filtri.tipo), rimuovi: () => cambia({ tipo: "tutti" }) });
  if (filtri.condizione !== "tutti") chips.push({ id: "condizione", etichetta: "Condizione", valore: filtri.condizione, rimuovi: () => cambia({ condizione: "tutti" }) });
  if (filtri.proprieta !== "tutti") chips.push({ id: "proprieta", etichetta: "Proprietario", valore: nomeDi(proprietari, filtri.proprieta), rimuovi: () => cambia({ proprieta: "tutti" }) });
  if (filtri.deposito !== "tutti") chips.push({ id: "deposito", etichetta: "Deposito", valore: nomeDi(ubicazioni, filtri.deposito), rimuovi: () => cambia({ deposito: "tutti" }) });
  if (filtri.disponibilita !== "tutti") chips.push({ id: "disponibilita", etichetta: "Disponibilità", valore: filtri.disponibilita === "esaurito" ? "Esaurito" : "Disponibile", rimuovi: () => cambia({ disponibilita: "tutti" }) });
  if (filtri.bloccato !== "tutti") chips.push({ id: "bloccato", etichetta: "Bloccato", valore: filtri.bloccato === "si" ? "Sì" : "No", rimuovi: () => cambia({ bloccato: "tutti" }) });
  if (filtri.senzafoto === "si") chips.push({ id: "senzafoto", etichetta: "Foto", valore: "Senza foto", rimuovi: () => cambia({ senzafoto: "no" }) });
  if (filtri.mancanti === "si") chips.push({ id: "mancanti", etichetta: "Dati mancanti", valore: "Sì", rimuovi: () => cambia({ mancanti: "no" }) });
  for (const t of tagDisponibili.filter((x) => leggiTagParam(filtri.tag).includes(x.id))) {
    chips.push({ id: `tag-${t.id}`, etichetta: "Tag", valore: t.nome, rimuovi: () => cambia({ tag: scriviTagParam(leggiTagParam(filtri.tag).filter((x) => x !== t.id)) }) });
  }
  if (soloDaSistemare) chips.push({ id: "da-sistemare", etichetta: "Portali", valore: "Da sistemare", rimuovi: () => setSoloDaSistemare(false) });

  return (
    <>
      <BarraFiltri
        ricerca={filtri.q}
        onRicerca={(v) => setFiltri((f) => ({ ...f, q: v }))}
        onInvio={() => applicaFiltri(filtri)}
        segnaposto="Cerca artista, opera, sku o tag..."
        chips={chips}
        onAzzera={azzeraFiltri}
        strumenti={
          <>
            <MenuOrdina
              voci={[{ chiave: "skuCode", etichetta: "SKU" }, ...colonneVisibili.map((c) => ({ chiave: MAPPA_ORDINABILI[c.id], etichetta: c.etichetta }))]}
              attuale={ordinaAttuale}
              direzione={direzioneAttuale}
              onScegli={(k) => gestisciOrdinamento(k as ColonnaOrdinabile)}
              onAzzera={() => applicaFiltri(filtri, undefined, undefined, true)}
            />
            <MenuViste chiave="magazzino" onApplica={applicaVista} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" title="Scegli quali colonne vedere nella tabella">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); ripristinaColonne(); }}>
                  <RotateCcw /> Ripristina colonne predefinite
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        veloci={
          <>
            {canaliStatici.length > 0 && (nDaSistemare > 0 || soloDaSistemare) && (
              <Scorciatoia attiva={soloDaSistemare} onClick={() => setSoloDaSistemare((v) => !v)} titolo="Sku da caricare, togliere o abbassare su un portale statico">
                Da sistemare ({nDaSistemare})
              </Scorciatoia>
            )}
            <Scorciatoia attiva={filtri.senzafoto === "si"} onClick={() => cambia({ senzafoto: filtri.senzafoto === "si" ? "no" : "si" })}>Senza foto</Scorciatoia>
            <Scorciatoia attiva={filtri.mancanti === "si"} onClick={() => cambia({ mancanti: filtri.mancanti === "si" ? "no" : "si" })} titolo="Sku a cui manca qualcosa per la pubblicazione">Dati mancanti</Scorciatoia>
            <Scorciatoia attiva={filtri.bloccato === "si"} onClick={() => cambia({ bloccato: filtri.bloccato === "si" ? "tutti" : "si" })}>Bloccati</Scorciatoia>
          </>
        }
      >
        <CampoFiltro etichetta="Tag">
          <FiltroTag tag={tagDisponibili} valore={leggiTagParam(filtri.tag)} onChange={(ids) => cambia({ tag: scriviTagParam(ids) })} />
        </CampoFiltro>
        <CampoFiltro etichetta="Tipo">
          <Select value={filtri.tipo} onValueChange={(v) => cambia({ tipo: v })}>
            <SelectTrigger aria-label="Tipo"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              {tipi.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Condizione">
          <Select value={filtri.condizione} onValueChange={(v) => cambia({ condizione: v })}>
            <SelectTrigger aria-label="Condizione"><SelectValue placeholder="Tutte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte</SelectItem>
              {CONDIZIONI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Proprietario">
          <Select value={filtri.proprieta} onValueChange={(v) => cambia({ proprieta: v })}>
            <SelectTrigger aria-label="Proprietario"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              {proprietari.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Deposito">
          <Select value={filtri.deposito} onValueChange={(v) => cambia({ deposito: v })}>
            <SelectTrigger aria-label="Deposito"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              {ubicazioni.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Disponibilità">
          <Select value={filtri.disponibilita} onValueChange={(v) => cambia({ disponibilita: v })}>
            <SelectTrigger aria-label="Disponibilità"><SelectValue placeholder="Tutte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte</SelectItem>
              <SelectItem value="disponibile">Disponibile (&gt;0)</SelectItem>
              <SelectItem value="esaurito">Esaurito (=0)</SelectItem>
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Bloccato per la vendita">
          <Select value={filtri.bloccato} onValueChange={(v) => cambia({ bloccato: v })}>
            <SelectTrigger aria-label="Bloccato per la vendita"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              <SelectItem value="si">Solo bloccati</SelectItem>
              <SelectItem value="no">Solo non bloccati</SelectItem>
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Foto">
          <Select value={filtri.senzafoto} onValueChange={(v) => cambia({ senzafoto: v })}>
            <SelectTrigger aria-label="Foto"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Tutti</SelectItem>
              <SelectItem value="si">Solo senza foto</SelectItem>
            </SelectContent>
          </Select>
        </CampoFiltro>
        <CampoFiltro etichetta="Dati mancanti">
          <Select value={filtri.mancanti} onValueChange={(v) => cambia({ mancanti: v })}>
            <SelectTrigger aria-label="Dati mancanti"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Tutti</SelectItem>
              <SelectItem value="si">Solo con dati mancanti</SelectItem>
            </SelectContent>
          </Select>
        </CampoFiltro>
      </BarraFiltri>

      {errore && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{errore}</span>
          <button type="button" onClick={() => setErrore(null)} className="opacity-70 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {avvisoMsg && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span>{avvisoMsg}</span>
          <button type="button" onClick={() => setAvvisoMsg(null)} className="opacity-70 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {infoOk && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          <span>{infoOk}</span>
          <button type="button" onClick={() => setInfoOk(null)} className="opacity-70 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {selezionati.size > 0 && (
        <BarraSelezione n={selezionati.size} totale={righeMostrate.length} onDeseleziona={() => setSelezionati(new Set())}>
          <AssegnaTagSelezione
            tag={tagDisponibili}
            skuIds={Array.from(selezionati)}
            onEsito={(e) => { setErrore(null); setInfoOk(e.testo); }}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                <Pencil /> Modifica <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
              <DropdownMenuLabel>Cambia in tutti gli sku selezionati</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CAMPI_BULK.map((c) => (
                <DropdownMenuItem key={c} onSelect={() => apriModifica(c)}>{ETICHETTE_CAMPI[c]}…</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button type="button" variant="outline" disabled={spostaInCorso} onClick={() => setDialogSpostaAperto(true)}>
            <Warehouse /> {spostaInCorso ? "Sposto…" : "Sposta in deposito"}
          </Button>

          {canaliStatici.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" aria-label="Altre azioni">
                  <Ellipsis /> Altro
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem className="flex-col items-start gap-0.5" onSelect={() => setDialogBloccoAperto("blocca")}>
                  <span className="font-medium">Ritira da portali…</span>
                  <span className="text-xs text-muted-foreground">Toglie questi sku dai portali che scegli (anche più insieme).</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex-col items-start gap-0.5" onSelect={() => setDialogBloccoAperto("sblocca")}>
                  <span className="font-medium">Rimetti in vendita su portali…</span>
                  <span className="text-xs text-muted-foreground">Questi sku tornano disponibili sui portali che scegli.</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </BarraSelezione>
      )}

      <div className="rounded-xl border overflow-x-auto">
        {righeMostrate.length === 0 ? (
          <TableEmpty><p className="font-medium text-foreground">Nessuno sku trovato</p><p>Prova a modificare la ricerca o i filtri.</p></TableEmpty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={tuttiSelezionati ? true : alcuniSelezionati ? "indeterminate" : false}
                    onCheckedChange={(v) => selezionaTutti(v === true)}
                    aria-label="Seleziona tutti"
                  />
                </TableHead>
                <IntestazioneOrdinabile
                  etichetta="SKU"
                  chiave="skuCode"
                  attiva={ordinamentoCorrente === "skuCode"}
                  direzione={direzioneAttuale}
                  onOrdina={gestisciOrdinamento}
                />
                {colonneVisibili.map((c) => {
                  // MAPPA_ORDINABILI e' un Record totale su ColonnaId (vedi
                  // sopra): ogni colonna visibile ha sempre una chiave di
                  // ordinamento, nessun fallback a intestazione statica.
                  const chiaveOrdinamento = MAPPA_ORDINABILI[c.id];
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
              {righeMostrate.map((r) => (
                <TableRow key={r.id}>
                  <TableCell onClickCapture={segnalaShift}>
                    <Checkbox checked={selezionati.has(r.id)} onCheckedChange={(v) => gestisciSeleziona(r.id, v === true)} aria-label={`Seleziona ${r.skuCode}`} />
                  </TableCell>
                  <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block font-mono text-xs p-3">
                      {r.skuCode}
                      {daSistemare[r.id]?.length ? (
                        <Badge variant="warning" className="ml-2 align-middle" title={daSistemare[r.id].map((d) => `${d.portale}: ${d.stato}`).join(" · ")}>
                          {Array.from(new Set(daSistemare[r.id].map((d) => d.portale))).join(", ")}
                        </Badge>
                      ) : null}
                    </Link></TableCell>
                  {colonneVisibili.map((c) => (
                    <TableCell key={c.id} className={c.allineaDestra ? "text-right tabular-nums" : undefined}>
                      {c.render(r, ctx)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={giacenzaSkuId !== null} onOpenChange={(aperto) => { if (!aperto) setGiacenzaSkuId(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {(() => {
            const rigaG = righeLocal.find((x) => x.id === giacenzaSkuId);
            if (!rigaG) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Giacenza di {rigaG.skuCode}</DialogTitle>
                  <DialogDescription>{rigaG.artista} — {rigaG.opera}</DialogDescription>
                </DialogHeader>
                <GiacenzaSku
                  skuId={rigaG.id}
                  righe={rigaG.giacenze}
                  destinazioni={ubicazioni.filter((u) => u.tipo !== "asta_fisica")}
                  proprietari={proprietari}
                  impegnato={rigaG.impegnato}
                />
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogSpostaAperto} onOpenChange={(a) => { setDialogSpostaAperto(a); if (!a) setDepositoBulk(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sposta {selezionati.size} sku in un deposito</DialogTitle>
            <DialogDescription>
              Sposti <strong>tutti i pezzi</strong> degli sku selezionati nel deposito scelto, mantenendo il proprietario.
              I pezzi che si trovano in una casa d&apos;asta restano dove sono.
            </DialogDescription>
          </DialogHeader>
          <Select value={depositoBulk} onValueChange={setDepositoBulk}>
            <SelectTrigger aria-label="Deposito di destinazione"><SelectValue placeholder="Scegli il deposito..." /></SelectTrigger>
            <SelectContent>
              {depositiDestinazione.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <CasellaRegistro id="registro-bulk" checked={registroBulk} onCheckedChange={setRegistroBulk} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogSpostaAperto(false)}>Annulla</Button>
            <Button type="button" disabled={depositoBulk === ""} onClick={confermaSposta}>Sposta {selezionati.size} sku</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogBloccoAperto !== null} onOpenChange={(a) => { if (!a) { setDialogBloccoAperto(null); setCanaliBlocco([]); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogBloccoAperto === "blocca" ? "Ritira da portali" : "Rimetti in vendita su portali"}</DialogTitle>
            <DialogDescription>
              {dialogBloccoAperto === "blocca"
                ? `${selezionati.size} sku non verranno più proposti sui portali scelti; se sono già caricati finiscono nella lista "Da togliere". Restano ritirati finché non li rimetti in vendita.`
                : `${selezionati.size} sku tornano a essere proposti sui portali scelti.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {canaliStatici.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={canaliBlocco.includes(c.id)}
                  onCheckedChange={(v) =>
                    setCanaliBlocco((prec) => (v === true ? [...prec, c.id] : prec.filter((x) => x !== c.id)))
                  }
                  aria-label={c.nome}
                />
                {c.nome}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogBloccoAperto(null)}>Annulla</Button>
            <Button type="button" disabled={canaliBlocco.length === 0} onClick={confermaBlocco}>Conferma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogBulkAperto} onOpenChange={(a) => { if (!a) chiudiModifica(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{campoBulk ? `${ETICHETTE_CAMPI[campoBulk]}: modifica ${selezionati.size} sku` : "Modifica in blocco"}</DialogTitle>
            <DialogDescription>
              Il nuovo valore viene scritto in tutti i {selezionati.size} sku selezionati. Puoi annullare subito dopo.
            </DialogDescription>
          </DialogHeader>
          {campoBulk === "condizione" && (
            <Select value={String(valoreBulk)} onValueChange={(v) => setValoreBulk(v)}>
              <SelectTrigger aria-label="Nuovo valore"><SelectValue placeholder="Scegli la condizione..." /></SelectTrigger>
              <SelectContent>{CONDIZIONI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {campoBulk === "tipoId" && (
            <Select value={String(valoreBulk)} onValueChange={(v) => setValoreBulk(Number(v))}>
              <SelectTrigger aria-label="Nuovo valore"><SelectValue placeholder="Scegli il tipo..." /></SelectTrigger>
              <SelectContent>{tipi.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {campoBulk === "bloccatoVendita" && (
            <Select value={valoreBulk ? "si" : "no"} onValueChange={(v) => setValoreBulk(v === "si")}>
              <SelectTrigger aria-label="Nuovo valore"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="si">Bloccato</SelectItem>
                <SelectItem value="no">Non bloccato</SelectItem>
              </SelectContent>
            </Select>
          )}
          {campoBulk !== "" && campoBulk !== "condizione" && campoBulk !== "tipoId" && campoBulk !== "bloccatoVendita" && (
            <Input
              value={typeof valoreBulk === "string" ? valoreBulk : ""}
              onChange={(e) => setValoreBulk(e.target.value)}
              placeholder="Nuovo valore..."
              aria-label="Nuovo valore"
              autoFocus
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={chiudiModifica}>Annulla</Button>
            <Button type="button" disabled={!bulkPronto} onClick={confermaBulk}>Applica a {selezionati.size} sku</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {undoSlot && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm">
            Modificato: <span className="font-medium">{undoSlot.descrizione}</span>
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={undoSlot.ripristina}>
            <Undo2 className="size-3.5" /> Annulla
          </Button>
          {undoSlot.togliDalRegistro && (
            <Button type="button" size="sm" variant="outline" onClick={undoSlot.togliDalRegistro}>
              Non scrivere nel registro
            </Button>
          )}
          <button type="button" onClick={() => setUndoSlot(null)} className="text-muted-foreground opacity-70 hover:opacity-100" title="Chiudi">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
