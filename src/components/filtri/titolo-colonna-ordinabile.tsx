"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

// Titolo di colonna cliccabile per le tabelle fatte a righe (non <table>):
// un clic ordina crescente, il secondo decrescente, il terzo toglie l'ordine.
// Stesso comportamento delle intestazioni di Magazzino e del selettore lotti.
export function TitoloColonnaOrdinabile({
  etichetta,
  attiva,
  direzione,
  onClick,
  allineaDestra,
}: {
  etichetta: string;
  attiva: boolean;
  direzione: "asc" | "desc";
  onClick: () => void;
  allineaDestra?: boolean;
}) {
  const Icona = attiva ? (direzione === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <span className={allineaDestra ? "text-right" : ""} aria-sort={attiva ? (direzione === "desc" ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        title="Clicca per ordinare"
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-foreground ${attiva ? "font-medium text-foreground" : ""}`}
      >
        {etichetta}
        <Icona className={`size-3 ${attiva ? "" : "opacity-40"}`} />
      </button>
    </span>
  );
}
