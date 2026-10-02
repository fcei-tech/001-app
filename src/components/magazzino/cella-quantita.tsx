"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { GiacenzaRiga } from "@/lib/giacenza";

// Cella "Disponibile" della tabella Magazzino. Il numero e' il totale dello
// sku. Click:
// - se i pezzi stanno in UN solo posto (un proprietario in un deposito
//   proprio): il numero diventa modificabile subito, Invio/uscita salva,
//   Esc annulla - il salvataggio scrive una correzione nascosta;
// - altrimenti (piu' posti, nessun pezzo, o pezzi presso una casa d'asta,
//   dove il numero non si corregge a mano): apre la finestra Giacenza.
export function CellaQuantita({
  totale,
  giacenze,
  onSalvaDiretta,
  onApriGiacenza,
}: {
  totale: number;
  giacenze: GiacenzaRiga[];
  onSalvaDiretta: (riga: GiacenzaRiga, nuovo: number) => void;
  onApriGiacenza: () => void;
}) {
  const unica = giacenze.length === 1 && giacenze[0].ubicazioneTipo !== "asta_fisica" ? giacenze[0] : null;
  const [inModifica, setInModifica] = useState(false);
  const [bozza, setBozza] = useState(String(totale));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inModifica) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [inModifica]);

  // Riallinea la bozza se il totale cambia da fuori mentre non si edita.
  const [ultimoTotale, setUltimoTotale] = useState(totale);
  if (!inModifica && totale !== ultimoTotale) {
    setUltimoTotale(totale);
    setBozza(String(totale));
  }

  function conferma() {
    setInModifica(false);
    const n = Number(bozza.trim());
    if (!unica || bozza.trim() === "" || n === totale) {
      setBozza(String(totale));
      return;
    }
    onSalvaDiretta(unica, n);
  }

  if (!inModifica) {
    return (
      <button
        type="button"
        onClick={() => (unica ? setInModifica(true) : onApriGiacenza())}
        title={unica ? "Clicca per scrivere il numero giusto" : "Clicca per vedere dove sono i pezzi"}
        className="-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded px-1.5 py-1 text-right hover:bg-muted/60"
      >
        {totale}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      min={0}
      value={bozza}
      onChange={(e) => setBozza(e.target.value)}
      onBlur={conferma}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          conferma();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setBozza(String(totale));
          setInModifica(false);
        }
      }}
      className="h-8 w-20 text-right tabular-nums"
    />
  );
}
