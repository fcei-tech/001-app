"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { spostaGiacenza } from "@/app/magazzino/actions";

type RigaGiacenza = {
  proprietarioId: number;
  proprietarioNome: string;
  ubicazioneId: number;
  ubicazioneNome: string;
  ubicazioneTipo: string;
  saldo: number;
};

const CLASSE_SELECT =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function RigaSposta({
  skuId,
  riga,
  destinazioni,
}: {
  skuId: number;
  riga: RigaGiacenza;
  destinazioni: { id: number; nome: string }[];
}) {
  const router = useRouter();
  const possibili = destinazioni.filter((d) => d.id !== riga.ubicazioneId);
  const [aperto, setAperto] = React.useState(false);
  const [quantita, setQuantita] = React.useState(String(riga.saldo));
  const [dest, setDest] = React.useState(String(possibili[0]?.id ?? ""));
  const [messaggio, setMessaggio] = React.useState<{ testo: string; errore: boolean } | null>(null);
  const [inCorso, startTransition] = React.useTransition();

  function conferma() {
    startTransition(async () => {
      const esito = await spostaGiacenza({
        skuId,
        proprietarioId: riga.proprietarioId,
        daUbicazioneId: riga.ubicazioneId,
        aUbicazioneId: Number(dest),
        quantita: Number(quantita),
      });
      if (esito.ok) {
        setMessaggio({ testo: esito.messaggio ?? "Spostato", errore: false });
        setAperto(false);
        router.refresh();
      } else {
        setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="min-w-40 font-medium">{riga.ubicazioneNome}</span>
        <span className="text-muted-foreground">{riga.proprietarioNome}</span>
        <span className="tabular-nums">{riga.saldo} pz</span>
        {possibili.length > 0 && !aperto && (
          <Button type="button" variant="outline" size="sm" onClick={() => { setAperto(true); setMessaggio(null); }}>
            Sposta
          </Button>
        )}
        {messaggio && (
          <span className={`text-sm ${messaggio.errore ? "text-destructive" : "text-muted-foreground"}`}>{messaggio.testo}</span>
        )}
      </div>
      {aperto && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Quanti pezzi</label>
            <Input
              type="number"
              min={1}
              max={riga.saldo}
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Nel deposito</label>
            <select value={dest} onChange={(e) => setDest(e.target.value)} className={CLASSE_SELECT}>
              {possibili.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={conferma} disabled={inCorso || !dest}>
            {inCorso ? "Sposto…" : "Conferma"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAperto(false)} disabled={inCorso}>
            Annulla
          </Button>
          {riga.ubicazioneTipo === "asta_fisica" && (
            <p className="basis-full text-xs text-muted-foreground">
              Attenzione: questi pezzi sono presso una casa d&apos;asta. Se sono tornati indietro usa piuttosto Rientro dal batch, cosi&apos;
              il lotto resta coerente.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// Dove sono i pezzi di questo sku adesso (saldi > 0 per proprietario e
// deposito) e comando per spostarli fra depositi mantenendo il proprietario.
export function GiacenzaSku({
  skuId,
  righe,
  destinazioni,
}: {
  skuId: number;
  righe: RigaGiacenza[];
  destinazioni: { id: number; nome: string }[];
}) {
  if (righe.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun pezzo a magazzino.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {righe.map((r) => (
        <RigaSposta key={`${r.ubicazioneId}:${r.proprietarioId}`} skuId={skuId} riga={r} destinazioni={destinazioni} />
      ))}
    </ul>
  );
}
