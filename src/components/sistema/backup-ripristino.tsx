"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  creaBackupAction,
  elencaBackupAction,
  anteprimaRipristinoAction,
  ripristinaAction,
} from "@/app/sistema/dati/actions";
import type { AnteprimaRipristino, VoceBackup } from "@/db/backup";

function formatData(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function Backup() {
  const [occupato, setOccupato] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function crea() {
    setOccupato(true);
    setEsito(null);
    setErrore(null);
    const r = await creaBackupAction();
    setOccupato(false);
    if (r.ok) setEsito(`Backup salvato (${r.righe} righe): ${r.percorso}`);
    else setErrore(r.errore ?? "Backup non riuscito");
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" disabled={occupato} onClick={crea}>
          {occupato ? "Salvo…" : "Crea backup adesso"}
        </Button>
      </div>
      {esito && <p className="break-all text-sm text-success">{esito}</p>}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}

export function Ripristino() {
  const router = useRouter();
  const [voci, setVoci] = useState<VoceBackup[]>([]);
  const [cartella, setCartella] = useState("");
  const [scelto, setScelto] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<AnteprimaRipristino | null>(null);
  const [parola, setParola] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    elencaBackupAction().then((r) => {
      setVoci(r.voci);
      setCartella(r.cartella);
    });
  }, []);

  function formData() {
    const fd = new FormData();
    if (file) fd.set("file", file);
    else if (scelto) fd.set("nomeFile", scelto);
    return fd;
  }

  async function controlla() {
    setErrore(null);
    setEsito(null);
    setAnteprima(null);
    setParola("");
    setOccupato(true);
    const r = await anteprimaRipristinoAction(formData());
    setOccupato(false);
    if (r.ok) setAnteprima(r.anteprima);
    else setErrore(r.errore);
  }

  async function ripristina() {
    setOccupato(true);
    const fd = formData();
    fd.set("conferma", parola);
    const r = await ripristinaAction(fd);
    setOccupato(false);
    if (r.ok) {
      setEsito(`Ripristino completato (${r.righe} righe).`);
      setAnteprima(null);
      setParola("");
    } else setErrore(r.errore ?? "Ripristino non riuscito");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {voci.length > 0 ? `Backup trovati in ${cartella}:` : `Nessun backup in ${cartella || "Documenti/BATCH_ backup"}.`}
        </p>
        {voci.map((v) => (
          <button
            key={v.nome}
            type="button"
            onClick={() => {
              setScelto(v.nome);
              setFile(null);
              setAnteprima(null);
            }}
            className={`rounded-md border px-3 py-1.5 text-left text-sm ${scelto === v.nome && !file ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
          >
            {v.nome} <span className="text-xs text-muted-foreground">· {formatData(v.modificato)} · {Math.round(v.dimensione / 1024)} KB</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept=".json"
          className="max-w-xs"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setScelto(null);
            setAnteprima(null);
          }}
        />
        <Button type="button" variant="secondary" disabled={(!file && !scelto) || occupato} onClick={controlla}>
          {occupato && !anteprima ? "Leggo…" : "Controlla il backup"}
        </Button>
      </div>
      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {esito && <p className="text-sm text-success">{esito}</p>}
      {anteprima && (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/40 p-3 text-sm">
          <p>
            Backup del <strong>{formatData(anteprima.creatoIl)}</strong>. Ripristinando, <strong>tutti i dati di adesso vengono sostituiti</strong> con
            questi:
          </p>
          <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {anteprima.tabelle.map((t) => (
              <li key={t.nome} className="flex justify-between gap-2">
                <span className="font-mono text-xs">{t.nome}</span>
                <span className="tabular-nums">{t.righeAdesso} → {t.righeNelBackup}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="parola-ripristina">Per confermare scrivi <strong>RIPRISTINA</strong></label>
            <Input id="parola-ripristina" value={parola} onChange={(e) => setParola(e.target.value)} autoComplete="off" className="max-w-xs" />
          </div>
          <div>
            <Button type="button" variant="destructive" disabled={parola !== "RIPRISTINA" || occupato} onClick={ripristina}>
              {occupato ? "Ripristino…" : "Ripristina da questo backup"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
