"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Menu "Altre azioni" riutilizzabile: regola di interfaccia dell'app -
// in ogni riga/scheda si vede UN'azione principale (quella che serve nello
// stato attuale); le correzioni e le azioni rare stanno qui dentro, ognuna
// con una riga di spiegazione di cosa succede davvero. Nessuna funzione
// viene tolta, solo spostata fuori dalla vista finche' non serve.
//
// Ogni voce chiama una server action con i campi indicati (FormData).
export type VoceAzione = {
  etichetta: string;
  descrizione: string;
  azione: (formData: FormData) => void | Promise<void>;
  campi: Record<string, string | number>;
};

export function MenuAltreAzioni({ voci }: { voci: VoceAzione[] }) {
  const [pending, startTransition] = React.useTransition();

  function esegui(v: VoceAzione) {
    const fd = new FormData();
    for (const [k, val] of Object.entries(v.campi)) fd.set(k, String(val));
    startTransition(async () => {
      await v.azione(fd);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? "…" : "Altre azioni"} <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {voci.map((v) => (
          <DropdownMenuItem
            key={v.etichetta}
            className="flex-col items-start gap-0.5"
            onSelect={() => esegui(v)}
          >
            <span className="font-medium">{v.etichetta}</span>
            <span className="text-xs text-muted-foreground">{v.descrizione}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
