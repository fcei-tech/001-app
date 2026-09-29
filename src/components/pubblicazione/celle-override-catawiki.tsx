"use client";

// Celle editabili inline per Prezzo/Riserva/Condizione nella tabella "Lotti
// nel batch", SOLO Catawiki (2026-09-28, generazione output) - riusa le
// stesse celle generiche della tabella Magazzino (autosave, nessun bottone
// Salva separato, stesso comportamento click-per-modificare/Esc annulla),
// invece del vecchio OverrideLottoForm (un form unico con bottone Salva)
// ancora in uso per Riserva proposta/asta_fisica. Ogni cella salva UN SOLO
// campo alla volta tramite aggiornaCampoOverrideLottoAction, che si occupa
// di preservare gli altri campi dell'override gia' presenti.
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { CellTesto, CellSelect } from "@/components/magazzino/editable-cell";
import { aggiornaCampoOverrideLottoAction, silenziaErroreAction } from "@/app/pubblicazione/actions";
import type { TipoErroreValidazione } from "@/lib/catawiki-resolver";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

function formatEuro(v: string) {
  return `€ ${v}`;
}

function condizioneVariant(c: string) {
  if (c === "A" || c === "A-") return "success" as const;
  if (c === "B+" || c === "B") return "secondary" as const;
  return "warning" as const;
}

type Props = {
  batchLottoId: number;
  batchId: number;
  canaleId: number;
};

export function CellaPrezzoCatawiki({ batchLottoId, batchId, canaleId, valore }: Props & { valore: string | null }) {
  return (
    <CellTesto
      valore={valore}
      numerico
      allineaDestra
      placeholder="sku"
      visualizza={formatEuro}
      onSalva={(v) =>
        aggiornaCampoOverrideLottoAction({ batchLottoId, batchId, canaleId, campo: "prezzo", valore: v })
      }
    />
  );
}

export function CellaRiservaCatawiki({ batchLottoId, batchId, canaleId, valore }: Props & { valore: string | null }) {
  return (
    <CellTesto
      valore={valore}
      numerico
      allineaDestra
      placeholder="auto"
      visualizza={formatEuro}
      onSalva={(v) =>
        aggiornaCampoOverrideLottoAction({ batchLottoId, batchId, canaleId, campo: "riserva", valore: v })
      }
    />
  );
}

// Nessun override -> mostra la condizione reale dello sku (fallback livello
// 1) in un badge un po' sbiadito, per distinguerla visivamente da un
// override esplicito (badge pieno) senza un secondo elemento a fianco.
export function CellaCondizioneCatawiki({
  batchLottoId,
  batchId,
  canaleId,
  valoreAttuale,
  fallbackSku,
}: Props & { valoreAttuale: string | null; fallbackSku: string }) {
  const effettivo = valoreAttuale ?? fallbackSku;
  return (
    <CellSelect
      display={
        <span className={valoreAttuale ? undefined : "opacity-70"}>
          <Badge variant={condizioneVariant(effettivo)}>{effettivo}</Badge>
        </span>
      }
      valoreAttuale={effettivo}
      opzioni={CONDIZIONI.map((c) => ({ value: c, label: c }))}
      larghezzaClasse="w-20"
      onSalva={(v) =>
        aggiornaCampoOverrideLottoAction({ batchLottoId, batchId, canaleId, campo: "condizione", valore: v })
      }
    />
  );
}

// Pulsante "silenzia" per un singolo errore di validazione non ancora
// silenziato (badge nella colonna "Stato export") - vedi silenziaErroreAction
// in actions.ts. Componente minuscolo apposta: un link testuale dentro il
// badge, non un Button pieno (troppo invasivo per una riga di tabella).
export function SilenziaErroreButton({
  skuId,
  canaleId,
  batchId,
  tipoErrore,
}: {
  skuId: number;
  canaleId: number;
  batchId: number;
  tipoErrore: TipoErroreValidazione;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => silenziaErroreAction({ skuId, canaleId, tipoErrore, batchId }))}
      className="ml-1.5 text-[10px] underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100"
    >
      {pending ? "…" : "silenzia"}
    </button>
  );
}
