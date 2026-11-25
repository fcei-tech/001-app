"use client";

// Finestra "Esporta" del Magazzino (Release 12, riordinata nella Release 13, 2026-11-20).
// Tre blocchi: 1 Quali sku, 2 Formato, 3 Colonne. Una sola barra dei modelli in alto.
// Le opzioni compaiono solo quando servono (miniature solo PDF, Riga Totale solo con
// Pezzi o Valore). Le colonne libere si rinominano nella loro riga. Link = solo foto.
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ClipboardList, Download, FileText, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CampoPersonalizzato } from "@/lib/campi-personalizzati";
import {
  COLONNE_EXPORT_DEFAULT,
  catalogoColonne,
  type FormatoExport,
  type GiacenzaExport,
  euroIt,
  type ModelloExport,
} from "@/lib/export-magazzino";
import { anteprimaExportAction, eliminaModelloExportAction, esportaMagazzinoAction, leggiModelliExportAction, salvaModelloExportAction } from "@/app/magazzino/export-actions";

type Ambito = "selezionati" | "filtrati" | "tutto";

const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const titoloBlocco = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function Segmentato<T extends string>({ valore, onCambia, voci, etichetta }: { valore: T; onCambia: (v: T) => void; voci: { v: T; et: string; abil?: boolean }[]; etichetta: string }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label={etichetta}>
      {voci.map((x) => (
        <button
          key={x.v}
          type="button"
          disabled={x.abil === false}
          aria-pressed={valore === x.v}
          onClick={() => onCambia(x.v)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${valore === x.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          {x.et}
        </button>
      ))}
    </div>
  );
}

function Interruttore({ acceso, onCambia, titolo, spiegazione }: { acceso: boolean; onCambia: (v: boolean) => void; titolo: string; spiegazione: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={acceso}
        aria-label={titolo}
        onClick={() => onCambia(!acceso)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${acceso ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${acceso ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-5">{titolo}</span>
        <span className="text-xs text-muted-foreground">{spiegazione}</span>
      </div>
    </div>
  );
}

function CartaScelta({ attiva, titolo, sotto, icona: Icona, onClick }: { attiva: boolean; titolo: string; sotto: string; icona: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${attiva ? "border-2 border-primary bg-primary/5 p-[11px]" : "hover:bg-muted/50"}`}
    >
      <Icona className="size-5 text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium">{titolo}</span>
      <span className="text-xs text-muted-foreground">{sotto}</span>
    </button>
  );
}


export function EsportaMagazzino({
  aperto,
  onChiudi,
  idsSelezionati,
  idsFiltrati,
  filtriAttivi,
  proprietari,
  campiPersonalizzati,
}: {
  aperto: boolean;
  onChiudi: () => void;
  idsSelezionati: number[];
  idsFiltrati: number[];
  filtriAttivi: boolean;
  proprietari: { id: number; nome: string }[];
  campiPersonalizzati: CampoPersonalizzato[];
}) {
  const [titoliLibere, setTitoliLibere] = useState<[string, string]>(["", ""]);
  const catalogo = useMemo(() => catalogoColonne(campiPersonalizzati, titoliLibere), [campiPersonalizzati, titoliLibere]);
  const [ambito, setAmbito] = useState<Ambito>(idsSelezionati.length > 0 ? "selezionati" : "filtrati");
  const [soloConPezzi, setSoloConPezzi] = useState(false);
  const [escludiAste, setEscludiAste] = useState(false);
  const [escludiBloccati, setEscludiBloccati] = useState(false);
  const [proprietarioId, setProprietarioId] = useState(0);
  const [giacenza, setGiacenza] = useState<GiacenzaExport>("sku");
  const [formato, setFormato] = useState<FormatoExport>("xlsx");
  const [colonne, setColonne] = useState<string[]>(COLONNE_EXPORT_DEFAULT);
  const [titolo, setTitolo] = useState("");
  const [conData, setConData] = useState(false);
  const [pdfFoto, setPdfFoto] = useState(false);
  const [rigaTotale, setRigaTotale] = useState(false);
  const [cerca, setCerca] = useState("");
  const [riepilogo, setRiepilogo] = useState<{ chiave: string; sku: number; righe: number; pezzi: number; valore: number; senzaCosto: number } | null>(null);
  const [modelli, setModelli] = useState<ModelloExport[]>([]);
  const [modelloAttivo, setModelloAttivo] = useState("");
  const [salvaAperto, setSalvaAperto] = useState(false);
  const [nomeModello, setNomeModello] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Il componente viene montato solo quando la finestra e' aperta (vedi
  // VistaMagazzino): lo stato parte pulito a ogni apertura.
  useEffect(() => {
    leggiModelliExportAction().then(setModelli).catch(() => setModelli([]));
  }, []);

  const fp = proprietari.find((p) => p.nome.trim().toUpperCase() === "FP");
  // Modello di fabbrica: tutto cio' che e' di FP ed esiste, una riga per sku e deposito.
  const modelloFabbrica: ModelloExport = {
    nome: "Inventario FP",
    opzioni: {
      ambito: "tutto",
      soloConPezzi: true,
      proprietarioId: fp?.id ?? 0,
      giacenza: "sku_deposito",
      formato: "xlsx",
      colonne: ["skuCode", "artista", "opera", "misura", "anno", "condizione", "deposito", "pezzi", "costo", "valore"],
      titolo: "Inventario FP",
      conData: true,
      pdfFoto: false,
      rigaTotale: true,
      titoliLibere: ["", ""],
      escludiAste: false,
      escludiBloccati: false,
    },
  };
  // Modello di fabbrica: listino da proporre a un commerciante = una riga per sku, solo quello che
  // hai a disposizione (fuori dalle aste, non bloccato), PDF con foto e una colonna "Prezzo"
  // compilabile in Acrobat.
  const modelloListino: ModelloExport = {
    nome: "Listino commerciante",
    opzioni: {
      ambito: "tutto",
      soloConPezzi: true,
      proprietarioId: 0,
      giacenza: "sku",
      formato: "pdf",
      colonne: ["skuCode", "artista", "opera", "misura", "anno", "condizione", "libera1"],
      titolo: "Listino",
      conData: true,
      pdfFoto: true,
      rigaTotale: false,
      titoliLibere: ["Prezzo", ""],
      escludiAste: true,
      escludiBloccati: true,
    },
  };

  function applicaModello(m: ModelloExport) {
    const o = m.opzioni;
    setAmbito(o.ambito === "selezionati" && idsSelezionati.length === 0 ? "filtrati" : o.ambito);
    setSoloConPezzi(o.soloConPezzi);
    setEscludiAste(o.escludiAste ?? false);
    setEscludiBloccati(o.escludiBloccati ?? false);
    setProprietarioId(proprietari.some((p) => p.id === o.proprietarioId) ? o.proprietarioId : 0);
    setGiacenza(o.giacenza);
    setFormato(o.formato);
    setColonne(o.colonne.filter((id) => catalogo.some((c) => c.id === id)));
    setTitolo(o.titolo);
    setConData(o.conData);
    setPdfFoto(o.pdfFoto);
    setRigaTotale(o.rigaTotale ?? false);
    setTitoliLibere(o.titoliLibere ?? ["", ""]);
    setModelloAttivo(m.nome);
    setNomeModello(m.nome);
  }

  function muovi(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= colonne.length) return;
    const c = [...colonne];
    [c[i], c[j]] = [c[j], c[i]];
    setColonne(c);
  }
  function attiva(id: string, v: boolean) {
    setColonne(v ? [...colonne, id] : colonne.filter((c) => c !== id));
  }

  const ids = ambito === "selezionati" ? idsSelezionati : idsFiltrati;

  // La riga Totale ha senso solo con Pezzi o Valore tra le colonne: altrimenti non si offre e non si applica.
  const totalePossibile = colonne.includes("pezzi") || colonne.includes("valore");
  const rigaTotaleEffettiva = rigaTotale && totalePossibile;

  function opzioniCorrenti() {
    return { ambito, soloConPezzi, proprietarioId, giacenza, formato, colonne, titolo, conData, pdfFoto, rigaTotale: rigaTotaleEffettiva, titoliLibere, escludiAste, escludiBloccati };
  }

  // Riepilogo "Verra' esportato": si ricalcola quando cambia una scelta che
  // modifica le righe (le colonne e il formato non le cambiano).
  const chiaveRiepilogo = `${ambito}|${ids.join(",")}|${soloConPezzi}|${proprietarioId}|${giacenza}|${escludiAste}|${escludiBloccati}`;
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      anteprimaExportAction({ ambito, soloConPezzi, proprietarioId, giacenza, formato: "xlsx", colonne: [], titolo: "", conData: false, pdfFoto: false, rigaTotale: false, titoliLibere: ["", ""], escludiAste, escludiBloccati, skuIds: ids })
        .then((r) => { if (vivo) setRiepilogo({ chiave: chiaveRiepilogo, ...r }); })
        .catch(() => undefined);
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveRiepilogo]);

  function esporta() {
    setErrore(null);
    setEsito(null);
    start(async () => {
      const r = await esportaMagazzinoAction({ ...opzioniCorrenti(), skuIds: ids });
      if (!r.ok) {
        setErrore(r.errore);
        return;
      }
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setEsito(`Scaricato ${r.filename} (${r.righe} righe)${r.senzaMiniatura > 0 ? `. ${r.senzaMiniatura} righe senza miniatura (restano i link).` : "."}`);
    });
  }

  function salvaModello() {
    start(async () => {
      const r = await salvaModelloExportAction({ nome: nomeModello, opzioni: opzioniCorrenti() });
      if (!r.ok) {
        setErrore(r.errore ?? "Errore");
        return;
      }
      setErrore(null);
      setModelloAttivo(nomeModello.trim());
      setSalvaAperto(false);
      setModelli(await leggiModelliExportAction());
    });
  }

  const etichetta = (id: string) => catalogo.find((c) => c.id === id)?.etichetta ?? id;
  const nonScelte = catalogo.filter((c) => !colonne.includes(c.id));
  const q = cerca.trim().toLowerCase();
  const nonScelteFiltrate = nonScelte.filter((c) => !q || c.etichetta.toLowerCase().includes(q));
  const normali = nonScelteFiltrate.filter((c) => !c.id.startsWith("libera"));
  const libere = nonScelteFiltrate.filter((c) => c.id.startsWith("libera"));
  const nomeAttivoSalvato = modelli.some((m) => m.nome === modelloAttivo);

  function cambiaTitoloLibera(id: string, v: string) {
    const i = id === "libera1" ? 0 : 1;
    setTitoliLibere(i === 0 ? [v, titoliLibere[1]] : [titoliLibere[0], v]);
  }

  const [avanzate, setAvanzate] = useState(false);
  const personalizzatoAttivo = modelloAttivo !== modelloFabbrica.nome && modelloAttivo !== modelloListino.nome;

  return (
    <Dialog open={aperto} onOpenChange={(a) => { if (!a) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Esporta dal Magazzino</DialogTitle>
          <DialogDescription>Nei file ci sono solo i link alle foto, mai agli annunci dei portali.</DialogDescription>
        </DialogHeader>

        {/* Cosa vuoi: una scelta e sei gia' pronto */}
        <div className="grid gap-3 sm:grid-cols-3">
          <CartaScelta attiva={modelloAttivo === modelloFabbrica.nome} titolo="Inventario FP" sotto="Excel per il commercialista" icona={ClipboardList} onClick={() => applicaModello(modelloFabbrica)} />
          <CartaScelta attiva={modelloAttivo === modelloListino.nome} titolo="Listino commerciante" sotto="PDF con colonna Prezzo" icona={FileText} onClick={() => applicaModello(modelloListino)} />
          <CartaScelta
            attiva={personalizzatoAttivo}
            titolo="Personalizzato"
            sotto="Scegli tu colonne e formato"
            icona={SlidersHorizontal}
            onClick={() => {
              setModelloAttivo("");
              setAvanzate(true);
            }}
          />
        </div>
        {modelli.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">I tuoi modelli</span>
            {modelli.map((m) => (
              <span key={m.nome} className={`inline-flex items-center overflow-hidden rounded-full border ${modelloAttivo === m.nome ? "border-primary bg-primary/10" : ""}`}>
                <button type="button" className="px-3 py-1 hover:bg-muted" onClick={() => applicaModello(m)}>{m.nome}</button>
                <button
                  type="button"
                  aria-label={`Elimina il modello ${m.nome}`}
                  className="border-l px-2 py-1 text-muted-foreground hover:bg-muted"
                  onClick={() => start(async () => { await eliminaModelloExportAction(m.nome); setModelli(await leggiModelliExportAction()); })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Quali sku e formato: una riga sola */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Quali sku</span>
            <Segmentato<Ambito>
              etichetta="Quali sku"
              valore={ambito}
              onCambia={setAmbito}
              voci={[
                { v: "selezionati", et: `Selezionati${idsSelezionati.length > 0 ? ` (${idsSelezionati.length})` : ""}`, abil: idsSelezionati.length > 0 },
                { v: "filtrati", et: filtriAttivi ? "Filtrati" : "In elenco" },
                { v: "tutto", et: "Tutto" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Formato</span>
            <Segmentato<FormatoExport> etichetta="Formato" valore={formato} onCambia={setFormato} voci={[{ v: "xlsx", et: "Excel" }, { v: "csv", et: "CSV" }, { v: "pdf", et: "PDF" }]} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Interruttore acceso={escludiAste} onCambia={setEscludiAste} titolo="Senza pezzi nelle aste fisiche" spiegazione="Quelli già consegnati a una casa d'asta restano fuori." />
          <Interruttore acceso={escludiBloccati} onCambia={setEscludiBloccati} titolo="Senza sku bloccati" spiegazione="Gli sku bloccati alla vendita non compaiono." />
        </div>

        {/* Opzioni avanzate: solo se servono */}
        <button type="button" onClick={() => setAvanzate((v) => !v)} aria-expanded={avanzate} className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
          {avanzate ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Personalizza colonne, titolo e totale
        </button>

        {avanzate && (
          <div className="flex flex-col gap-5 rounded-xl border bg-muted/20 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={soloConPezzi} onCheckedChange={(v) => setSoloConPezzi(v === true)} />
                Solo sku con pezzi disponibili
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Proprietario</span>
                <select className={`${select} flex-1`} value={proprietarioId} onChange={(e) => setProprietarioId(Number(e.target.value))} aria-label="Proprietario">
                  <option value={0}>Tutti</option>
                  {proprietari.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <span className="text-muted-foreground">Righe</span>
                <select className={`${select} w-64`} value={giacenza} onChange={(e) => setGiacenza(e.target.value as GiacenzaExport)} aria-label="Giacenza">
                  <option value="sku">Una riga per sku</option>
                  <option value="sku_deposito">Una riga per sku e deposito</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              {formato === "pdf" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfFoto} onCheckedChange={(v) => setPdfFoto(v === true)} />
                  Miniature e link alle foto
                  <span className="rounded border border-dashed px-1.5 text-[11px] text-muted-foreground">solo PDF</span>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">Nessuna immagine nelle celle: per il link alla foto principale scegli la colonna &quot;Foto principale (link)&quot;.</p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <Input className="h-9 min-w-48 flex-1" placeholder="Titolo in testa (facoltativo)" value={titolo} onChange={(e) => setTitolo(e.target.value)} aria-label="Titolo in testa" />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={conData} onCheckedChange={(v) => setConData(v === true)} />
                  Data di oggi
                </label>
              </div>
              {totalePossibile && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={rigaTotale} onCheckedChange={(v) => setRigaTotale(v === true)} />
                  Riga Totale in fondo
                  <span className="rounded border border-dashed px-1.5 text-[11px] text-muted-foreground">pezzi e valore</span>
                </label>
              )}
            </div>

            <div>
              <p className={`${titoloBlocco} mb-2`}>Colonne</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="max-h-72 overflow-y-auto rounded-md border bg-background">
                  {colonne.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessuna colonna scelta.</p>}
                  {colonne.map((id, i) => {
                    const libera = id.startsWith("libera");
                    return (
                      <div key={id} className={`flex items-center justify-between gap-2 border-b px-2 py-1 text-sm last:border-b-0 ${libera ? "bg-muted/40" : ""}`}>
                        {libera ? (
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Input
                              className="h-7 max-w-32"
                              value={titoliLibere[id === "libera1" ? 0 : 1]}
                              placeholder={`Colonna libera ${id === "libera1" ? 1 : 2}`}
                              onChange={(e) => cambiaTitoloLibera(id, e.target.value)}
                              aria-label={`Titolo colonna libera ${id === "libera1" ? 1 : 2}`}
                            />
                            <span className="whitespace-nowrap rounded border border-dashed px-1.5 text-[11px] text-muted-foreground">libera{formato === "pdf" ? " · compilabile" : ""}</span>
                          </span>
                        ) : (
                          <span className="truncate">{etichetta(id)}</span>
                        )}
                        <span className="flex items-center">
                          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Su" onClick={() => muovi(i, -1)}><ArrowUp className="size-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Giù" onClick={() => muovi(i, 1)}><ArrowDown className="size-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Togli ${etichetta(id)}`} onClick={() => attiva(id, false)}><X className="size-4" /></Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  <Input className="h-9" placeholder="Cerca una colonna…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca una colonna" />
                  <div className="max-h-60 overflow-y-auto rounded-md border bg-background">
                    {normali.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b px-2 py-1 text-sm last:border-b-0 hover:bg-muted/50">
                        <Checkbox checked={false} onCheckedChange={(v) => attiva(c.id, v === true)} />
                        {c.etichetta}
                      </label>
                    ))}
                    {libere.map((c, k) => (
                      <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-2 border-b px-2 py-1 text-sm last:border-b-0 hover:bg-muted/50 ${k === 0 ? "border-t border-dashed" : ""}`}>
                        <span className="flex items-center gap-2">
                          <Checkbox checked={false} onCheckedChange={(v) => attiva(c.id, v === true)} />
                          {c.etichetta}
                        </span>
                        <span className="rounded border border-dashed px-1.5 text-[11px] text-muted-foreground">vuota</span>
                      </label>
                    ))}
                    {normali.length === 0 && libere.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">{nonScelte.length === 0 ? "Hai scelto tutte le colonne." : "Nessuna colonna con questo nome."}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setSalvaAperto((v) => !v)}>Salva come modello…</Button>
                {salvaAperto && (
                  <>
                    <Input className="h-9 w-56" placeholder="Nome del modello" value={nomeModello} onChange={(e) => setNomeModello(e.target.value)} />
                    <Button type="button" size="sm" disabled={pending || !nomeModello.trim()} onClick={salvaModello}>Salva</Button>
                  </>
                )}
              </div>
              {salvaAperto && nomeAttivoSalvato && nomeModello.trim() === modelloAttivo && <span className="text-xs text-muted-foreground">Sostituisce il modello con lo stesso nome.</span>}
            </div>
          </div>
        )}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {riepilogo === null || riepilogo.chiave !== chiaveRiepilogo ? (
            <span className="text-muted-foreground">Calcolo…</span>
          ) : riepilogo.righe === 0 ? (
            <span className="text-destructive">Con queste scelte non resta nessuna riga.</span>
          ) : (
            <>
              <span className="font-medium">Verrà esportato:</span> {riepilogo.sku} sku · {riepilogo.righe} righe · {riepilogo.pezzi} pezzi · valore {euroIt(riepilogo.valore)}
              {riepilogo.senzaCosto > 0 && <span className="text-muted-foreground"> ({riepilogo.senzaCosto} righe senza costo, non contate nel valore)</span>}
            </>
          )}
        </div>

        {(colonne.includes("valore") && !(colonne.includes("costo") && colonne.includes("pezzi"))) && (
          <p className="text-xs text-warning">Per il Valore (costo × pezzi) servono anche le colonne &quot;Costo unitario&quot; e &quot;Pezzi&quot;.</p>
        )}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {esito && <p className="text-sm text-success">{esito}</p>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onChiudi}>Chiudi</Button>
          <Button type="button" disabled={pending || colonne.length === 0} onClick={esporta}>
            <Download /> {pending ? "Preparo…" : "Esporta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
