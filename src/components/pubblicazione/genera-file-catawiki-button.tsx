"use client";

// Bottone "Genera file" (2026-09-28, generazione output Catawiki): un solo
// click produce il download del CSV E porta il batch a "pubblicato" nella
// STESSA azione (vedi generaFileCatawikiAction in actions.ts) - nessun
// versionamento, ogni generazione e' un ricalcolo fresco, scaricato e finito.
// I Server Actions non possono innescare un download browser direttamente:
// l'azione ritorna {csv, filename, scartati}, qui si costruisce un Blob e si
// simula il click su un <a download> temporaneo (pattern standard per questo
// caso, vedi es. https://developer.mozilla.org/.../URL/createObjectURL).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generaFileCatawikiAction } from "@/app/pubblicazione/actions";
import { ETICHETTA_ERRORE_VALIDAZIONE, type TipoErroreValidazione } from "@/lib/catawiki-resolver";

type Scartato = { skuCode: string; artista: string; opera: string; errori: TipoErroreValidazione[] };

export function GeneraFileCatawikiButton({
  batchId,
  disabled,
  motivoDisabilitato,
}: {
  batchId: number;
  disabled?: boolean;
  motivoDisabilitato?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [scartati, setScartati] = useState<Scartato[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const router = useRouter();

  function genera() {
    setErrore(null);
    setScartati(null);
    startTransition(async () => {
      try {
        const risultato = await generaFileCatawikiAction(batchId);
        const blob = new Blob([risultato.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = risultato.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setScartati(risultato.scartati);
        router.refresh();
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={genera} disabled={disabled || pending}>
        {pending ? "Genero…" : "Genera file"}
      </Button>
      {disabled && motivoDisabilitato && !scartati && (
        <p className="max-w-sm text-right text-xs text-muted-foreground">{motivoDisabilitato}</p>
      )}
      {errore && <p className="max-w-sm text-right text-sm text-destructive">{errore}</p>}
      {scartati && (
        <div className="w-full max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          {scartati.length === 0 ? (
            <p>File generato e batch pubblicato — nessun lotto escluso.</p>
          ) : (
            <>
              <p className="mb-1 font-medium">
                File generato e batch pubblicato — {scartati.length} lott{scartati.length === 1 ? "o" : "i"} escl
                {scartati.length === 1 ? "uso" : "usi"}:
              </p>
              <ul className="space-y-0.5">
                {scartati.map((s) => (
                  <li key={s.skuCode}>
                    <span className="font-mono text-xs">{s.skuCode}</span> — {s.artista} / {s.opera}:{" "}
                    {s.errori.map((e) => ETICHETTA_ERRORE_VALIDAZIONE[e]).join(", ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
