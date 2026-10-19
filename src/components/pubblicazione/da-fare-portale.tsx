"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  annullaEsposizioneAction,
  confermaDaFareAction,
  generaFileShopifyAction,
} from "@/app/pubblicazione/esposizione-actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import { ETICHETTA_MOTIVO, type Annullabile, type RigaDaFare, type TipoDaFare } from "@/lib/esposizione";

// Riquadro "Da fare su <portale>" (2026-10-07, design approvato dal cliente
// con l'anteprima cliccabile): visibile SOLO se c'e' qualcosa da fare. Tre
// gruppi (da aggiungere / da togliere / da abbassare), ognuno visibile solo
// se non vuoto, con UN pulsante principale per gruppo. Nessuna pagina nuova:
// sta dentro la pagina del portale.
const GRUPPI: {
  tipo: TipoDaFare;
  titolo: string;
  pulsante: string;
  aiuto: string;
  variante: "success" | "destructive" | "warning";
}[] = [
  {
    tipo: "aggiungere",
    titolo: "Da aggiungere",
    pulsante: "Conferma caricato",
    aiuto: "Caricali sul portale con la quantita' indicata, poi conferma.",
    variante: "success",
  },
  {
    tipo: "togliere",
    titolo: "Da togliere",
    pulsante: "Conferma rimosso",
    aiuto: "Esauriti, bloccati o ritirati: toglili dal portale, poi conferma.",
    variante: "destructive",
  },
  {
    tipo: "abbassare",
    titolo: "Da abbassare",
    pulsante: "Conferma aggiornato",
    aiuto: "La quantita' sul portale supera il disponibile: abbassala, poi conferma.",
    variante: "warning",
  },
  {
    tipo: "riprezzare",
    titolo: "Da riprezzare",
    pulsante: "Conferma prezzo aggiornato",
    aiuto: "Il prezzo di oggi è diverso da quello caricato: cambialo sul portale, poi conferma.",
    variante: "warning",
  },
];

function euro(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function testoQuantita(r: RigaDaFare): string {
  if (r.tipo === "aggiungere") return `carica ${r.quantitaTarget} (disponibili ${r.disponibileLibero})`;
  if (r.tipo === "togliere") return `da ${r.quantitaCaricata} a 0`;
  if (r.tipo === "riprezzare") return `da ${euro(r.prezzoCaricato)} a ${euro(r.prezzoTarget)}`;
  return `da ${r.quantitaCaricata} a ${r.quantitaTarget} (disponibili ${r.disponibileLibero})`;
}

function Gruppo({
  canaleId,
  nomePortale,
  gruppo,
  righe,
  onEsito,
}: {
  canaleId: number;
  nomePortale: string;
  gruppo: (typeof GRUPPI)[number];
  righe: RigaDaFare[];
  onEsito: (m: { ok: boolean; testo: string; annullabile?: Annullabile }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(righe.map((r) => r.skuId));

  const scelti = righe.filter((r) => selezionati.has(r.skuId)).length;
  const tutti = righe.length > 0 && scelti === righe.length;

  // File prodotti per Shopify: solo per il gruppo "Da aggiungere". Non cambia
  // nessuno stato, si scarica e poi si conferma a parte.
  function scaricaFile() {
    const ids = righe.filter((r) => selezionati.has(r.skuId)).map((r) => r.skuId);
    startTransition(async () => {
      const esito = await generaFileShopifyAction(canaleId, ids);
      if (esito.ok && esito.csv && esito.filename) {
        const blob = new Blob([esito.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = esito.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      const scartati = esito.scartati ?? [];
      const testoScartati = scartati.length
        ? ` Esclusi ${scartati.length}: ${scartati.map((s) => `${s.skuCode} (${s.motivo})`).join("; ")}.`
        : "";
      onEsito({
        ok: esito.ok,
        testo: esito.ok
          ? `File scaricato con ${esito.inclusi} prodotti. Caricalo su Shopify, poi premi "Conferma caricato".${testoScartati}`
          : `${esito.errore ?? "Errore."}${testoScartati}`,
      });
    });
  }

  function conferma() {
    const ids = righe.filter((r) => selezionati.has(r.skuId)).map((r) => r.skuId);
    startTransition(async () => {
      const esito = await confermaDaFareAction(canaleId, gruppo.tipo, ids);
      onEsito({ ok: esito.ok, testo: esito.ok ? (esito.messaggio ?? "Fatto.") : (esito.errore ?? "Errore."), annullabile: esito.annullabile });
      setSelezionati(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={gruppo.variante}>
          {gruppo.titolo} ({righe.length})
        </Badge>
        <span className="text-xs text-muted-foreground">
          {gruppo.aiuto}
          {gruppo.tipo === "togliere" && nomePortale === "Shopify" && (
            <strong className="ml-1 text-foreground">
              Su Shopify archivia o metti in bozza, NON eliminare: eliminando si cancellano anche le foto.
            </strong>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={tutti ? true : scelti > 0 ? "indeterminate" : false}
              onCheckedChange={(v) => selezionaTutti(v === true)}
              aria-label={`Seleziona tutti: ${gruppo.titolo}`}
            />
            Tutti
          </label>
          {gruppo.tipo === "aggiungere" && nomePortale === "Shopify" && (
            <Button type="button" size="sm" variant="outline" disabled={scelti === 0 || pending} onClick={scaricaFile}>
              {pending ? "…" : `Scarica file Shopify${scelti ? ` (${scelti})` : ""}`}
            </Button>
          )}
          <Button type="button" size="sm" disabled={scelti === 0 || pending} onClick={conferma}>
            {pending ? "…" : `${gruppo.pulsante}${scelti ? ` (${scelti})` : ""}`}
          </Button>
        </div>
      </div>
      <ul className="flex flex-col">
        {righe.map((r) => (
          <li key={r.skuId} className="flex items-center gap-3 border-t py-2 first:border-t-0">
            <span onClickCapture={segnalaShift}>
              <Checkbox
                checked={selezionati.has(r.skuId)}
                onCheckedChange={(v) => gestisciSeleziona(r.skuId, v === true)}
                aria-label={`Seleziona ${r.skuCode}`}
              />
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs">{r.skuCode}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {r.artista} — {r.opera}
              </span>
            </div>
            {r.tipo !== "abbassare" && r.tipo !== "riprezzare" && (
              <span className="hidden text-xs text-muted-foreground sm:inline">{ETICHETTA_MOTIVO[r.motivo]}</span>
            )}
            <span className="whitespace-nowrap text-sm tabular-nums">{testoQuantita(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DaFarePortale({
  canaleId,
  nomePortale,
  righe,
}: {
  canaleId: number;
  nomePortale: string;
  righe: RigaDaFare[];
}) {
  const router = useRouter();
  const [esito, setEsito] = useState<{ ok: boolean; testo: string; annullabile?: Annullabile } | null>(null);
  const [annullando, startAnnulla] = useTransition();

  function annulla() {
    const a = esito?.annullabile;
    if (!a) return;
    startAnnulla(async () => {
      const r = await annullaEsposizioneAction(a);
      setEsito({ ok: r.ok, testo: r.ok ? "Operazione annullata: gli sku sono tornati com'erano." : (r.errore ?? "Annulla non riuscito.") });
      router.refresh();
    });
  }

  if (righe.length === 0 && !esito) return null;

  return (
    <section className="mb-6 rounded-xl border" aria-label={`Da fare su ${nomePortale}`}>
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">Da fare su {nomePortale}</h2>
      </div>
      {esito && (
        <div
          className={`flex items-center justify-between border-b px-4 py-2 text-sm ${
            esito.ok ? "bg-emerald-500/10" : "bg-destructive/10 text-destructive"
          }`}
        >
          <span>{esito.testo}</span>
          <span className="flex items-center gap-3">
            {esito.annullabile && (
              <Button type="button" size="sm" variant="secondary" disabled={annullando} onClick={annulla}>
                {annullando ? "…" : "Annulla"}
              </Button>
            )}
            <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setEsito(null)}>
              Chiudi
            </button>
          </span>
        </div>
      )}
      {GRUPPI.map((g) => {
        const lista = righe.filter((r) => r.tipo === g.tipo);
        if (lista.length === 0) return null;
        return <Gruppo key={g.tipo} canaleId={canaleId} nomePortale={nomePortale} gruppo={g} righe={lista} onEsito={setEsito} />;
      })}
      {righe.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">{nomePortale} e&apos; allineato. Niente da fare.</p>
      )}
    </section>
  );
}
