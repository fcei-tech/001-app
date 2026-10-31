"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assegnaTagAction, togliTagAction } from "@/app/archivi/tag/actions";
import type { TagBreve } from "@/db/tag-queries";

// Bottone "Tag" della barra di selezione del Magazzino: si scelgono i tag e
// poi "Aggiungi" oppure "Togli" per tutti gli sku selezionati.
export function AssegnaTagSelezione({
  tag,
  skuIds,
  onEsito,
}: {
  tag: TagBreve[];
  skuIds: number[];
  onEsito: (esito: { ok: boolean; testo: string }) => void;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [scelti, setScelti] = useState<number[]>([]);
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  function commuta(id: number, acceso: boolean) {
    setScelti((s) => (acceso ? [...s, id] : s.filter((x) => x !== id)));
  }

  function esegui(azione: "aggiungi" | "togli") {
    setErrore(null);
    start(async () => {
      const r = azione === "aggiungi" ? await assegnaTagAction(skuIds, scelti) : await togliTagAction(skuIds, scelti);
      if (!r.ok) {
        setErrore(r.errore ?? "Non riuscito.");
        return;
      }
      setAperto(false);
      setScelti([]);
      onEsito({ ok: true, testo: r.messaggio ?? "Fatto." });
      router.refresh();
    });
  }

  const gruppo = (titolo: string, voci: TagBreve[]) =>
    voci.length ? (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titolo}</span>
        {voci.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
            <input type="checkbox" checked={scelti.includes(t.id)} onChange={(e) => commuta(t.id, e.target.checked)} className="size-4" />
            {t.nome}
          </label>
        ))}
      </div>
    ) : null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAperto(true)}>
        <TagIcon /> Tag
      </Button>
      <Dialog open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) setErrore(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag per {skuIds.length} sku</DialogTitle>
            <DialogDescription>
              Spunta uno o più tag, poi scegli se aggiungerli o toglierli a tutti gli sku selezionati. Gli altri tag degli sku non cambiano.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {tag.length === 0 && <p className="text-sm text-muted-foreground">Non ci sono tag: creali in Archivi &gt; Tag.</p>}
            {gruppo("Di lavoro", tag.filter((t) => t.tipo === "interno"))}
            {gruppo("Soggetto", tag.filter((t) => t.tipo !== "interno"))}
          </div>
          {errore && <p className="text-sm text-destructive">{errore}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
            <Button type="button" variant="outline" disabled={pending || scelti.length === 0} onClick={() => esegui("togli")}>
              Togli da {skuIds.length} sku
            </Button>
            <Button type="button" disabled={pending || scelti.length === 0} onClick={() => esegui("aggiungi")}>
              Aggiungi a {skuIds.length} sku
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
