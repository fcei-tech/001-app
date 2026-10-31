"use client";

import { Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TagBreve } from "@/db/tag-queries";

// Filtro per tag riusato in Magazzino e nei picker dei portali. Lo sku deve
// avere TUTTI i tag scelti (scegliendo "Sport" e "res" restano gli sku con entrambi).
// Il menu resta aperto dopo ogni spunta, cosi' se ne scelgono piu' di uno.
export function FiltroTag({
  tag,
  valore,
  onChange,
}: {
  tag: TagBreve[];
  valore: number[];
  onChange: (ids: number[]) => void;
}) {
  const interni = tag.filter((t) => t.tipo === "interno");
  const soggetti = tag.filter((t) => t.tipo !== "interno");
  const nomi = tag.filter((t) => valore.includes(t.id)).map((t) => t.nome);
  const etichetta = nomi.length === 0 ? "Tutti" : nomi.length === 1 ? nomi[0] : `${nomi.length} tag`;

  function commuta(id: number, acceso: boolean) {
    onChange(acceso ? [...valore, id] : valore.filter((x) => x !== id));
  }

  const voce = (t: TagBreve) => (
    <DropdownMenuCheckboxItem
      key={t.id}
      checked={valore.includes(t.id)}
      onCheckedChange={(v) => commuta(t.id, v === true)}
      onSelect={(e) => e.preventDefault()}
    >
      {t.nome}
    </DropdownMenuCheckboxItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start font-normal" aria-label="Filtro tag">
          <TagIcon /> <span className="truncate">{etichetta}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
        {tag.length === 0 && <DropdownMenuLabel>Nessun tag (si creano in Archivi &gt; Tag)</DropdownMenuLabel>}
        {interni.length > 0 && <DropdownMenuLabel>Di lavoro</DropdownMenuLabel>}
        {interni.map(voce)}
        {interni.length > 0 && soggetti.length > 0 && <DropdownMenuSeparator />}
        {soggetti.length > 0 && <DropdownMenuLabel>Soggetto</DropdownMenuLabel>}
        {soggetti.map(voce)}
        {valore.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange([]); }}>Togli il filtro tag</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
