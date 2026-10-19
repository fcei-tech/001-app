"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ritiraDaPortaliAction } from "@/app/pubblicazione/esposizione-actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import type { RigaRitirato } from "@/db/esposizione-queries";

// Elenco degli sku ritirati da questo portale con "Ritira da…": da qui si
// rimettono in vendita (tornano a comparire in "Da aggiungere").
export function RitiratiPortale({ canaleId, nomePortale, righe }: { canaleId: number; nomePortale: string; righe: RigaRitirato[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);
  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(righe.map((r) => r.skuId));

  if (righe.length === 0) return null;
  const scelti = righe.filter((r) => selezionati.has(r.skuId)).length;
  const tutti = scelti === righe.length;

  function rimetti() {
    const ids = righe.filter((r) => selezionati.has(r.skuId)).map((r) => r.skuId);
    start(async () => {
      const esito = await ritiraDaPortaliAction(ids, [canaleId], false);
      setMessaggio({ ok: esito.ok, testo: esito.ok ? (esito.messaggio ?? "Fatto.") : (esito.errore ?? "Errore.") });
      setSelezionati(new Set());
      router.refresh();
    });
  }

  return (
    <details className="mb-6 rounded-xl border" aria-label={`Ritirati da ${nomePortale}`}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ritirati da {nomePortale} ({righe.length})</summary>
      <div className="border-t px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Non vengono più proposti su {nomePortale} finché non li rimetti in vendita.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={tutti ? true : scelti > 0 ? "indeterminate" : false}
                onCheckedChange={(v) => selezionaTutti(v === true)}
                aria-label="Seleziona tutti i ritirati"
              />
              Tutti
            </label>
            <Button type="button" size="sm" disabled={scelti === 0 || pending} onClick={rimetti}>
              {pending ? "…" : `Rimetti in vendita${scelti ? ` (${scelti})` : ""}`}
            </Button>
          </div>
        </div>
        {messaggio && (
          <p className={`mb-2 text-sm ${messaggio.ok ? "" : "text-destructive"}`}>{messaggio.testo}</p>
        )}
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
              {r.quantitaCaricata > 0 && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">ancora online: {r.quantitaCaricata}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
