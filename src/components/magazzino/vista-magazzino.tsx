"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Search, Columns3, X, ArrowUp, ArrowDown, ArrowUpDown, Undo2 } from "lucide-react";
import type { RigaMagazzino, ColonnaOrdinabile } from "@/db/queries";
import { aggiornaCampiSkuInline } from "@/app/magazzino/actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import {
  CAMPI_EDITABILI_INLINE,
  type CampoEditabileInline,
  type ValoreCampoInline,
  type VoceModificaInline,
} from "@/lib/campi-inline";
import { CellTesto, CellSelect, CellMisura } from "@/components/magazzino/editable-cell";

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
const CAMPI_BULK = CAMPI_EDITABILI_INLINE.filter((c) => c !== "larghezza" && c !== "altezza");

type RenderCtx = {
  tipi: { id: number; nome: string }[];
  salvaTesto: (r: RigaMagazzino, campo: CampoEditabileInline, valore: string) => void;
  salvaMisura: (r: RigaMagazzino, larghezza: string, altezza: string) => void;
  salvaCondizione: (r: RigaMagazzino, valore: string) => void;
  salvaTipo: (r: RigaMagazzino, tipoId: number) => void;
  salvaBloccato: (r: RigaMagazzino, valore: boolean) => void;
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
    id: "supporto", etichetta: "Supporto", defaultVisibile: false,
    render: (r, ctx) => <CellTesto valore={r.supporto} onSalva={(v) => ctx.salvaTesto(r, "supporto", v)} />,
  },
  {
    id: "anno", etichetta: "Anno / epoca", defaultVisibile: false,
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
  { id: "proprieta", etichetta: "Proprietà", defaultVisibile: false, render: (r) => r.proprieta || "—" },
  { id: "disponibile", etichetta: "Disponibile", defaultVisibile: true, allineaDestra: true, render: (r) => r.quantitaDisponibile },
  { id: "numeroFoto", etichetta: "N. foto", defaultVisibile: false, allineaDestra: true, render: (r) => r.numeroFoto },
  {
    id: "valoreCarico", etichetta: "Valore di carico", defaultVisibile: false, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.valoreCarico} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "valoreCarico", v)} />,
  },
  {
    id: "prezzoEbay", etichetta: "Prezzo eBay", defaultVisibile: true, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.prezzoEbay} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "prezzoEbay", v)} />,
  },
  {
    id: "prezzoCatawiki", etichetta: "Prezzo Catawiki", defaultVisibile: false, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.prezzoCatawiki} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "prezzoCatawiki", v)} />,
  },
  {
    id: "riservaCatawiki", etichetta: "Riserva Catawiki", defaultVisibile: false, allineaDestra: true,
    render: (r, ctx) => <CellTesto valore={r.riservaCatawiki} numerico allineaDestra visualizza={formatEuro} onSalva={(v) => ctx.salvaTesto(r, "riservaCatawiki", v)} />,
  },
  {
    id: "tag", etichetta: "Tag", defaultVisibile: false,
    render: (r, ctx) => <CellTesto valore={r.tag} onSalva={(v) => ctx.salvaTesto(r, "tag", v)} />,
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
};

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
  // true solo con un ordina= esplicito in URL (non il fallback a skuCode) -
  // controlla la comparsa del pulsante "Azzera ordinamento".
  const ordinamentoAttivo = Boolean(ordinaAttuale);
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

  const tipiMap = useMemo(() => new Map(tipi.map((t) => [t.id, t.nome])), [tipi]);

  // Selezione multipla stile file-manager (shift+click estende a un
  // intervallo) - 2026-09-25, punto 3 del backlog UX FINALIZZATO, vedi
  // src/lib/selezione-multipla.ts.
  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(righeLocal.map((r) => r.id));
  const [errore, setErrore] = useState<string | null>(null);
  const [undoSlot, setUndoSlot] = useState<UndoSlot | null>(null);

  const [campoBulk, setCampoBulk] = useState<CampoEditabileInline | "">("");
  const [valoreBulk, setValoreBulk] = useState<ValoreCampoInline>("");
  const [dialogBulkAperto, setDialogBulkAperto] = useState(false);

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

  const ctx: RenderCtx = {
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

  const colonneVisibili = useMemo(() => COLONNE.filter((c) => colonne[c.id]), [colonne]);

  function applicaFiltri(
    f: typeof filtri,
    ordinaOverride?: ColonnaOrdinabile,
    direzioneOverride?: "asc" | "desc",
    azzeraOrdinamento?: boolean
  ) {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.tipo !== "tutti") params.set("tipo", f.tipo);
    if (f.condizione !== "tutti") params.set("condizione", f.condizione);
    if (f.proprieta !== "tutti") params.set("proprieta", f.proprieta);
    if (f.bloccato !== "tutti") params.set("bloccato", f.bloccato);
    if (f.disponibilita !== "tutti") params.set("disponibilita", f.disponibilita);
    if (f.senzafoto === "si") params.set("senzafoto", "si");
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

  // Azzera sia i filtri sia l'ordinamento in un solo click - prima azzerava
  // solo i filtri e non compariva nemmeno se era attivo solo un ordinamento,
  // costringendo a ricliccare la colonna piu' volte per tornare al default.
  function azzeraFiltri() {
    const vuoti: typeof filtri = { q: "", tipo: "tutti", condizione: "tutti", proprieta: "tutti", bloccato: "tutti", disponibilita: "tutti", senzafoto: "no" };
    setFiltri(vuoti);
    applicaFiltri(vuoti, undefined, undefined, true);
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

  const tuttiSelezionati = righeLocal.length > 0 && righeLocal.every((r) => selezionati.has(r.id));
  const alcuniSelezionati = !tuttiSelezionati && righeLocal.some((r) => selezionati.has(r.id));

  function etichettaValoreBulk(): string {
    if (!campoBulk) return "";
    if (campoBulk === "tipoId") return tipiMap.get(Number(valoreBulk)) ?? String(valoreBulk);
    if (campoBulk === "bloccatoVendita") return valoreBulk ? "Sì" : "No";
    const s = (valoreBulk ?? "").toString().trim();
    return s.length ? s : "(vuoto)";
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
          {(filtriAttivi || ordinamentoAttivo) && (
            <Button type="button" variant="ghost" size="sm" onClick={azzeraFiltri}>
              <X /> {filtriAttivi && ordinamentoAttivo ? "Azzera filtri e ordinamento" : ordinamentoAttivo ? "Azzera ordinamento" : "Azzera filtri"}
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

      {errore && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{errore}</span>
          <button type="button" onClick={() => setErrore(null)} className="opacity-70 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {selezionati.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selezionati.size} selezionati</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelezionati(new Set())}>Deseleziona</Button>

          <span className="mx-1 h-5 w-px bg-border" />

          <Select value={campoBulk} onValueChange={(v) => { setCampoBulk(v as CampoEditabileInline); setValoreBulk(v === "bloccatoVendita" ? false : ""); }}>
            <SelectTrigger className="h-8 w-48" aria-label="Campo da modificare"><SelectValue placeholder="Modifica campo..." /></SelectTrigger>
            <SelectContent>
              {CAMPI_BULK.map((c) => <SelectItem key={c} value={c}>{ETICHETTE_CAMPI[c]}</SelectItem>)}
            </SelectContent>
          </Select>

          {campoBulk === "condizione" && (
            <Select value={String(valoreBulk)} onValueChange={(v) => setValoreBulk(v)}>
              <SelectTrigger className="h-8 w-24" aria-label="Valore"><SelectValue placeholder="Valore" /></SelectTrigger>
              <SelectContent>{CONDIZIONI.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {campoBulk === "tipoId" && (
            <Select value={String(valoreBulk)} onValueChange={(v) => setValoreBulk(Number(v))}>
              <SelectTrigger className="h-8 w-40" aria-label="Valore"><SelectValue placeholder="Valore" /></SelectTrigger>
              <SelectContent>{tipi.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {campoBulk === "bloccatoVendita" && (
            <Select value={valoreBulk ? "si" : "no"} onValueChange={(v) => setValoreBulk(v === "si")}>
              <SelectTrigger className="h-8 w-32" aria-label="Valore"><SelectValue /></SelectTrigger>
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
              className="h-8 w-48"
            />
          )}

          {campoBulk !== "" && (
            <Button type="button" size="sm" disabled={!bulkPronto} onClick={() => setDialogBulkAperto(true)}>
              Applica a {selezionati.size} sku
            </Button>
          )}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto">
        {righeLocal.length === 0 ? (
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
              {righeLocal.map((r) => (
                <TableRow key={r.id}>
                  <TableCell onClickCapture={segnalaShift}>
                    <Checkbox checked={selezionati.has(r.id)} onCheckedChange={(v) => gestisciSeleziona(r.id, v === true)} aria-label={`Seleziona ${r.skuCode}`} />
                  </TableCell>
                  <TableCell className="p-0"><Link href={`/magazzino/${r.id}`} className="block font-mono text-xs p-3">{r.skuCode}</Link></TableCell>
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

      <Dialog open={dialogBulkAperto} onOpenChange={setDialogBulkAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica in blocco</DialogTitle>
            <DialogDescription>
              Stai per modificare {selezionati.size} sku: <strong>{campoBulk ? ETICHETTE_CAMPI[campoBulk] : ""}</strong> → <strong>{etichettaValoreBulk()}</strong>. Confermi?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogBulkAperto(false)}>Annulla</Button>
            <Button type="button" onClick={confermaBulk}>Conferma modifica</Button>
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
          <button type="button" onClick={() => setUndoSlot(null)} className="text-muted-foreground opacity-70 hover:opacity-100" title="Chiudi">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
