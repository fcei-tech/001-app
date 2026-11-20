"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HEX_COLORE } from "@/lib/colori-canali";
import { creaPortaleAction, salvaColoriCanaleAction } from "@/app/archivi/portali/actions";

// Colori liberi proposti (rapidi); il campo esadecimale resta libero.
const PALETTE = ["#95BF47", "#0033FF", "#F1641E", "#B01030", "#1B6B63", "#1B3A5C", "#8B6914", "#5B3256", "#E53238", "#0064D2", "#F5AF02", "#86B817", "#6B7280", "#0E7490", "#BE185D", "#7C3AED"];

function normalizza(c: string) {
  const t = c.trim();
  return t.startsWith("#") ? t.toUpperCase() : `#${t}`.toUpperCase();
}

function CampiColori({ colori, setColori }: { colori: string[]; setColori: (c: string[]) => void }) {
  const cambia = (i: number, v: string) => setColori(colori.map((c, k) => (k === i ? v : c)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {colori.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="color"
              aria-label={`Colore ${i + 1}`}
              value={HEX_COLORE.test(normalizza(c)) ? normalizza(c) : "#000000"}
              onChange={(e) => cambia(i, e.target.value.toUpperCase())}
              className="size-9 cursor-pointer rounded border bg-transparent p-0.5"
            />
            <Input value={c} onChange={(e) => cambia(i, e.target.value)} className="h-9 w-28 font-mono text-xs" maxLength={7} />
            {colori.length > 1 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setColori(colori.filter((_, k) => k !== i))}>
                Togli
              </Button>
            )}
          </div>
        ))}
        {colori.length < 4 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setColori([...colori, "#6B7280"])}>
            + Colore
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Proposte (cambiano il primo colore):</span>
        {PALETTE.map((p) => (
          <button
            key={p}
            type="button"
            aria-label={p}
            title={p}
            onClick={() => cambia(0, p)}
            className="size-5 rounded-full border"
            style={{ backgroundColor: p }}
          />
        ))}
      </div>
      <Anteprima colori={colori.map(normalizza).filter((c) => HEX_COLORE.test(c))} />
    </div>
  );
}

// Anteprima: come appare il pulsante nella pagina Pubblicazione e lo sfondo al 12%.
function Anteprima({ colori }: { colori: string[] }) {
  const primo = colori[0];
  return (
    <div className="flex items-stretch gap-3 text-xs text-muted-foreground">
      <div
        className="relative flex w-44 items-center overflow-hidden rounded-md border bg-card py-2 pl-7 pr-2 text-foreground"
        style={colori.length === 1 ? { borderLeft: `20px solid ${primo}` } : undefined}
      >
        {colori.length > 1 && (
          <div className="absolute inset-y-0 left-0 flex w-5 flex-col" aria-hidden>
            {colori.map((c, i) => (
              <span key={i} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}
        <span className={colori.length === 1 ? "-ml-5" : ""}>Pulsante</span>
      </div>
      <div className="flex w-44 items-center justify-center rounded-md border p-2" style={{ backgroundColor: primo ? `${primo}1F` : undefined }}>
        <span className="rounded border bg-card px-3 py-1 text-foreground">Sfondo 12%</span>
      </div>
    </div>
  );
}

export function ColoriPortale({ canaleId, colori }: { canaleId: number; colori: string[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [valori, setValori] = useState<string[]>(colori.length ? colori : ["#6B7280"]);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={() => setAperto(!aperto)} className="flex items-center gap-1" aria-label="Modifica colori">
        {colori.map((c, i) => (
          <span key={i} className="size-4 rounded-sm border" style={{ backgroundColor: c }} />
        ))}
        <span className="ml-1 text-xs text-muted-foreground underline-offset-4 hover:underline">Colori</span>
      </button>
      {aperto && (
        <div className="flex w-full max-w-xl flex-col gap-3 rounded-md border bg-card p-3">
          <CampiColori colori={valori} setColori={setValori} />
          {errore && <p className="text-xs text-destructive">{errore}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAperto(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setErrore(null);
                  const r = await salvaColoriCanaleAction(canaleId, valori.map(normalizza));
                  if (!r.ok) {
                    setErrore(r.errore ?? "Errore");
                    return;
                  }
                  setAperto(false);
                  router.refresh();
                })
              }
            >
              Salva colori
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NuovoPortale() {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"statico" | "asta_online" | "asta_fisica">("asta_online");
  const [esclusivo, setEsclusivo] = useState(false);
  const [colori, setColori] = useState<string[]>(["#0E7490"]);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!aperto) {
    return (
      <Button type="button" size="sm" onClick={() => setAperto(true)}>
        Nuovo portale
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-md border bg-card p-4">
      <p className="text-sm font-medium">Nuovo portale</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-nome">Nome</Label>
          <Input id="np-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-tipo">Tipo</Label>
          <select
            id="np-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="statico">Statico (vendita diretta)</option>
            <option value="asta_online">Asta online</option>
            <option value="asta_fisica">Asta fisica</option>
          </select>
        </div>
      </div>
      {tipo === "statico" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={esclusivo} onChange={(e) => setEsclusivo(e.target.checked)} />
          Un pezzo alla volta (prenota il pezzo)
        </label>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Colore del portale</Label>
        <CampiColori colori={colori} setColori={setColori} />
      </div>
      {errore && <p className="text-xs text-destructive">{errore}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setAperto(false)}>
          Annulla
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErrore(null);
              const r = await creaPortaleAction({ nome, tipo, esclusivo, colori: colori.map(normalizza) });
              if (!r.ok) {
                setErrore(r.errore ?? "Errore");
                return;
              }
              setAperto(false);
              setNome("");
              router.refresh();
            })
          }
        >
          Crea portale
        </Button>
      </div>
    </div>
  );
}
