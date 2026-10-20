"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { annullaEsposizioneAction, ritiraDaPortaliAction } from "@/app/pubblicazione/esposizione-actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import { prezziDiversi, type Annullabile } from "@/lib/esposizione";
import type { RigaOnline } from "@/db/esposizione-queries";

type Filtro = "tutti" | "prezzo" | "togliere" | "piu-pezzi";

const euro = (n: number | null) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);
const data = (d: Date) =>
  new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

function csvCella(v: string | number) {
  const t = String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// Elenco di cio' che e' online su un portale statico (come un batch sempre
// aperto): cerca, filtra, seleziona e "Togli da <portale>" (= ritiro, finisce
// in "Da togliere"), esporta l'elenco in CSV.
export function OnlinePortale({ canaleId, nomePortale, righe }: { canaleId: number; nomePortale: string; righe: RigaOnline[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutti");
  const [esito, setEsito] = useState<{ ok: boolean; testo: string; annullabili?: Annullabile[] } | null>(null);

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter((r) => {
      if (q && !`${r.skuCode} ${r.artista} ${r.opera}`.toLowerCase().includes(q)) return false;
      if (filtro === "prezzo") return prezziDiversi(r.prezzoOnline, r.prezzoOggi);
      if (filtro === "togliere") return r.daTogliere;
      if (filtro === "piu-pezzi") return r.quantitaCaricata > 1;
      return true;
    });
  }, [righe, cerca, filtro]);

  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(visibili.map((r) => r.skuId));

  if (righe.length === 0 && !esito) return null;

  const scelti = visibili.filter((r) => selezionati.has(r.skuId));
  const tutti = visibili.length > 0 && scelti.length === visibili.length;

  function togli() {
    const ids = scelti.map((r) => r.skuId);
    start(async () => {
      const r = await ritiraDaPortaliAction(ids, [canaleId], true);
      setEsito({ ok: r.ok, testo: r.ok ? (r.messaggio ?? "Fatto.") : (r.errore ?? "Errore."), annullabili: r.annullabili });
      setSelezionati(new Set());
      router.refresh();
    });
  }

  function annulla() {
    const lista = esito?.annullabili ?? [];
    start(async () => {
      for (const a of lista) {
        const r = await annullaEsposizioneAction(a);
        if (!r.ok) {
          setEsito({ ok: false, testo: r.errore ?? "Annulla non riuscito." });
          router.refresh();
          return;
        }
      }
      setEsito({ ok: true, testo: "Operazione annullata." });
      router.refresh();
    });
  }

  function esporta() {
    const intestazione = ["SKU", "Artista", "Opera", "Pezzi online", "Prezzo online", "Prezzo di oggi", "Aggiornato il", "Stato"];
    const righeCsv = visibili.map((r) =>
      [
        r.skuCode,
        r.artista,
        r.opera,
        r.quantitaCaricata,
        r.prezzoOnline === null ? "" : r.prezzoOnline.toFixed(2).replace(".", ","),
        r.prezzoOggi === null ? "" : r.prezzoOggi.toFixed(2).replace(".", ","),
        data(r.aggiornatoIl),
        r.daTogliere ? "Da togliere" : prezziDiversi(r.prezzoOnline, r.prezzoOggi) ? "Prezzo da aggiornare" : "Online",
      ]
        .map(csvCella)
        .join(";")
    );
    const testo = "﻿" + [intestazione.join(";"), ...righeCsv].join("\r\n");
    const url = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `online-${nomePortale.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-6 rounded-xl border" aria-label={`Online su ${nomePortale}`}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="text-base font-semibold">
          Online su {nomePortale} ({righe.length}
          {visibili.length !== righe.length ? `, ne vedi ${visibili.length}` : ""})
        </h2>
        <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={esporta} disabled={visibili.length === 0}>
          Esporta elenco (CSV)
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Input
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca sku, artista, opera…"
          className="h-8 w-64"
          aria-label="Cerca tra gli online"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          aria-label="Filtro"
        >
          <option value="tutti">Tutti</option>
          <option value="prezzo">Prezzo da aggiornare</option>
          <option value="togliere">Da togliere</option>
          <option value="piu-pezzi">Più di 1 pezzo online</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={tutti ? true : scelti.length > 0 ? "indeterminate" : false}
              onCheckedChange={(v) => selezionaTutti(v === true)}
              aria-label="Seleziona tutti quelli visibili"
            />
            Tutti
          </label>
          <Button type="button" size="sm" disabled={scelti.length === 0 || pending} onClick={togli}>
            {pending ? "…" : `Togli da ${nomePortale}${scelti.length ? ` (${scelti.length})` : ""}`}
          </Button>
        </div>
      </div>

      {esito && (
        <div
          className={`flex items-center justify-between border-b px-4 py-2 text-sm ${
            esito.ok ? "bg-emerald-500/10" : "bg-destructive/10 text-destructive"
          }`}
        >
          <span>{esito.testo}</span>
          <span className="flex items-center gap-3">
            {esito.annullabili && esito.annullabili.length > 0 && (
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={annulla}>
                Annulla
              </Button>
            )}
            <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setEsito(null)}>
              Chiudi
            </button>
          </span>
        </div>
      )}

      <div className="max-h-[28rem] overflow-y-auto">
        {visibili.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nessuno sku con questi filtri.</p>
        ) : (
          <ul className="flex flex-col">
            {visibili.map((r) => {
              const cambiato = prezziDiversi(r.prezzoOnline, r.prezzoOggi);
              return (
                <li key={r.skuId} className="flex items-center gap-3 border-t px-4 py-2 first:border-t-0">
                  <span onClickCapture={segnalaShift}>
                    <Checkbox
                      checked={selezionati.has(r.skuId)}
                      onCheckedChange={(v) => gestisciSeleziona(r.skuId, v === true)}
                      aria-label={`Seleziona ${r.skuCode}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{r.skuCode}</span>
                    {r.daTogliere && <span className="ml-2 text-xs text-destructive">da togliere</span>}
                    <span className="block truncate text-sm text-muted-foreground">
                      {r.artista} — {r.opera}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{r.quantitaCaricata} pz</span>
                  <span className="w-40 whitespace-nowrap text-right text-xs">
                    {cambiato ? (
                      <>
                        <span className="text-muted-foreground line-through">{euro(r.prezzoOnline)}</span> → {euro(r.prezzoOggi)}
                      </>
                    ) : (
                      euro(r.prezzoOnline ?? r.prezzoOggi)
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
