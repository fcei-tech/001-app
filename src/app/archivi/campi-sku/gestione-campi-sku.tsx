"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CAMPI_STANDARD_ORIGINE, ETICHETTA_TIPO_CAMPO, TIPI_CAMPO, type CampoPersonalizzato, type TipoCampo } from "@/lib/campi-personalizzati";
import type { AnteprimaCopia } from "@/db/campi-personalizzati-queries";
import {
  anteprimaCopiaAction,
  contaValoriCampoAction,
  creaCampoAction,
  eliminaCampoAction,
  eseguiCopiaAction,
  rinominaCampoAction,
} from "./actions";

export function GestioneCampiSku({ campi }: { campi: CampoPersonalizzato[] }) {
  return (
    <div className="space-y-6">
      <NuovoCampo />
      <ElencoCampi campi={campi} />
      {campi.length > 0 && <CopiaCampi campi={campi} />}
    </div>
  );
}

function NuovoCampo() {
  const [tipo, setTipo] = useState<TipoCampo>("testo");
  const [nome, setNome] = useState("");
  const [opzioni, setOpzioni] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function crea() {
    setErrore(null);
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("tipo", tipo);
    fd.set("opzioni", opzioni);
    start(async () => {
      const r = await creaCampoAction(fd);
      if (!r.ok) setErrore(r.errore);
      else {
        setNome("");
        setOpzioni("");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuovo campo</CardTitle>
        <CardDescription>Scegli un nome e il tipo di dato. Il tipo non si cambia dopo: per cambiarlo crea un nuovo campo e usa &quot;Copia da campo a campo&quot;.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome-campo">Nome</Label>
            <Input id="nome-campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Collezione" className="w-56" maxLength={40} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCampo)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_CAMPO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ETICHETTA_TIPO_CAMPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={crea} disabled={pending || !nome.trim()}>
            <Plus /> Aggiungi campo
          </Button>
        </div>
        {tipo === "elenco" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opzioni-campo">Opzioni (una per riga, oppure separate da virgola)</Label>
            <Textarea id="opzioni-campo" value={opzioni} onChange={(e) => setOpzioni(e.target.value)} rows={3} placeholder={"Ottimo\nBuono\nDa restaurare"} className="max-w-md" />
          </div>
        )}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
      </CardContent>
    </Card>
  );
}

function ElencoCampi({ campi }: { campi: CampoPersonalizzato[] }) {
  const [modifica, setModifica] = useState<CampoPersonalizzato | null>(null);
  const [elimina, setElimina] = useState<{ campo: CampoPersonalizzato; n: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (campi.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Ancora nessun campo personalizzato. Aggiungine uno qui sopra.</CardContent>
      </Card>
    );
  }

  function chiediElimina(c: CampoPersonalizzato) {
    start(async () => {
      const n = await contaValoriCampoAction(c.id);
      setElimina({ campo: c, n });
    });
  }

  function confermaElimina() {
    if (!elimina) return;
    start(async () => {
      const r = await eliminaCampoAction(elimina.campo.id);
      if (!r.ok) setErrore(r.errore);
      setElimina(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>I tuoi campi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {campi.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
            <span className="font-medium">{c.nome}</span>
            <Badge variant="secondary">{ETICHETTA_TIPO_CAMPO[c.tipo]}</Badge>
            {c.tipo === "elenco" && <span className="text-xs text-muted-foreground">{c.opzioni.join(" · ")}</span>}
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setModifica(c)}>
                <Pencil /> Modifica
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => chiediElimina(c)} disabled={pending}>
                <Trash2 /> Elimina
              </Button>
            </span>
          </div>
        ))}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
      </CardContent>

      <ModificaCampo campo={modifica} onChiudi={() => setModifica(null)} />

      <Dialog open={elimina !== null} onOpenChange={(a) => !a && setElimina(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare il campo &quot;{elimina?.campo.nome}&quot;?</DialogTitle>
            <DialogDescription>
              {elimina && elimina.n > 0
                ? `Ha un valore in ${elimina.n} sku: verranno cancellati. Non si può annullare (per sicurezza, prima puoi copiarli in un altro campo).`
                : "Nessuno sku ha un valore in questo campo."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setElimina(null)}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={confermaElimina} disabled={pending}>
              Elimina campo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ModificaCampo({ campo, onChiudi }: { campo: CampoPersonalizzato | null; onChiudi: () => void }) {
  const [nome, setNome] = useState("");
  const [opzioni, setOpzioni] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [idAperto, setIdAperto] = useState<number | null>(null);

  // Riparte dai valori del campo scelto, durante il render (non in un effect).
  if (campo && campo.id !== idAperto) {
    setIdAperto(campo.id);
    setNome(campo.nome);
    setOpzioni(campo.opzioni.join("\n"));
    setErrore(null);
  }
  if (!campo && idAperto !== null) setIdAperto(null);

  function salva() {
    if (!campo) return;
    const fd = new FormData();
    fd.set("id", String(campo.id));
    fd.set("nome", nome);
    if (campo.tipo === "elenco") fd.set("opzioni", opzioni);
    start(async () => {
      const r = await rinominaCampoAction(fd);
      if (!r.ok) setErrore(r.errore);
      else onChiudi();
    });
  }

  return (
    <Dialog open={campo !== null} onOpenChange={(a) => !a && onChiudi()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica campo</DialogTitle>
          <DialogDescription>
            Il tipo ({campo ? ETICHETTA_TIPO_CAMPO[campo.tipo] : ""}) non si cambia. Se togli un&apos;opzione, gli sku che la avevano la mantengono finché non la cambi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modifica-nome">Nome</Label>
            <Input id="modifica-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} />
          </div>
          {campo?.tipo === "elenco" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modifica-opzioni">Opzioni (una per riga)</Label>
              <Textarea id="modifica-opzioni" value={opzioni} onChange={(e) => setOpzioni(e.target.value)} rows={4} />
            </div>
          )}
          {errore && <p className="text-sm text-destructive">{errore}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button type="button" onClick={salva} disabled={pending || !nome.trim()}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Copia i valori da un campo (standard o personalizzato) a un campo personalizzato,
// con anteprima prima di scrivere. La destinazione e' sempre un campo personalizzato.
function CopiaCampi({ campi }: { campi: CampoPersonalizzato[] }) {
  const [origine, setOrigine] = useState<string>("");
  const [destinazione, setDestinazione] = useState<string>("");
  const [soloVuoti, setSoloVuoti] = useState(true);
  const [anteprima, setAnteprima] = useState<AnteprimaCopia | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setAnteprima(null);
    setErrore(null);
    setFatto(null);
  }

  function calcola() {
    reset();
    start(async () => {
      const r = await anteprimaCopiaAction(origine, Number(destinazione), soloVuoti);
      if (!r.ok) setErrore(r.errore);
      else setAnteprima(r.dati);
    });
  }

  function copia() {
    start(async () => {
      const r = await eseguiCopiaAction(origine, Number(destinazione), soloVuoti);
      if (!r.ok) setErrore(r.errore);
      else {
        setAnteprima(null);
        setFatto(`Copiati ${r.dati} valori.`);
      }
    });
  }

  const pronto = origine !== "" && destinazione !== "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Copia da campo a campo</CardTitle>
        <CardDescription>
          Prima vedi l&apos;anteprima di cosa cambierebbe; solo dopo la conferma viene scritto. I valori che non si possono convertire (es. testo in un campo
          numero) vengono saltati e ti vengono mostrati.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Copia da</Label>
            <Select value={origine} onValueChange={(v) => { setOrigine(v); reset(); }}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Scegli il campo di partenza" />
              </SelectTrigger>
              <SelectContent>
                {CAMPI_STANDARD_ORIGINE.map((c) => (
                  <SelectItem key={c.chiave} value={`std:${c.chiave}`}>
                    {c.etichetta}
                  </SelectItem>
                ))}
                {campi.map((c) => (
                  <SelectItem key={c.id} value={`cp:${c.id}`} disabled={String(c.id) === destinazione}>
                    {c.nome} (tuo)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>a</Label>
            <Select value={destinazione} onValueChange={(v) => { setDestinazione(v); reset(); }}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Scegli il tuo campo" />
              </SelectTrigger>
              <SelectContent>
                {campi.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} disabled={origine === `cp:${c.id}`}>
                    {c.nome} ({ETICHETTA_TIPO_CAMPO[c.tipo].toLowerCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={soloVuoti} onCheckedChange={(v) => { setSoloVuoti(v === true); reset(); }} />
          Copia solo dove la destinazione è vuota (non sovrascrive niente)
        </label>
        <Button type="button" variant="secondary" onClick={calcola} disabled={!pronto || pending}>
          Mostra anteprima
        </Button>

        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {fatto && <p className="text-sm text-success">{fatto}</p>}

        {anteprima && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
            <p>
              <strong>{anteprima.daCopiare}</strong> sku verrebbero aggiornati.
              {anteprima.saltatiDestinazionePiena > 0 && <> {anteprima.saltatiDestinazionePiena} saltati (destinazione già compilata o uguale).</>}
              {anteprima.origineVuota > 0 && <> {anteprima.origineVuota} saltati (origine vuota).</>}
              {anteprima.nonConvertibili > 0 && <> <strong>{anteprima.nonConvertibili}</strong> non convertibili.</>}
            </p>
            {anteprima.esempi.length > 0 && (
              <ul className="space-y-0.5 text-xs">
                {anteprima.esempi.map((e) => (
                  <li key={e.skuCode}>
                    <span className="font-mono">{e.skuCode}</span> → {e.valore}
                    {e.sostituisce !== null && <span className="text-muted-foreground"> (prima: {e.sostituisce})</span>}
                  </li>
                ))}
                {anteprima.daCopiare > anteprima.esempi.length && <li className="text-muted-foreground">… e altri {anteprima.daCopiare - anteprima.esempi.length}</li>}
              </ul>
            )}
            {anteprima.esempiNonConvertibili.length > 0 && (
              <p className="text-xs text-warning">
                Non convertibili, per esempio: {anteprima.esempiNonConvertibili.map((e) => `${e.skuCode} ("${e.valore}")`).join(", ")}
              </p>
            )}
            <Button type="button" onClick={copia} disabled={pending || anteprima.daCopiare === 0}>
              {pending ? "Copio…" : `Copia in ${anteprima.daCopiare} sku`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
