"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { aggiungiMovimento } from "@/app/magazzino/actions";

const CAUSALI = [
  { value: "carico", label: "Carico" },
  { value: "correzione", label: "Correzione" },
  { value: "vendita_diretta_fattura", label: "Vendita diretta con fattura" },
];

export function MovimentoForm({
  skuId,
  ubicazioni,
}: {
  skuId: number;
  ubicazioni: { id: number; nome: string }[];
}) {
  const [aperto, setAperto] = React.useState(false);

  if (!aperto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAperto(true)}>
        Aggiungi movimento
      </Button>
    );
  }

  return (
    <form action={aggiungiMovimento} className="flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="skuId" value={skuId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mov-proprieta">Proprieta&apos;</Label>
          <Select name="proprieta" defaultValue="FP">
            <SelectTrigger id="mov-proprieta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FP">FP</SelectItem>
              <SelectItem value="CV">CV</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mov-ubicazione">Ubicazione</Label>
          <Select name="ubicazioneId" defaultValue={String(ubicazioni[0]?.id ?? "")}>
            <SelectTrigger id="mov-ubicazione">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ubicazioni.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mov-causale">Causale</Label>
          <Select name="causale" defaultValue="correzione">
            <SelectTrigger id="mov-causale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAUSALI.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mov-delta">
            Quantita&apos; (positiva = carico, negativa = scarico)
          </Label>
          <Input id="mov-delta" name="quantitaDelta" type="number" required placeholder="es. 2 o -1" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mov-note">Nota (facoltativa)</Label>
        <Input id="mov-note" name="note" placeholder="es. venduto a fiera, rientro da asta..." />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Registra movimento
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAperto(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
