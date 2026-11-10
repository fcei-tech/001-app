"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampoPersonalizzato } from "@/lib/campi-personalizzati";

// Un campo personalizzato come input di form (name "cp_<id>"): usato dalla
// scheda sku e dal form "Nuovo sku". Valore vuoto = campo non compilato.
export function CampoPersonalizzatoInput({ campo, valore, onCambia }: { campo: CampoPersonalizzato; valore?: string | number | boolean; onCambia?: () => void }) {
  const nome = `cp_${campo.id}`;
  const iniziale = valore === undefined ? "" : typeof valore === "boolean" ? (valore ? "si" : "no") : String(valore);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nome}>{campo.nome}</Label>
      {campo.tipo === "elenco" || campo.tipo === "si_no" ? (
        <select
          id={nome}
          name={nome}
          defaultValue={iniziale}
          onChange={onCambia}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {campo.tipo === "si_no" ? (
            <>
              <option value="si">Sì</option>
              <option value="no">No</option>
            </>
          ) : (
            <>
              {iniziale !== "" && !campo.opzioni.includes(iniziale) && <option value={iniziale}>{iniziale} (non più in elenco)</option>}
              {campo.opzioni.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </>
          )}
        </select>
      ) : (
        <Input id={nome} name={nome} inputMode={campo.tipo === "numero" ? "decimal" : undefined} defaultValue={iniziale} onChange={onCambia} />
      )}
    </div>
  );
}
