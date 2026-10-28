"use client";

// Bottone "Genera file Bidspirit" (Release 4): scarica il .xlsx e porta il
// batch a "Inviato". Bidspirit NON sovrascrive i lotti gia' caricati, quindi
// se il batch e' gia' Inviato prima di rigenerare compare un avviso sui
// doppioni e serve una conferma esplicita.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generaFileBidspiritAction } from "@/app/pubblicazione/actions";

type Scartato = { skuCode: string; artista: string; opera: string; motivi: string[] };

export function GeneraFileBidspiritButton({
  batchId,
  disabled,
  motivoDisabilitato,
  giaInviato,
}: {
  batchId: number;
  disabled?: boolean;
  motivoDisabilitato?: string;
  giaInviato: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [scartati, setScartati] = useState<Scartato[] | null>(null);
  const [esportati, setEsportati] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState(false);
  const router = useRouter();

  function genera(forza: boolean) {
    setErrore(null);
    setScartati(null);
    setEsportati(null);
    setAvviso(false);
    startTransition(async () => {
      try {
        const r = await generaFileBidspiritAction(batchId, forza);
        const bin = atob(r.xlsxBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = r.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setEsportati(r.esportati);
        setScartati(r.scartati);
        router.refresh();
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        onClick={() => (giaInviato ? setAvviso(true) : genera(false))}
        disabled={disabled || pending}
      >
        {pending ? "Genero…" : "Genera file Bidspirit"}
      </Button>
      {disabled && motivoDisabilitato && !esportati && (
        <p className="max-w-sm text-right text-xs text-muted-foreground">{motivoDisabilitato}</p>
      )}
      {avviso && (
        <div className="w-full max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <p className="mb-2">
            Questo batch risulta gia&apos; <b>Inviato</b>. Bidspirit non sovrascrive i lotti gia&apos; caricati: se
            importi di nuovo questo file, i lotti saranno <b>doppi</b> sul portale (poi li archivi tu).
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAvviso(false)}>
              Annulla
            </Button>
            <Button type="button" size="sm" onClick={() => genera(true)}>
              Genera comunque
            </Button>
          </div>
        </div>
      )}
      {errore && <p className="max-w-sm text-right text-sm text-destructive">{errore}</p>}
      {esportati !== null && scartati && (
        <div className="w-full max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <p className="mb-1 font-medium">
            File generato con {esportati} lott{esportati === 1 ? "o" : "i"}
            {scartati.length > 0
              ? ` — ${scartati.length} escluso${scartati.length === 1 ? "" : "i"}:`
              : " — nessun lotto escluso."}
          </p>
          {scartati.length > 0 && (
            <ul className="space-y-0.5">
              {scartati.map((s) => (
                <li key={s.skuCode}>
                  <span className="font-mono text-xs">{s.skuCode}</span> — {s.artista} / {s.opera}: {s.motivi.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
