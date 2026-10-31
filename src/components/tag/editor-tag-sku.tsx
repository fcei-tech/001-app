"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { impostaTagSkuAction } from "@/app/archivi/tag/actions";
import type { TagBreve } from "@/db/tag-queries";

// Tag di UNO sku nella scheda: ogni click salva subito (come le azioni sulle
// foto), non serve "Salva modifiche".
export function EditorTagSku({ skuId, tag, iniziali }: { skuId: number; tag: TagBreve[]; iniziali: number[] }) {
  const router = useRouter();
  const [scelti, setScelti] = useState<number[]>(iniziali);
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  function commuta(id: number) {
    const prima = scelti;
    const dopo = prima.includes(id) ? prima.filter((x) => x !== id) : [...prima, id];
    setScelti(dopo);
    setErrore(null);
    start(async () => {
      const r = await impostaTagSkuAction(skuId, dopo);
      if (!r.ok) {
        setScelti(prima);
        setErrore(r.errore ?? "Non salvato.");
        return;
      }
      router.refresh();
    });
  }

  if (tag.length === 0) {
    return <p className="text-sm text-muted-foreground">Non ci sono tag: creali in Archivi &gt; Tag.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tag.map((t) => {
          const on = scelti.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              onClick={() => commuta(t.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {t.nome}
            </button>
          );
        })}
      </div>
      {errore && <p className="text-xs text-destructive">{errore}</p>}
    </div>
  );
}
