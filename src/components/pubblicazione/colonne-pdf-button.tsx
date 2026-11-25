"use client";

// "Colonne PDF": sceglie quali colonne ha il PDF lista lotti di questo portale
// (la scelta vale per ogni batch del portale). Foto e' sempre la prima; Riserva
// proposta e le colonne libere si compilano nel PDF.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salvaColonnePdfAction } from "@/app/pubblicazione/actions";
import { COLONNE_PDF, CONFIG_PDF_PREDEFINITA, MASSIMO_COLONNE_LIBERE, type ConfigColonnePdf, type IdColonnaPdf } from "@/lib/pdf-colonne-asta";

export function ColonnePdfButton({ canaleId, nomeCanale, config }: { canaleId: number; nomeCanale: string; config: ConfigColonnePdf }) {
  const [aperto, setAperto] = useState(false);
  const [scelte, setScelte] = useState<IdColonnaPdf[]>(config.colonne);
  const [libere, setLibere] = useState<string[]>(config.libere);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function apri() {
    setScelte(config.colonne);
    setLibere(config.libere);
    setErrore(null);
    setAperto(true);
  }

  function alterna(id: IdColonnaPdf) {
    setScelte((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function salva() {
    setErrore(null);
    startTransition(async () => {
      try {
        await salvaColonnePdfAction(canaleId, { colonne: scelte, libere: libere.map((l) => l.trim()).filter(Boolean) });
        setAperto(false);
        router.refresh();
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Non salvato");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={apri} title={`Colonne del PDF di ${nomeCanale}`}>
        <Columns3 /> Colonne PDF
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Colonne del PDF · {nomeCanale}</DialogTitle>
            <DialogDescription>Valgono per tutti i batch di questo portale. La Foto c&apos;è sempre.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {COLONNE_PDF.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={scelte.includes(c.id)} onCheckedChange={() => alterna(c.id)} />
                {c.etichetta}
                {c.compilabile && <span className="text-xs text-muted-foreground">(da compilare)</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Colonne libere <span className="font-normal text-muted-foreground">(da compilare, es. &quot;Data&quot;)</span></p>
            {libere.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={t}
                  maxLength={30}
                  placeholder="Titolo colonna"
                  onChange={(e) => setLibere((p) => p.map((x, k) => (k === i ? e.target.value : x)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Togli colonna" onClick={() => setLibere((p) => p.filter((_, k) => k !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            {libere.length < MASSIMO_COLONNE_LIBERE && (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLibere((p) => [...p, ""])}>
                <Plus /> Aggiungi colonna
              </Button>
            )}
          </div>
          {errore && <p className="text-sm text-destructive">{errore}</p>}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setScelte(CONFIG_PDF_PREDEFINITA.colonne);
                setLibere([]);
              }}
            >
              Ripristina predefinite
            </Button>
            <Button type="button" onClick={salva} disabled={pending}>
              {pending ? "Salvo…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
