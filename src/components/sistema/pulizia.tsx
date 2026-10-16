"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { anteprimaPuliziaAction, eseguiPuliziaAction } from "@/app/sistema/pulizia/actions";
import type { AnteprimaPulizia, SceltaPulizia } from "@/db/pulizia";

type Voce = { chiave: keyof SceltaPulizia; titolo: string; testo: (a: AnteprimaPulizia) => string };

const VOCI: Voce[] = [
  {
    chiave: "movimenti",
    titolo: "Movimenti di magazzino",
    testo: (a) => `${a.movimenti} movimenti (${a.pezziAttuali} pezzi a registro). Le giacenze tornano a zero: poi si ricaricano con l'import FP/CV.`,
  },
  {
    chiave: "batch",
    titolo: "Batch e lotti",
    testo: (a) => `${a.batch} batch con ${a.lotti} lotti, di tutti i portali.`,
  },
  {
    chiave: "silenziamenti",
    titolo: "Errori silenziati",
    testo: (a) => `${a.silenziamenti} errori di validazione che avevi messo a tacere.`,
  },
  {
    chiave: "blocchi",
    titolo: "Blocchi per portale",
    testo: (a) => `${a.blocchi} blocchi sku+portale messi dal software.`,
  },
  {
    chiave: "anagrafica",
    titolo: "Azzera i dati degli sku",
    testo: (a) =>
      `${a.skuTotali} sku: misure, supporto, anno, note, tag, costo, prezzi, riserva, condizione e blocco vendita tornano vuoti. Artista, opera, foto e id restano.`,
  },
  {
    chiave: "skuSenzaFoto",
    titolo: "Elimina gli sku senza foto",
    testo: (a) =>
      `${a.skuEliminabili} sku su ${a.skuTotali} (quelli con foto: ${a.skuConFoto}, restano sempre). Gli sku presenti nel file FP/CV vengono ricreati dall'import. Se non cancelli anche movimenti e batch, restano gli sku che li hanno.`,
  },
  {
    chiave: "caricato",
    titolo: "Registro 'caricato' dei portali",
    testo: (a) =>
      `${a.caricato} righe che dicono cosa è già online su Shopify/eBay/Subito. Lascialo spuntato SOLO se vuoi ripartire da "niente è caricato": non rispecchierebbe più la realtà.`,
  },
];

const INIZIALE: SceltaPulizia = {
  movimenti: true,
  batch: true,
  silenziamenti: true,
  blocchi: true,
  anagrafica: true,
  skuSenzaFoto: true,
  caricato: false,
};

export function Pulizia() {
  const router = useRouter();
  const [scelta, setScelta] = useState<SceltaPulizia>(INIZIALE);
  const [anteprima, setAnteprima] = useState<AnteprimaPulizia | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
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

  async function conferma() {
    setOccupato(true);
    const r = await eseguiPuliziaAction(scelta, parola);
    setOccupato(false);
    setAperto(false);
    setParola("");
    if (r.ok && r.esito) {
      const e = r.esito;
      setEsito(
        `Fatto. Movimenti ${e.movimenti}, batch ${e.batch}, silenziamenti ${e.silenziamenti}, caricato ${e.caricato}, blocchi ${e.blocchi}, sku azzerati ${e.skuAzzerati}, sku eliminati ${e.skuEliminati}. Backup salvato prima: ${r.backup}`
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {VOCI.map((v) => (
          <label key={v.chiave} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={scelta[v.chiave]}
              onCheckedChange={(c) => setScelta((s) => ({ ...s, [v.chiave]: c === true }))}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{v.titolo}</span>
              <span className="text-sm text-muted-foreground">{anteprima ? v.testo(anteprima) : "Calcolo…"}</span>
            </span>
          </label>
        ))}
      </div>

      {anteprima && (
        <p className="text-sm text-muted-foreground">
          Non vengono toccati: le {anteprima.foto} foto, proprietari, depositi, portali, tipi oggetto e impostazioni.
        </p>
      )}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {esito && <p className="text-sm text-success">{esito}</p>}

      <div>
        <Button type="button" variant="destructive" disabled={!qualcosa || !anteprima} onClick={() => { setParola(""); setAperto(true); }}>
          Pulisci…
        </Button>
      </div>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confermi la pulizia?</DialogTitle>
            <DialogDescription>
              Prima di cancellare salvo un backup automatico nella cartella Documenti. Poi cancello le voci spuntate in un&apos;unica operazione: se
              qualcosa va storto non cambia niente. Dopo, per rimettere i dati, si importa il file FP/CV.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="parola-pulizia">Per confermare scrivi <strong>PULISCI</strong></label>
            <Input id="parola-pulizia" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAperto(false)} disabled={occupato}>Annulla</Button>
            <Button type="button" variant="destructive" disabled={parola !== "PULISCI" || occupato} onClick={conferma}>
              {occupato ? "Lavoro…" : "Pulisci"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
