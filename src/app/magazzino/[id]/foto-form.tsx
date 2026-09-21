"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { caricaFotoSku } from "@/app/magazzino/actions";

export function FotoForm({ skuId }: { skuId: number }) {
  const [anteprime, setAnteprime] = React.useState<string[]>([]);
  const [caricando, setCaricando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Revoca le anteprime precedenti prima di generarne di nuove, per non
    // accumulare object URL inutilizzati.
    anteprime.forEach((url) => URL.revokeObjectURL(url));
    setAnteprime(files.map((f) => URL.createObjectURL(f)));
  }

  return (
    <form
      action={caricaFotoSku}
      onSubmit={() => setCaricando(true)}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <input type="hidden" name="skuId" value={skuId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="foto" className="text-sm font-medium">
          Aggiungi foto (Shopify CDN, prima immagine = copertina)
        </label>
        <input
          ref={inputRef}
          id="foto"
          name="foto"
          type="file"
          accept="image/*"
          multiple
          onChange={onFileChange}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
        />
      </div>

      {anteprime.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {anteprime.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="size-16 rounded-md border object-cover" />
          ))}
        </div>
      )}

      <div>
        <Button type="submit" size="sm" disabled={anteprime.length === 0 || caricando}>
          <Upload />
          {caricando ? "Carico su Shopify..." : "Carica foto"}
        </Button>
        {caricando && (
          <p className="mt-2 text-xs text-muted-foreground">
            Puo&apos; richiedere qualche secondo a foto (upload + elaborazione Shopify).
          </p>
        )}
      </div>
    </form>
  );
}
