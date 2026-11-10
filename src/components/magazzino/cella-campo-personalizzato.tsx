"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CellTesto } from "@/components/magazzino/editable-cell";
import { salvaValoreCampoPersonalizzatoAction } from "@/app/magazzino/actions";
import type { CampoPersonalizzato, ValoreCampo } from "@/lib/campi-personalizzati";

// Cella di un campo personalizzato in Magazzino: stessa logica delle altre
// celle (click per modificare, salva da sola). Testo e numero usano la cella
// di testo; elenco e Si/No un menu a tendina semplice.
export function CellaCampoPersonalizzato({ skuId, campo, valore }: { skuId: number; campo: CampoPersonalizzato; valore: ValoreCampo | undefined }) {
  const router = useRouter();
  const [pending, avvia] = useTransition();

  function salva(testo: string) {
    avvia(async () => {
      await salvaValoreCampoPersonalizzatoAction(skuId, campo.id, testo);
      router.refresh();
    });
  }

  if (campo.tipo === "elenco" || campo.tipo === "si_no") {
    const attuale = valore === undefined ? "" : typeof valore === "boolean" ? (valore ? "si" : "no") : String(valore);
    return (
      <select
        aria-label={campo.nome}
        value={attuale}
        disabled={pending}
        onChange={(e) => salva(e.target.value)}
        className="h-8 max-w-[11rem] rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-input focus-visible:border-input focus-visible:outline-none"
      >
        <option value="">—</option>
        {campo.tipo === "si_no" ? (
          <>
            <option value="si">Sì</option>
            <option value="no">No</option>
          </>
        ) : (
          <>
            {attuale !== "" && !campo.opzioni.includes(attuale) && <option value={attuale}>{attuale}</option>}
            {campo.opzioni.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </>
        )}
      </select>
    );
  }

  return (
    <CellTesto
      valore={valore === undefined ? null : String(valore)}
      numerico={campo.tipo === "numero"}
      allineaDestra={campo.tipo === "numero"}
      onSalva={salva}
    />
  );
}
