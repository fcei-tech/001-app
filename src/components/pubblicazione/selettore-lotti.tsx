"use client";

import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Search, Columns3, X, ArrowUp, ArrowDown, ArrowUpDown, TriangleAlert, RotateCcw } from "lucide-react";
import type { RigaMagazzino, ColonnaOrdinabile } from "@/db/queries";
import { aggiungiLottiABatch } from "@/app/pubblicazione/actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

// Modulo dedicato per il picker lotti di Pubblicazione - NON e' VistaMagazzino
// riusata (vedi decisione 2026-09-23 sera: quel componente e' troppo
// accoppiato a editing inline/bulk-edit/undo, qui serve sola lettura +
// selezione multipla). Stessi PATTERN pero': filtri in useState + router.push
// con URLSearchParams (mai form nativo GET con Radix <Select>, vedi
// fix_filtri_lista_magazzino_2026_09_23 - il bug WKWebView e' reale anche
// qui), colonne visibili in localStorage via useSyncExternalStore, intestazioni
// ordinabili a tre stati (asc -> desc -> azzerato). Chiave localStorage
// distinta dal Magazzino: e' una preferenza di visualizzazione diversa,
// stesso utente ma contesto diverso.
const CHIAVE_COLONNE = "posterclub.pubblicazione.selettoreLotti.colonneVisibili.v1";

type ColonnaId =
  | "artista"
  | "opera"
  | "misura"
  | "supporto"
  | "anno"
  | "tipo"
  | "condizione"
  | "proprieta"
  | "numeroFoto"
  | "valoreCarico"
  | "prezzoEbay"
  | "prezzoCatawiki"
  | "riservaCatawiki"
  | "tag"
  | "note";

type DefinizioneColonna = {
  id: ColonnaId;
  etichetta: string;
  defaultVisibile: boolean;
  allineaDestra?: boolean;
  chiaveOrdinamento: ColonnaOrdinabile;
  render: (r: RigaMagazzino) => React.ReactNode;
};

function formatEuro(v: string | null) {
  return v ? `€ ${v}` : "—";
}
function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

// Colonne opzionali del picker. Disponibile/impegnato NON sono qui dentro:
// sono sempre mostrate, fisse, perche' sono il motivo stesso per cui questo
// modulo esiste (segnalazione impegnato, mai un filtro opzionale - vedi
// avviso_gia_pubblicato_non_blocco confermato in sessione precedente).
const COLONNE: DefinizioneColonna[] = [
  { id: "artista", etichetta: "Artista", defaultVisibile: true, chiaveOrdinamento: "artista", render: (r) => r.artista },
  { id: "opera", etichetta: "Opera", defaultVisibile: true, chiaveOrdinamento: "opera", render: (r) => r.opera },
  {
    id: "misura", etichetta: "Misura", defaultVisibile: true, chiaveOrdinamento: "larghezza",
    render: (r) => (r.larghezza || r.altezza ? `${r.larghezza ?? "?"} × ${r.altezza ?? "?"} cm` : "—"),
  },
  { id: "supporto", etichetta: "Supporto", defaultVisibile: false, chiaveOrdinamento: "supporto", render: (r) => r.supporto || "—" },
  { id: "anno", etichetta: "Anno / epoca", defaultVisibile: false, chiaveOrdinamento: "anno", render: (r) => r.anno || "—" },
  { id: "tipo", etichetta: "Tipo", defaultVisibile: true, chiaveOrdinamento: "tipo", render: (r) => r.tipo },
  {
    id: "condizione", etichetta: "Condizione", defaultVisibile: true, chiaveOrdinamento: "condizione",
    render: (r) => <Badge variant={condizioneVariant(r.condizione)}>{r.condizione}</Badge>,
  },
  { id: "proprieta", etichetta: "Proprietà", defaultVisibile: false, chiaveOrdinamento: "proprieta", render: (r) => r.proprieta || "—" },
  { id: "numeroFoto", etichetta: "N. foto", defaultVisibile: false, allineaDestra: true, chiaveOrdinamento: "numeroFoto", render: (r) => r.numeroFoto },
  { id: "valoreCarico", etichetta: "Valore di carico", defaultVisibile: false, allineaDestra: true, chiaveOrdinamento: "valoreCarico", render: (r) => formatEuro(r.valoreCarico) },
  { id: "prezzoEbay", etichetta: "Prezzo eBay", defaultVisibile: false, allineaDestra: true, chiaveOrdinamento: "prezzoEbay", render: (r) => formatEuro(r.prezzoEbay) },
  { id: "prezzoCatawiki", etichetta: "Prezzo Catawiki", defaultVisibile: false, allineaDestra: true, chiaveOrdinamento: "prezzoCatawiki", render: (r) => formatEuro(r.prezzoCatawiki) },
  { id: "riservaCatawiki", etichetta: "Riserva Catawiki", defaultVisibile: false, allineaDestra: true, chiaveOrdinamento: "riservaCatawiki", render: (r) => formatEuro(r.riservaCatawiki) },
  { id: "tag", etichetta: "Tag", defaultVisibile: false, chiaveOrdinamento: "tag", render: (r) => r.tag || "—" },
  { id: "note", etichetta: "Note", defaultVisibile: false, chiaveOrdinamento: "note", render: (r) => r.note || "—" },
];

function colonneDiDefault(): Record<ColonnaId, boolean> {
  return Object.fromEntries(COLONNE.map((c) => [c.id, c.defaultVisibile])) as Record<ColonnaId, boolean>;
}
// Stesso motivo di COLONNE_DI_DEFAULT in vista-magazzino.tsx: riferimento
// stabile fra render, richiesto da useSyncExternalStore (getServerSnapshot).
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

export type FiltriPickerIniziali = {
  q: string;
  tipo: string;
  condizione: string;
  proprieta: string;
  confoto: string;
};

export function SelettoreLottiBatch({
  righe,
  tipi,
  batchId,
  canaleId,
  tipoCanale,
  basePath,
  filtriIniziali,
  filtriAttivi,
  ordinaAttuale,
  direzioneAttuale,
}: {
  righe: RigaMagazzino[];
  tipi: { id: number; nome: string }[];
  batchId: number;
  canaleId: number;
  // Determina se mostrare le colonne editabili Prezzo/Riserva evento
  // (2026-09-24, richiesta esplicita utente): solo sui canali asta_online
  // (Catawiki, Bidspirit, eBay Asta - tutti trattati uguale, nessun caso
  // speciale per nome). Su asta_fisica la Riserva proposta si compila solo
  // dopo, in "Lotti nel batch" (non ha senso prima di sapere cosa entra nel
  // batch) - vedi pagina [batchId]/page.tsx.
  tipoCanale: "statico" | "asta_online" | "asta_fisica";
  // Percorso base della pagina batch corrente (es. /pubblicazione/3/12) - i
  // filtri di questo picker vivono nella stessa URL del batch, non in una
  // route separata.
  basePath: string;
  filtriIniziali: FiltriPickerIniziali;
  filtriAttivi: boolean;
  ordinaAttuale?: ColonnaOrdinabile;
  direzioneAttuale: "asc" | "desc";
}) {
  const router = useRouter();
  const [filtri, setFiltri] = useState(filtriIniziali);
  const ordinamentoCorrente: ColonnaOrdinabile = ordinaAttuale ?? "skuCode";
  const ordinamentoAttivo = Boolean(ordinaAttuale);
  const colonne = useSyncExternalStore(sottoscriviColonne, leggiColonneSalvate, () => COLONNE_DI_DEFAULT);
  // Selezione multipla stile file-manager (shift+click estende a un
  // intervallo) - 2026-09-25, punto 3 del backlog UX FINALIZZATO, vedi
  // src/lib/selezione-multipla.ts.
  const { selezionati, gestisciSeleziona, segnalaShift, selezionaTutti } = useSelezioneMultipla<number>(
    righe.map((r) => r.id)
  );
  // Prezzo/riserva evento per sku, solo asta_online (2026-09-24): stato
  // locale nel picker perche' il lotto non esiste ancora in batch_lotti a
  // questo punto - i valori viaggiano come input nascosti prezzo_<id>/
  // riserva_<id> nel submit e finiscono nell'override al momento
  // dell'inserimento (vedi aggiungiLotti in pubblicazione-queries.ts).
  const [overrideOnline, setOverrideOnline] = useState<Record<number, { prezzo: string; riserva: string }>>({});
  const mostraOverrideOnline = tipoCanale === "asta_online";

  function impostaOverrideOnline(id: number, campo: "prezzo" | "riserva", valore: string) {
    setOverrideOnline((prev) => ({
      ...prev,
      [id]: { prezzo: prev[id]?.prezzo ?? "", riserva: prev[id]?.riserva ?? "", [campo]: valore },
    }));
  }

  const colonneVisibili = useMemo(() => COLONNE.filter((c) => colonne[c.id]), [colonne]);

  function impostaColonna(id: ColonnaId, visibile: boolean) {
    scriviColonneSalvate({ ...colonne, [id]: visibile });
  }

  // "Ripristina colonne predefinite" (2026-09-25, stessa richiesta e stesso
  // meccanismo del Magazzino - vedi vista-magazzino.tsx). Chiave localStorage
  // distinta da quella del Magazzino MA condivisa fra TUTTI i picker di
  // Pubblicazione, qualsiasi canale (per design, vedi commento su
  // CHIAVE_COLONNE sopra) - il ripristino qui riporta al default anche i
  // picker degli altri canali, non solo quello aperto in questo momento.
  function ripristinaColonne() {
    scriviColonneSalvate(COLONNE_DI_DEFAULT);
  }

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
    if (f.confoto === "si") params.set("confoto", "si");
    if (!azzeraOrdinamento) {
      const ordinaFinale = ordinaOverride ?? ordinaAttuale;
      const direzioneFinale = ordinaOverride ? (direzioneOverride ?? "asc") : direzioneAttuale;
      if (ordinaFinale) params.set("ordina", ordinaFinale);
      if (ordinaFinale && direzioneFinale === "desc") params.set("direzione", "desc");
    }
    const qs = params.toString();
    // scroll: false (2026-09-23 sera, feedback utente dopo test installazione
    // reale: "clicco ordina/azzera filtri e la finestra scrolla verso
    // l'alto"): router.push di Next.js riporta la pagina in cima ad ogni
    // navigazione per default, comodo per un cambio pagina vero, fastidioso
    // qui dove filtro/ordino la STESSA lista restando sul posto - lo stesso
    // identico pattern (router.push senza scroll:false) e' presente anche in
    // src/components/magazzino/vista-magazzino.tsx, non toccato qui - stesso
    // fix applicabile li' se richiesto separatamente.
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  function azzeraFiltri() {
    const vuoti: typeof filtri = { q: "", tipo: "tutti", condizione: "tutti", proprieta: "tutti", confoto: "no" };
    setFiltri(vuoti);
    applicaFiltri(vuoti, undefined, undefined, true);
  }

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

  const tuttiSelezionati = righe.length > 0 && righe.every((r) => selezionati.has(r.id));
  const alcuniSelezionati = !tuttiSelezionati && righe.some((r) => selezionati.has(r.id));

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
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

          <Select value={filtri.confoto} onValueChange={(v) => setFiltri((f) => ({ ...f, confoto: v }))}>
            <SelectTrigger className="w-44" aria-label="Foto"><SelectValue placeholder="Foto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Foto: tutti</SelectItem>
              <SelectItem value="si">Solo con foto salvate</SelectItem>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); ripristinaColonne(); }}>
                <RotateCcw /> Ripristina colonne predefinite
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </form>

      <form action={aggiungiLottiABatch} className="flex flex-col gap-3">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="canaleId" value={canaleId} />
        {Array.from(selezionati).map((id) => (
          <Fragment key={id}>
            <input type="hidden" name="skuId" value={id} />
            {mostraOverrideOnline && (
              <>
                <input type="hidden" name={`prezzo_${id}`} value={overrideOnline[id]?.prezzo ?? ""} />
                <input type="hidden" name={`riserva_${id}`} value={overrideOnline[id]?.riserva ?? ""} />
              </>
            )}
          </Fragment>
        ))}

        {/* Bottone in cima, non in fondo (2026-09-23 notte, feedback utente
            dopo test installazione reale: "il bottone aggiungi sku in basso
            e' scomodo se le liste sono lunghe" -> "voglio i bottoni in
            alto", rigettando esplicitamente la versione precedente con
            barra sticky in fondo alla viewport). Sta comunque dentro questo
            form: la posizione nel JSX non deve coincidere con l'ultimo
            elemento del form perche' il submit funzioni. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {righe.length} sku disponibili con questi filtri (già esclusi: bloccati per la vendita, quantità esaurita, già presenti nel batch).
          </p>
          <div className="flex items-center gap-3">
            {selezionati.size > 0 && (
              <span className="text-sm text-muted-foreground">{selezionati.size} selezionati</span>
            )}
            <Button type="submit" disabled={selezionati.size === 0}>
              Aggiungi {selezionati.size > 0 ? `${selezionati.size} sku` : "selezionati"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border overflow-x-auto">
          {righe.length === 0 ? (
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
                  {colonneVisibili.map((c) => (
                    <IntestazioneOrdinabile
                      key={c.id}
                      etichetta={c.etichetta}
                      chiave={c.chiaveOrdinamento}
                      attiva={ordinamentoCorrente === c.chiaveOrdinamento}
                      direzione={direzioneAttuale}
                      allineaDestra={c.allineaDestra}
                      onOrdina={gestisciOrdinamento}
                    />
                  ))}
                  <IntestazioneOrdinabile
                    etichetta="Disponibile"
                    chiave="disponibile"
                    attiva={ordinamentoCorrente === "disponibile"}
                    direzione={direzioneAttuale}
                    allineaDestra
                    onOrdina={gestisciOrdinamento}
                  />
                  <IntestazioneOrdinabile
                    etichetta="Impegnato"
                    chiave="impegnato"
                    attiva={ordinamentoCorrente === "impegnato"}
                    direzione={direzioneAttuale}
                    allineaDestra
                    onOrdina={gestisciOrdinamento}
                  />
                  {mostraOverrideOnline && <TableHead>Prezzo / Riserva evento</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => {
                  const disponibileReale = r.quantitaDisponibile - r.impegnato;
                  return (
                    <TableRow key={r.id}>
                      <TableCell onClickCapture={segnalaShift}>
                        <Checkbox checked={selezionati.has(r.id)} onCheckedChange={(v) => gestisciSeleziona(r.id, v === true)} aria-label={`Seleziona ${r.skuCode}`} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.skuCode}</TableCell>
                      {colonneVisibili.map((c) => (
                        <TableCell key={c.id} className={c.allineaDestra ? "text-right tabular-nums" : undefined}>
                          {c.render(r)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">{r.quantitaDisponibile}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.impegnato > 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 ${disponibileReale <= 0 ? "font-medium text-warning" : "text-muted-foreground"}`}
                            title={
                              disponibileReale <= 0
                                ? "Già impegnato per intero su un altro batch confermato (canale esclusivo) - selezionabile comunque, verifica prima di confermare."
                                : "Parzialmente impegnato su un altro batch confermato (canale esclusivo)."
                            }
                          >
                            {disponibileReale <= 0 && <TriangleAlert className="size-3.5" />}
                            {r.impegnato}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      {mostraOverrideOnline && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="text"
                              value={overrideOnline[r.id]?.prezzo ?? ""}
                              onChange={(e) => impostaOverrideOnline(r.id, "prezzo", e.target.value)}
                              placeholder="prezzo"
                              className="h-8 w-20"
                            />
                            <Input
                              type="text"
                              value={overrideOnline[r.id]?.riserva ?? ""}
                              onChange={(e) => impostaOverrideOnline(r.id, "riserva", e.target.value)}
                              placeholder="riserva"
                              className="h-8 w-20"
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </form>
    </div>
  );
}
