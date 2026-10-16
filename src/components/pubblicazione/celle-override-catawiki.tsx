"use client";

// Celle editabili inline per Prezzo/Riserva/Condizione nella tabella "Lotti
// nel batch", SOLO Catawiki (2026-09-28, generazione output) - riusa le
// stesse celle generiche della tabella Magazzino (autosave, nessun bottone
// Salva separato, stesso comportamento click-per-modificare/Esc annulla),
// invece del vecchio OverrideLottoForm (un form unico con bottone Salva)
// ancora in uso per Riserva proposta/asta_fisica. Ogni cella salva UN SOLO
// campo alla volta tramite aggiornaCampoOverrideLottoAction, che si occupa
// di preservare gli altri campi dell'override gia' presenti.
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// Placeholder = il numero reale che verrebbe usato se la cella resta vuota
// (fallback livello 1 per il prezzo, valore gia' risolto per la riserva),
// non piu' una scritta generica "sku"/"auto" (2026-09-29, richiesta esplicita
// del cliente dopo il primo test reale: "preferisco vedere direttamente il
// numero"). Quando la cella e' vuota mostra questo numero in grigio
// (esattamente lo stile placeholder di CellTesto - vedi editable-cell.tsx),
// quando c'e' un override mostra quello, in nero, con onSalva invariato.
export function CellaPrezzoCatawiki({
  batchLottoId,
  batchId,
  canaleId,
  valore,
  fallback,
}: Props & { valore: string | null; fallback: string | null }) {
  return (
    <CellTesto
      valore={valore}
      numerico
      allineaDestra
      placeholder={fallback ? formatEuro(fallback) : "—"}
      visualizza={formatEuro}
      onSalva={(v) =>
        aggiornaCampoOverrideLottoAction({ batchLottoId, batchId, canaleId, campo: "prezzo", valore: v })
      }
    />
  );
}

export function CellaRiservaCatawiki({
  batchLottoId,
  batchId,
  canaleId,
  valore,
  fallback,
}: Props & { valore: string | null; fallback: string | null }) {
  return (
    <CellTesto
      valore={valore}
      numerico
      allineaDestra
      placeholder={fallback ? formatEuro(fallback) : "—"}
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

// Descrizione per lotto (2026-10-16): la finestra si apre con il testo che
// uscirebbe nel file (quello gia' modificato, altrimenti quello generato
// dallo sku) cosi' basta ritoccarlo. "Ripristina automatica" svuota
// l'override e il lotto torna alla descrizione generata. Mai scritta sullo
// sku, vale solo per questo lotto di questo batch.
export function CellaDescrizioneCatawiki({
  batchLottoId,
  batchId,
  canaleId,
  valore,
  generata,
}: Props & { valore: string | null; generata: string }) {
  const [aperta, setAperta] = useState(false);
  const [bozza, setBozza] = useState(valore ?? generata);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apri() {
    setBozza(valore ?? generata);
    setErrore(null);
    setAperta(true);
  }

  function salva(nuovo: string) {
    setErrore(null);
    startTransition(async () => {
      try {
        await aggiornaCampoOverrideLottoAction({ batchLottoId, batchId, canaleId, campo: "descrizione", valore: nuovo });
        setAperta(false);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Salvataggio non riuscito");
      }
    });
  }

  // Se il testo coincide con quello generato non c'e' niente da sovrascrivere.
  const daSalvare = bozza.trim() === generata.trim() ? "" : bozza;

  return (
    <>
      <button type="button" onClick={apri} className="rounded text-left hover:opacity-75">
        {valore ? <Badge variant="warning">modificata</Badge> : <span className="text-xs text-muted-foreground">automatica</span>}
      </button>
      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Descrizione del lotto</DialogTitle>
            <DialogDescription>
              Vale solo per questo lotto in questo batch. Lo sku in Magazzino non cambia.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={bozza} onChange={(e) => setBozza(e.target.value)} rows={14} className="font-mono text-xs" />
          {errore && <p className="text-sm text-destructive">{errore}</p>}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" disabled={pending || !valore} onClick={() => salva("")}>
              Ripristina automatica
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setAperta(false)}>
                Annulla
              </Button>
              <Button type="button" disabled={pending} onClick={() => salva(daSalvare)}>
                {pending ? "Salvo…" : "Salva"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
