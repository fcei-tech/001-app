"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anteprimaStatoPortaliAction, importaStatoPortaliAction } from "@/app/sistema/dati/actions";
import type { AnteprimaStatoPortali } from "@/db/stato-portali-import";

// Import della situazione sui portali statici dal Master (colonne PUB_* e
// CARICATO_*). Inserisce solo cio' che manca: si puo' rilanciare senza danni.
export function StatoPortaliMaster() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<AnteprimaStatoPortali | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  function formData() {
    const fd = new FormData();
    if (file) fd.set("file", file);
    return fd;
  }

  async function controlla() {
    setErrore(null);
    setEsito(null);
    setAnteprima(null);
    setOccupato(true);
    const r = await anteprimaStatoPortaliAction(formData());
    setOccupato(false);
    if (r.ok) setAnteprima(r.anteprima);
    else setErrore(r.errore);
  }

  async function importa() {
    setOccupato(true);
    const r = await importaStatoPortaliAction(formData());
    setOccupato(false);
    if (r.ok) {
      setEsito(r.messaggio ?? "Fatto.");
      setAnteprima(null);
      setFile(null);
    } else setErrore(r.errore ?? "Import non riuscito");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept=".xlsx,.xlsm"
          className="max-w-xs"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setAnteprima(null);
            setEsito(null);
            setErrore(null);
          }}
        />
        <Button type="button" variant="secondary" disabled={!file || occupato} onClick={controlla}>
          {occupato && !anteprima ? "Leggo…" : "Controlla il file"}
        </Button>
      </div>
      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {esito && <p className="text-sm text-success">{esito}</p>}
      {anteprima && (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p>
            Nel file {anteprima.skuNelFile} sku: <strong>{anteprima.skuTrovati}</strong> trovati nel software
            {anteprima.skuNonTrovati > 0 && (
              <>, <strong>{anteprima.skuNonTrovati}</strong> non trovati (es. {anteprima.esempiNonTrovati.join(", ")})</>
            )}
            .
          </p>
          <ul className="list-disc pl-5">
            {anteprima.portali.map((p) => (
              <li key={p.nome}>
                <strong>{p.nome}</strong>
                {!p.presenteNelSoftware ? " (non presente nel software)" : ""}: {p.blocchiNuovi} da bloccare, {p.caricatiNuovi} già caricati
                da registrare, {p.giaPresenti} già presenti
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" disabled={occupato} onClick={importa}>
              {occupato ? "Importo…" : "Importa"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
