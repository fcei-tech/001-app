"use client";

import * as React from "react";
import { suggerisciFamiglie } from "@/app/magazzino/actions";
import { MASSIMO_FAMIGLIE, REGOLE_FAMIGLIE, type Famiglia } from "@/lib/famiglie-suggerimenti";

export type FamigliaOpzione = { id: number; nome: string };

// Scelta della famiglia (tag soggetto) nel form Nuovo sku / Duplica.
// Almeno una, al massimo MASSIMO_FAMIGLIE. Mentre scrivi artista e titolo propone
// una scelta gia' spuntata, finche' non tocchi tu le famiglie. I valori vanno nel
// form come campi nascosti "tagId".
export function SelettoreFamiglie({
  famiglie,
  iniziali,
  artista,
  opera,
  suggerisci,
  onCambia,
}: {
  famiglie: FamigliaOpzione[];
  iniziali: number[];
  artista: string;
  opera: string;
  suggerisci: boolean;
  onCambia?: (numero: number) => void;
}) {
  const [scelte, setScelte] = React.useState<number[]>(iniziali);
  const [toccato, setToccato] = React.useState(!suggerisci || iniziali.length > 0);
  const [origine, setOrigine] = React.useState<"parole" | "storico" | null>(null);

  // Suggerimento con attesa (debounce): un effect che sottoscrive un timer
  // esterno e aggiorna lo stato in risposta e' il caso d'uso legittimo.
  React.useEffect(() => {
    if (toccato) return;
    if (!artista.trim() && !opera.trim()) return;
    let annullato = false;
    const t = setTimeout(() => {
      suggerisciFamiglie(artista, opera)
        .then((r) => {
          if (annullato || r.tagIds.length === 0) return;
          setScelte(r.tagIds.slice(0, MASSIMO_FAMIGLIE));
          setOrigine(r.origine);
          onCambia?.(Math.min(r.tagIds.length, MASSIMO_FAMIGLIE));
        })
        .catch(() => {});
    }, 500);
    return () => {
      annullato = true;
      clearTimeout(t);
    };
  }, [artista, opera, toccato, onCambia]);

  React.useEffect(() => {
    onCambia?.(scelte.length);
    // solo al montaggio: il numero iniziale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alterna(id: number) {
    setToccato(true);
    setOrigine(null);
    setScelte((prev) => {
      const prossime = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MASSIMO_FAMIGLIE ? prev : [...prev, id];
      onCambia?.(prossime.length);
      return prossime;
    });
  }

  const pieno = scelte.length >= MASSIMO_FAMIGLIE;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Famiglia">
        {famiglie.map((f) => {
          const attiva = scelte.includes(f.id);
          const bloccata = !attiva && pieno;
          const regola = (REGOLE_FAMIGLIE as Record<string, string>)[f.nome as Famiglia];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => alterna(f.id)}
              aria-pressed={attiva}
              title={bloccata ? `Massimo ${MASSIMO_FAMIGLIE}: togline una.` : regola}
              className={
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
                (attiva
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : bloccata
                    ? "cursor-not-allowed border-dashed text-muted-foreground/50"
                    : "hover:bg-muted/60")
              }
            >
              {f.nome}
            </button>
          );
        })}
      </div>
      {scelte.map((id) => (
        <input key={id} type="hidden" name="tagId" value={id} />
      ))}
      <p className="text-xs text-muted-foreground">
        {origine === "parole" && "Suggerita dal titolo. "}
        {origine === "storico" && "Suggerita dagli altri sku di questo artista. "}
        {scelte.length === 0 ? "Scegli almeno una famiglia. " : ""}
        Una famiglia obbligatoria, la seconda solo se si vede subito (un animale, una citta&apos;).
      </p>
    </div>
  );
}
