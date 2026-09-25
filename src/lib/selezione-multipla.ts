"use client";

import { useRef, useState } from "react";

// Hook condiviso per la selezione multipla stile file-manager di sistema
// operativo (2026-09-25, punto 3 del backlog UX 2026-09-24/25 - vedi
// backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
// claude/09c_python_pubblicazione.yaml): click sulla checkbox di riga
// seleziona/deseleziona SOLO quella riga (comportamento gia' esistente,
// invariato); shift+click ESTENDE l'azione (seleziona o deseleziona, secondo
// il nuovo stato della riga appena cliccata) a tutto l'intervallo tra
// l'ultima riga toccata e quella corrente - pattern standard Explorer/
// Finder/Gmail applicato a una lista di checkbox, non un click-riga-intera
// (qui le checkbox restano il meccanismo di selezione, coerente con tutte le
// liste esistenti del software).
//
// Riusato identico in: VistaMagazzino (bulk edit), SelettoreLottiBatch
// (picker lotti da aggiungere a un batch), ListaBatchCanale (nuovo, elenco
// batch di un canale con controlli esterni cancella/cambia-stato).
//
// shiftKey non e' disponibile nell'evento di CheckboxPrimitive.onCheckedChange
// (Radix passa solo il nuovo valore booleano/"indeterminate") - va catturato
// a parte, dalla cella/contenitore che avvolge la checkbox, con
// onClickCapture (fase di cattura, quindi eseguito PRIMA del click interno
// di Radix che scatena onCheckedChange, sullo stesso evento nativo dello
// stesso click sincrono) - vedi segnalaShift sotto, da passare a
// onClickCapture sulla TableCell che contiene la Checkbox di riga.
export function useSelezioneMultipla<T extends string | number>(idsVisibili: T[]) {
  const [selezionati, setSelezionati] = useState<Set<T>>(new Set());
  const ultimoIndice = useRef<number | null>(null);
  const shiftPremuto = useRef(false);

  function segnalaShift(e: { shiftKey: boolean }) {
    shiftPremuto.current = e.shiftKey;
  }

  function gestisciSeleziona(id: T, checked: boolean) {
    const indiceCorrente = idsVisibili.indexOf(id);
    const conShift = shiftPremuto.current;
    shiftPremuto.current = false;

    setSelezionati((prev) => {
      const next = new Set(prev);
      if (conShift && ultimoIndice.current !== null && indiceCorrente !== -1) {
        const da = Math.min(ultimoIndice.current, indiceCorrente);
        const a = Math.max(ultimoIndice.current, indiceCorrente);
        for (let i = da; i <= a; i++) {
          const rid = idsVisibili[i];
          if (checked) next.add(rid);
          else next.delete(rid);
        }
      } else if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

    if (indiceCorrente !== -1) ultimoIndice.current = indiceCorrente;
  }

  function selezionaTutti(v: boolean) {
    setSelezionati(v ? new Set(idsVisibili) : new Set());
    ultimoIndice.current = null;
  }

  function svuota() {
    setSelezionati(new Set());
    ultimoIndice.current = null;
  }

  const tuttiSelezionati = idsVisibili.length > 0 && idsVisibili.every((id) => selezionati.has(id));
  const alcuniSelezionati = !tuttiSelezionati && idsVisibili.some((id) => selezionati.has(id));

  return {
    selezionati,
    setSelezionati,
    gestisciSeleziona,
    segnalaShift,
    selezionaTutti,
    svuota,
    tuttiSelezionati,
    alcuniSelezionati,
  };
}
