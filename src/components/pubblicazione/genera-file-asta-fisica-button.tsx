"use client";

// Bottone "Genera PDF" per le aste fisiche (2026-09-29). Stessa meccanica del
// bottone Catawiki: l'azione lato server ritorna il PDF in base64 (i Server
// Actions non possono innescare un download browser), qui lo si trasforma in
// Blob e si simula il click su un <a download> temporaneo.
// Da "confermato" genera e porta il batch a "pubblicato"; da "pubblicato"
// rigenera senza cambiare stato (vedi generaFilePdfAstaFisicaAction).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generaFilePdfAstaFisicaAction } from "@/app/pubblicazione/actions";

type Riga = { skuCode: string; artista: string; opera: string };

export function GeneraFileAstaFisicaButton({
  batchId,
  disabled,
  motivoDisabilitato,
}: {
  batchId: number;
  disabled?: boolean;
  motivoDisabilitato?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [esito, setEsito] = useState<{
    passatoAPubblicato: boolean;
    senzaMiniatura: Riga[];
    senzaFoto: Riga[];
  } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const router = useRouter();

  function genera() {
    setErrore(null);
    setEsito(null);
    startTransition(async () => {
      try {
        const r = await generaFilePdfAstaFisicaAction(batchId);
        const binario = atob(r.pdfBase64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = r.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setEsito({
          passatoAPubblicato: r.passatoAPubblicato,
          senzaMiniatura: r.senzaMiniatura,
          senzaFoto: r.senzaFoto,
        });
        router.refresh();
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      }
    });
  }

  const elenco = (righe: Riga[]) => (
    <ul className="mt-0.5 space-y-0.5">
      {righe.map((s) => (
        <li key={s.skuCode}>
          <span className="font-mono text-xs">{s.skuCode}</span> — {s.artista} / {s.opera}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={genera} disabled={disabled || pending}>
        {pending ? "Genero il PDF…" : "Genera PDF"}
      </Button>
      {disabled && motivoDisabilitato && !esito && (
        <p className="max-w-sm text-right text-xs text-muted-foreground">{motivoDisabilitato}</p>
      )}
      {errore && <p className="max-w-sm text-right text-sm text-destructive">{errore}</p>}
      {esito && (
        <div className="w-full max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <p className="font-medium">
            PDF generato{esito.passatoAPubblicato ? " e batch pubblicato" : " (stato del batch invariato)"}.
          </p>
          {esito.senzaMiniatura.length > 0 && (
            <div className="mt-1">
              <p>
                {esito.senzaMiniatura.length} lott{esito.senzaMiniatura.length === 1 ? "o" : "i"} senza miniatura (restano
                i link alle foto):
              </p>
              {elenco(esito.senzaMiniatura)}
            </div>
          )}
          {esito.senzaFoto.length > 0 && (
            <div className="mt-1">
              <p>
                {esito.senzaFoto.length} lott{esito.senzaFoto.length === 1 ? "o" : "i"} senza foto nel database:
              </p>
              {elenco(esito.senzaFoto)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
