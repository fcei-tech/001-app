"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { anteprimaPuliziaAction, eseguiPuliziaAction } from "@/app/sistema/pulizia/actions";
import type { AnteprimaPulizia, SceltaPulizia } from "@/db/pulizia";

// "Ripartenza dei dati": prepara il software a ricevere FP/CV come punto
// zero. La scelta di base cancella solo cio' che si ricarica dal file
// (movimenti) o che era prova (batch, errori silenziati, dati degli sku);
// blocchi per portale, registro "caricato" e sku restano, perche' sono
// decisioni reali (blocchi dal Master) o stato reale (cosa e' online).
const INIZIALE: SceltaPulizia = {
  movimenti: true,
  batch: true,
  silenziamenti: true,
  anagrafica: true,
  blocchi: false,
  caricato: false,
  skuSenzaFoto: false,
};

type Voce = {
  chiave: keyof SceltaPulizia;
  titolo: string;
  // Riga nell'elenco "Verra' cancellato"
  cancella: (a: AnteprimaPulizia) => string;
  // Riga nell'elenco "Resta" quando la voce NON e' scelta
  resta: (a: AnteprimaPulizia) => string;
  // Spiegazione nel pannello Personalizza
  spiega: string;
  avviso?: boolean;
};

const VOCI: Voce[] = [
  {
    chiave: "movimenti",
    titolo: "Movimenti di magazzino",
    cancella: (a) => `${a.movimenti} movimenti (${a.pezziAttuali} pezzi a registro): le giacenze tornano a zero`,
    resta: (a) => `${a.movimenti} movimenti e le giacenze attuali (${a.pezziAttuali} pezzi)`,
    spiega: "Rimette le giacenze a zero. Poi le ricarichi con Importa da Excel (FP e CV).",
  },
  {
    chiave: "batch",
    titolo: "Batch e lotti",
    cancella: (a) => `${a.batch} batch con ${a.lotti} lotti, di tutti i portali`,
    resta: (a) => `${a.batch} batch con ${a.lotti} lotti`,
    spiega: "Cancella i batch di pubblicazione e i loro lotti. Controlla prima che non ce ne sia uno vero che ti serve.",
  },
  {
    chiave: "silenziamenti",
    titolo: "Errori silenziati",
    cancella: (a) => `${a.silenziamenti} errori di validazione messi a tacere`,
    resta: (a) => `${a.silenziamenti} errori silenziati`,
    spiega: "Gli errori di validazione dell'output che avevi accettato e messo a tacere.",
  },
  {
    chiave: "anagrafica",
    titolo: "Dati degli sku",
    cancella: (a) =>
      `i dati di ${a.skuTotali} sku: misure, supporto, anno, note, tag, costo, prezzi, riserva, condizione, blocco vendita (restano artista e opera)`,
    resta: (a) => `i dati attuali di ${a.skuTotali} sku (misure, prezzi, note, tag...)`,
    spiega: "Svuota misure, supporto, anno, note, tag, costo, prezzi eBay/Catawiki, riserva. Così nulla di vecchio si mescola ai dati di FP/CV.",
  },
  {
    chiave: "blocchi",
    titolo: "Blocchi per portale",
    cancella: (a) => `${a.blocchi} blocchi per portale`,
    resta: (a) => `${a.blocchi} blocchi per portale (sku esclusi da un portale)`,
    spiega:
      "Gli sku esclusi da un portale, per esempio importati dal Master (colonne PUB_ con valore 0). Se li cancelli non tornano dall'import FP/CV.",
    avviso: true,
  },
  {
    chiave: "caricato",
    titolo: "Registro \"caricato\"",
    cancella: (a) => `${a.caricato} righe del registro "caricato" dei portali`,
    resta: (a) => `${a.caricato} righe del registro "caricato" (cosa è già online)`,
    spiega:
      "Cosa risulta già online su Shopify, eBay e Subito. Cancellalo solo se vuoi ripartire da \"niente è caricato\": non rispecchierebbe più la realtà.",
    avviso: true,
  },
  {
    chiave: "skuSenzaFoto",
    titolo: "Sku senza foto",
    cancella: (a) => `${a.skuEliminabili} sku senza foto (con i loro blocchi e il loro "caricato")`,
    resta: (a) => `tutti i ${a.skuTotali} sku`,
    spiega:
      "Elimina gli sku senza foto insieme ai loro blocchi e al loro \"caricato\". Quelli presenti in FP/CV vengono ricreati dall'import, ma senza blocchi. Gli sku con foto restano sempre.",
    avviso: true,
  },
];

export function Pulizia() {
  const router = useRouter();
  const [scelta, setScelta] = useState<SceltaPulizia>(INIZIALE);
  const [anteprima, setAnteprima] = useState<AnteprimaPulizia | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [personalizza, setPersonalizza] = useState(false);
  const [parola, setParola] = useState("");
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    let attivo = true;
    anteprimaPuliziaAction(scelta).then((r) => {
      if (!attivo) return;
      if (r.ok) {
        setAnteprima(r.anteprima);
        setErrore(null);
      } else setErrore(r.errore);
    });
    return () => {
      attivo = false;
    };
  }, [scelta]);

  const qualcosa = Object.values(scelta).some(Boolean);
  const scelte = VOCI.filter((v) => scelta[v.chiave]);
  const nonScelte = VOCI.filter((v) => !scelta[v.chiave]);

  // Cosa resta dopo la pulizia, per il riepilogo
  const skuRimasti = anteprima ? anteprima.skuTotali - (scelta.skuSenzaFoto ? anteprima.skuEliminabili : 0) : 0;
  const blocchiRimasti = anteprima ? (scelta.blocchi ? 0 : anteprima.blocchi - (scelta.skuSenzaFoto ? anteprima.blocchiDegliSkuEliminati : 0)) : 0;
  const caricatoRimasto = anteprima
    ? scelta.caricato
      ? 0
      : anteprima.caricato - (scelta.skuSenzaFoto ? anteprima.caricatoDegliSkuEliminati : 0)
    : 0;
  const perdiPerEliminazione =
    !!anteprima && scelta.skuSenzaFoto && (anteprima.blocchiDegliSkuEliminati > 0 || anteprima.caricatoDegliSkuEliminati > 0);

  async function conferma() {
    setOccupato(true);
    const r = await eseguiPuliziaAction(scelta, parola);
    setOccupato(false);
    setAperto(false);
    setParola("");
    if (r.ok && r.esito) {
      const e = r.esito;
      setEsito(
        `Fatto. Cancellati: ${e.movimenti} movimenti, ${e.batch} batch, ${e.silenziamenti} errori silenziati, ${e.blocchi} blocchi, ${e.caricato} righe "caricato", ${e.skuEliminati} sku. Dati azzerati su ${e.skuAzzerati} sku. Backup salvato prima: ${r.backup}`
      );
      setErrore(null);
    } else {
      setErrore(r.errore ?? "Non riuscito");
    }
    router.refresh();
    const n = await anteprimaPuliziaAction(scelta);
    if (n.ok) setAnteprima(n.anteprima);
  }

  return (
    <div className="flex flex-col gap-5">
      {!anteprima ? (
        <p className="text-sm text-muted-foreground">Calcolo…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-destructive/30 p-4">
            <h3 className="mb-2 text-sm font-semibold text-destructive">Verrà cancellato</h3>
            {scelte.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niente.</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {scelte.map((v) => (
                  <li key={v.chiave}>{v.cancella(anteprima)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md border p-4">
            <h3 className="mb-2 text-sm font-semibold">Resta com&apos;è</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>
                le {anteprima.foto} foto e i loro link (di {anteprima.skuConFoto} sku)
              </li>
              {nonScelte.map((v) => (
                <li key={v.chiave}>{v.resta(anteprima)}</li>
              ))}
              <li>proprietari, depositi, portali, tipi oggetto e impostazioni</li>
            </ul>
          </div>
        </div>
      )}

      {perdiPerEliminazione && anteprima && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Eliminando gli sku senza foto perdi anche {anteprima.blocchiDegliSkuEliminati} blocchi e {anteprima.caricatoDegliSkuEliminati} righe di
          &quot;caricato&quot; legati a quegli sku.
        </p>
      )}

      <div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setPersonalizza((p) => !p)}
        >
          {personalizza ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Personalizza cosa cancellare
        </button>
        {personalizza && (
          <div className="mt-3 flex flex-col gap-2">
            {VOCI.map((v) => (
              <label key={v.chiave} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={scelta[v.chiave]}
                  onCheckedChange={(c) => setScelta((s) => ({ ...s, [v.chiave]: c === true }))}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {v.titolo}
                    {v.avviso && <span className="ml-2 text-xs font-normal text-warning">attenzione</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">{v.spiega}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {esito && <p className="text-sm text-success">{esito}</p>}

      <div>
        <Button
          type="button"
          variant="destructive"
          disabled={!qualcosa || !anteprima}
          onClick={() => {
            setParola("");
            setAperto(true);
          }}
        >
          Pulisci…
        </Button>
      </div>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confermi la pulizia?</DialogTitle>
            <DialogDescription>
              Prima di cancellare salvo un backup nella cartella Documenti. Poi cancello tutto in un&apos;unica operazione: se qualcosa va storto non
              cambia niente.
            </DialogDescription>
          </DialogHeader>
          {anteprima && (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-1 font-medium">Dopo la pulizia avrai:</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                <li>
                  {skuRimasti} sku{scelta.movimenti ? ", tutti con zero pezzi" : ""}
                </li>
                <li>{anteprima.foto} foto (invariate)</li>
                <li>{blocchiRimasti} blocchi per portale</li>
                <li>{caricatoRimasto} righe di &quot;caricato&quot;</li>
              </ul>
              <p className="mt-2 text-muted-foreground">Poi importi FP e CV da Sistema → Dati → Importa da Excel.</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="parola-pulizia">
              Per confermare scrivi <strong>PULISCI</strong>
            </label>
            <Input id="parola-pulizia" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)} disabled={occupato}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" disabled={parola !== "PULISCI" || occupato} onClick={conferma}>
              {occupato ? "Lavoro…" : "Pulisci"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
