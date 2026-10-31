"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Barra che compare quando si selezionano delle righe: "N selezionati", poche
// azioni con un verbo chiaro, ✕ per deselezionare. Resta agganciata in alto
// mentre si scorre l'elenco, cosi' le azioni sono sempre a portata di clic.
export function BarraSelezione({
  n,
  totale,
  onDeseleziona,
  children,
  className = "mb-4 rounded-lg border",
}: {
  n: number;
  totale: number;
  onDeseleziona: () => void;
  children: ReactNode;
  className?: string;
}) {
  const tutti = totale > 1 && n === totale;
  return (
    <div className={`sticky top-16 z-30 flex flex-wrap items-center gap-2 bg-background/95 px-3 py-2 shadow-sm backdrop-blur ${className}`}>
      <span className="text-sm font-medium">
        {n} selezionati
        {tutti && <span className="ml-1 font-normal text-muted-foreground">(tutto l&apos;elenco)</span>}
      </span>
      <span className="flex-1" />
      {children}
      <Button type="button" variant="ghost" size="icon" onClick={onDeseleziona} aria-label="Deseleziona tutto" title="Deseleziona tutto">
        <X />
      </Button>
    </div>
  );
}
