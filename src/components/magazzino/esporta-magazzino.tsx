"use client";

// Finestra "Esporta" del Magazzino (Release 12, 2026-11-20): "quello che voglio,
// come voglio". Cosa (selezionati / filtrati / tutto), giacenza, formato,
// colonne a scelta e riordinabili, modelli salvati. Link = solo foto.
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
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
  type ModelloExport,
} from "@/lib/export-magazzino";
import { eliminaModelloExportAction, esportaMagazzinoAction, leggiModelliExportAction, salvaModelloExportAction } from "@/app/magazzino/export-actions";

type Ambito = "selezionati" | "filtrati" | "tutto";

const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";

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
  const catalogo = useMemo(() => catalogoColonne(campiPersonalizzati), [campiPersonalizzati]);
  const [ambito, setAmbito] = useState<Ambito>(idsSelezionati.length > 0 ? "selezionati" : "filtrati");
  const [soloConPezzi, setSoloConPezzi] = useState(false);
  const [proprietarioId, setProprietarioId] = useState(0);
  const [giacenza, setGiacenza] = useState<GiacenzaExport>("sku");
  const [formato, setFormato] = useState<FormatoExport>("xlsx");
  const [colonne, setColonne] = useState<string[]>(COLONNE_EXPORT_DEFAULT);
  const [titolo, setTitolo] = useState("");
  const [conData, setConData] = useState(false);
  const [pdfFoto, setPdfFoto] = useState(false);
  const [modelli, setModelli] = useState<ModelloExport[]>([]);
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
    },
  };

  function applicaModello(m: ModelloExport) {
    const o = m.opzioni;
    setAmbito(o.ambito === "selezionati" && idsSelezionati.length === 0 ? "filtrati" : o.ambito);
    setSoloConPezzi(o.soloConPezzi);
    setProprietarioId(proprietari.some((p) => p.id === o.proprietarioId) ? o.proprietarioId : 0);
    setGiacenza(o.giacenza);
    setFormato(o.formato);
    setColonne(o.colonne.filter((id) => catalogo.some((c) => c.id === id)));
    setTitolo(o.titolo);
    setConData(o.conData);
    setPdfFoto(o.pdfFoto);
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
  const nSku = ambito === "tutto" ? null : ids.length;

  function opzioniCorrenti() {
    return { ambito, soloConPezzi, proprietarioId, giacenza, formato, colonne, titolo, conData, pdfFoto };
  }

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
      if (!r.ok) setErrore(r.errore ?? "Errore");
      else setModelli(await leggiModelliExportAction());
    });
  }

  const nonScelte = catalogo.filter((c) => !colonne.includes(c.id));
  const etichetta = (id: string) => catalogo.find((c) => c.id === id)?.etichetta ?? id;

  return (
    <Dialog open={aperto} onOpenChange={(a) => { if (!a) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Esporta dal Magazzino</DialogTitle>
          <DialogDescription>
            Scegli cosa esportare, in che formato e quali colonne. I collegamenti sono solo alle foto (mai agli annunci dei portali).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Modelli:</span>
          <Button type="button" size="sm" variant="outline" onClick={() => applicaModello(modelloFabbrica)}>Inventario FP</Button>
          {modelli.map((m) => (
            <span key={m.nome} className="inline-flex items-center overflow-hidden rounded-md border">
              <button type="button" className="px-2 py-1 hover:bg-muted" onClick={() => applicaModello(m)}>{m.nome}</button>
              <button
                type="button"
                aria-label={`Elimina il modello ${m.nome}`}
                className="border-l px-1.5 py-1 text-muted-foreground hover:bg-muted"
                onClick={() => start(async () => { await eliminaModelloExportAction(m.nome); setModelli(await leggiModelliExportAction()); })}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Cosa</p>
            {([
              ["selezionati", `Sku selezionati (${idsSelezionati.length})`, idsSelezionati.length > 0],
              ["filtrati", `${filtriAttivi ? "Sku filtrati" : "Sku in elenco"} (${idsFiltrati.length})`, true],
              ["tutto", "Tutto il magazzino", true],
            ] as [Ambito, string, boolean][]).map(([v, et, abil]) => (
              <label key={v} className={`flex items-center gap-2 text-sm ${abil ? "" : "opacity-50"}`}>
                <input type="radio" name="ambito" checked={ambito === v} disabled={!abil} onChange={() => setAmbito(v)} />
                {et}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={soloConPezzi} onCheckedChange={(v) => setSoloConPezzi(v === true)} />
              Solo con pezzi disponibili
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Proprietario</span>
              <select className={select} value={proprietarioId} onChange={(e) => setProprietarioId(Number(e.target.value))}>
                <option value={0}>Tutti</option>
                {proprietari.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Come</p>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Giacenza</span>
              <select className={select} value={giacenza} onChange={(e) => setGiacenza(e.target.value as GiacenzaExport)}>
                <option value="sku">Una riga per sku</option>
                <option value="sku_deposito">Una riga per sku e deposito</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Formato</span>
              <select className={select} value={formato} onChange={(e) => setFormato(e.target.value as FormatoExport)}>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (per Excel italiano)</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            {formato === "pdf" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={pdfFoto} onCheckedChange={(v) => setPdfFoto(v === true)} />
                Con miniature e link alle foto
              </label>
            )}
            {formato !== "pdf" && (
              <p className="text-xs text-muted-foreground">
                Nessuna immagine nelle celle: per il link alla foto principale scegli la colonna &quot;Foto principale (link)&quot;.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Titolo in testa (facoltativo)</span>
              <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={conData} onCheckedChange={(v) => setConData(v === true)} />
              Scrivi la data di oggi in testa
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Colonne nel file (in questo ordine)</p>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {colonne.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessuna colonna scelta.</p>}
              {colonne.map((id, i) => (
                <div key={id} className="flex items-center justify-between gap-2 border-b px-2 py-1 text-sm last:border-b-0">
                  <span>{etichetta(id)}</span>
                  <span className="flex items-center">
                    <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Su" onClick={() => muovi(i, -1)}><ArrowUp className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Giù" onClick={() => muovi(i, 1)}><ArrowDown className="size-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => attiva(id, false)}>Togli</Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Altre colonne disponibili</p>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {nonScelte.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b px-2 py-1 text-sm last:border-b-0 hover:bg-muted/50">
                  <Checkbox checked={false} onCheckedChange={(v) => attiva(c.id, v === true)} />
                  {c.etichetta}
                </label>
              ))}
              {nonScelte.length === 0 && <p className="p-3 text-sm text-muted-foreground">Hai scelto tutte le colonne.</p>}
            </div>
          </div>
        </div>

        {(colonne.includes("valore") && !(colonne.includes("costo") && colonne.includes("pezzi"))) && (
          <p className="text-xs text-warning">Per il Valore (costo × pezzi) servono anche le colonne &quot;Costo unitario&quot; e &quot;Pezzi&quot;.</p>
        )}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {esito && <p className="text-sm text-success">{esito}</p>}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Input className="h-9 w-44" placeholder="Nome del modello" value={nomeModello} onChange={(e) => setNomeModello(e.target.value)} />
            <Button type="button" variant="outline" disabled={pending || !nomeModello.trim()} onClick={salvaModello}>Salva modello</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onChiudi}>Chiudi</Button>
            <Button type="button" disabled={pending || colonne.length === 0} onClick={esporta}>
              <Download /> {pending ? "Preparo…" : nSku === null ? "Esporta tutto" : `Esporta ${nSku} sku`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
