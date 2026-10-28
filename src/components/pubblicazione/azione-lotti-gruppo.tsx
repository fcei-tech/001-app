"use client";

// "Azione sui lotti" (Release 4, aste fisiche Cambi/Bolaffi): un'unica azione
// applicata a tutti i lotti idonei del batch (o solo a quelli scelti con le
// caselle), senza conferma lotto per lotto. A fine lavoro mostra quanti lotti
// sono stati fatti e l'ELENCO degli errori (un errore non ferma gli altri).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { azioneLottiGruppoAction, type AzioneGruppo, type EsitoAzioneGruppo } from "@/app/pubblicazione/actions";

export type LottoGruppo = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  statoRiga: string;
  consegnato: boolean;
};

const AZIONI: Record<AzioneGruppo, { etichetta: string; spiega: (canale: string) => string; passato: string }> = {
  accetta: {
    etichetta: "Accetta",
    spiega: () => "I lotti Proposti diventano Accettati (la casa d'asta li ha presi).",
    passato: "accettati",
  },
  consegna: {
    etichetta: "Consegna",
    spiega: (c) =>
      `I lotti Accettati diventano Consegnati: il pezzo si sposta nell'ubicazione "${c}" dall'unica scorta che ha.`,
    passato: "consegnati",
  },
  rientrato: {
    etichetta: "Rientrato",
    spiega: () => "Annulla la consegna: il pezzo torna da noi e il lotto resta Accettato.",
    passato: "rientrati",
  },
};

function idoneo(l: LottoGruppo, a: AzioneGruppo) {
  if (a === "accetta") return l.statoRiga === "candidato";
  if (a === "consegna") return l.statoRiga === "accettato" && !l.consegnato;
  return l.consegnato;
}

export function AzioneLottiGruppo({
  batchId,
  canaleNome,
  lotti,
}: {
  batchId: number;
  canaleNome: string;
  lotti: LottoGruppo[];
}) {
  const [azione, setAzione] = useState<AzioneGruppo>("accetta");
  const [sceltaManuale, setSceltaManuale] = useState(false);
  const [scelti, setScelti] = useState<Set<number>>(new Set());
  const [esito, setEsito] = useState<EsitoAzioneGruppo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const idonei = useMemo(() => lotti.filter((l) => idoneo(l, azione)), [lotti, azione]);
  const daFare = sceltaManuale ? idonei.filter((l) => scelti.has(l.id)) : idonei;

  function cambiaAzione(v: string) {
    setAzione(v as AzioneGruppo);
    setScelti(new Set());
    setEsito(null);
    setErrore(null);
  }

  function applica() {
    setErrore(null);
    setEsito(null);
    startTransition(async () => {
      try {
        const r = await azioneLottiGruppoAction({
          batchId,
          azione,
          batchLottoIds: sceltaManuale ? daFare.map((l) => l.id) : idonei.map((l) => l.id),
        });
        setEsito(r);
        setScelti(new Set());
        router.refresh();
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      }
    });
  }

  return (
    <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Azione sui lotti</span>
        <Select value={azione} onValueChange={cambiaAzione} disabled={pending}>
          <SelectTrigger className="h-8 w-40" aria-label="Azione sui lotti">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AZIONI) as AzioneGruppo[]).map((a) => (
              <SelectItem key={a} value={a}>
                {AZIONI[a].etichetta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={applica} disabled={pending || daFare.length === 0}>
          {pending ? "Applico…" : `${AZIONI[azione].etichetta} ${daFare.length} lott${daFare.length === 1 ? "o" : "i"}`}
        </Button>
        {idonei.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sceltaManuale}
              onChange={(e) => setSceltaManuale(e.target.checked)}
              disabled={pending}
            />
            Scegli quali
          </label>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {AZIONI[azione].spiega(canaleNome)}{" "}
        {idonei.length === 0 ? "Nessun lotto idoneo adesso." : `Lotti idonei adesso: ${idonei.length}.`}
      </p>

      {sceltaManuale && idonei.length > 0 && (
        <ul className="mt-2 grid max-h-48 gap-0.5 overflow-auto text-sm sm:grid-cols-2">
          {idonei.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={scelti.has(l.id)}
                  onChange={(e) => {
                    const n = new Set(scelti);
                    if (e.target.checked) n.add(l.id);
                    else n.delete(l.id);
                    setScelti(n);
                  }}
                />
                <span className="font-mono text-xs">{l.skuCode}</span>
                <span className="truncate">{l.artista} / {l.opera}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {errore && <p className="mt-2 text-sm text-destructive">{errore}</p>}
      {esito && (
        <div className="mt-2 text-sm">
          <p>
            <b>{esito.eseguiti}</b> lott{esito.eseguiti === 1 ? "o" : "i"} {AZIONI[esito.azione].passato}.
            {esito.errori.length > 0 && <> {esito.errori.length} con errore:</>}
          </p>
          {esito.errori.length > 0 && (
            <ul className="mt-1 space-y-0.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              {esito.errori.map((e) => (
                <li key={e.skuCode}>
                  <span className="font-mono text-xs">{e.skuCode}</span> — {e.artista} / {e.opera}: {e.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
