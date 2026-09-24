"use client";

import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { aggiornaOverrideLottoAction } from "@/app/pubblicazione/actions";

// Bug reale trovato dal cliente sulla build installata (2026-09-24): compilava
// "Riserva proposta"/"Prezzo evento" in "Lotti nel batch", poi cliccava
// direttamente "Conferma batch" (bottone diverso, form diverso) SENZA notare
// il bottone "Salva" per riga - quel testo digitato non veniva mai inviato al
// server (form non controllato, solo defaultValue), e rientrando nel batch
// il campo tornava vuoto con placeholder "facoltativo" come se non fosse mai
// stato toccato. Non era un bug di persistenza (aggiornaOverrideLotto salva
// correttamente se chiamato, verificato in simulazione) - era un bug di UX:
// troppo facile perdere il valore digitato senza accorgersene.
// FIX: campo controllato che salva da solo quando perde il focus (onBlur),
// nessun bottone Salva separato da dover notare/cliccare. Cliccare altrove
// (incluso il bottone "Conferma batch") scatena comunque il blur PRIMA del
// click del nuovo elemento (ordine standard del browser: blur -> click), quindi
// anche "digito e clicco subito Conferma batch" ora salva prima di confermare.
// Salva solo se il valore e' davvero cambiato dall'ultimo salvataggio riuscito
// (evita una scrittura vuota ad ogni singolo blur senza modifiche).
export function OverrideLottoForm({
  batchLottoId,
  batchId,
  canaleId,
  mostraRiservaProposta,
  valoreIniziale,
}: {
  batchLottoId: number;
  batchId: number;
  canaleId: number;
  // true = asta_fisica (solo riservaProposta), false = asta_online (prezzo + riserva)
  mostraRiservaProposta: boolean;
  valoreIniziale: { riservaProposta?: string; prezzo?: string; riserva?: string } | null;
}) {
  const [riservaProposta, setRiservaProposta] = useState(valoreIniziale?.riservaProposta ?? "");
  const [prezzo, setPrezzo] = useState(valoreIniziale?.prezzo ?? "");
  const [riserva, setRiserva] = useState(valoreIniziale?.riserva ?? "");
  const [pending, startTransition] = useTransition();
  const [salvato, setSalvato] = useState(false);
  const ultimoSalvato = useRef({
    riservaProposta: valoreIniziale?.riservaProposta ?? "",
    prezzo: valoreIniziale?.prezzo ?? "",
    riserva: valoreIniziale?.riserva ?? "",
  });

  function salva() {
    const invariato = mostraRiservaProposta
      ? riservaProposta === ultimoSalvato.current.riservaProposta
      : prezzo === ultimoSalvato.current.prezzo && riserva === ultimoSalvato.current.riserva;
    if (invariato) return;

    const fd = new FormData();
    fd.set("batchLottoId", String(batchLottoId));
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    if (mostraRiservaProposta) {
      fd.set("riservaProposta", riservaProposta);
    } else {
      fd.set("prezzo", prezzo);
      fd.set("riserva", riserva);
    }
    startTransition(async () => {
      await aggiornaOverrideLottoAction(fd);
      ultimoSalvato.current = { riservaProposta, prezzo, riserva };
      setSalvato(true);
      setTimeout(() => setSalvato(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {mostraRiservaProposta ? (
        <Input
          type="text"
          value={riservaProposta}
          onChange={(e) => setRiservaProposta(e.target.value)}
          onBlur={salva}
          placeholder="facoltativo"
          className="h-8 w-28"
        />
      ) : (
        <>
          <Input
            type="text"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
            onBlur={salva}
            placeholder="prezzo"
            className="h-8 w-20"
          />
          <Input
            type="text"
            value={riserva}
            onChange={(e) => setRiserva(e.target.value)}
            onBlur={salva}
            placeholder="riserva"
            className="h-8 w-20"
          />
        </>
      )}
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {pending ? "Salvo…" : salvato ? "Salvato" : ""}
      </span>
    </div>
  );
}
