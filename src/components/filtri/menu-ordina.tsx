"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Bottone "Ordina": elenco delle colonne; un clic ordina, un secondo clic sulla
// stessa colonna inverte, un terzo toglie l'ordinamento (stesso ciclo delle
// intestazioni della tabella).
export function MenuOrdina({
  voci,
  attuale,
  direzione,
  onScegli,
  onAzzera,
}: {
  voci: { chiave: string; etichetta: string }[];
  // undefined = nessun ordinamento scelto (vale l'ordine per SKU)
  attuale?: string;
  direzione: "asc" | "desc";
  onScegli: (chiave: string) => void;
  onAzzera: () => void;
}) {
  const voceAttuale = voci.find((v) => v.chiave === attuale);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={voceAttuale ? "secondary" : "outline"} title="Scegli la colonna per ordinare l'elenco">
          <ArrowUpDown />
          <span>Ordina</span>
          {voceAttuale && (
            <span className="text-muted-foreground">
              : {voceAttuale.etichetta} {direzione === "desc" ? "↓" : "↑"}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
        <DropdownMenuLabel>Ordina per</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {voci.map((v) => (
          <DropdownMenuItem key={v.chiave} onSelect={() => onScegli(v.chiave)}>
            <span className="flex-1">{v.etichetta}</span>
            {v.chiave === attuale && (direzione === "desc" ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />)}
          </DropdownMenuItem>
        ))}
        {voceAttuale && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAzzera}>
              <X /> Togli l&apos;ordinamento
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
