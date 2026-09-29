"use client";

// Wrapper comprimibile per la sezione "Aggiungi lotti" nella pagina batch
// (2026-09-29, richiesta esplicita del cliente dopo il test sulla release:
// col nuovo ordine delle sezioni - Aggiungi lotti PRIMA di Impostazioni
// batch/Lotti nel batch - il picker magazzino, senza paginazione, poteva
// diventare lungo abbastanza da spingere fuori vista le altre due sezioni,
// dando l'impressione che "Lotti nel batch" fosse sparito. Soluzione: la
// sezione resta comunque per prima nel flusso (ordine logico invariato), ma
// si comprime da sola quando non serve.
//
// Stato aperto/chiuso locale (React, non URL/localStorage): e' un dettaglio
// di comodo per QUESTA visita alla pagina, non una preferenza da ricordare
// tra sessioni (a differenza delle colonne visibili, che sono una
// preferenza vera e restano in localStorage). Il contenuto (children) resta
// sempre montato anche da chiusa (nascosto con "hidden", non smontato) per
// non perdere la selezione checkbox in corso di SelettoreLottiBatch se il
// cliente la richiude per errore.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SezioneAggiungiLotti({
  apertaDiDefault,
  numeroLottiNelBatch,
  children,
}: {
  // Calcolato dal chiamante (page.tsx): aperta di default su un batch vuoto
  // (serve subito) o appena dopo un'aggiunta (?aggiunti=1, il cliente sta
  // probabilmente continuando ad aggiungere altri lotti in sequenza) -
  // chiusa di default appena il batch ha gia' almeno un lotto e non si
  // arriva da un'aggiunta appena fatta.
  apertaDiDefault: boolean;
  numeroLottiNelBatch: number;
  children: React.ReactNode;
}) {
  const [aperta, setAperta] = useState(apertaDiDefault);
  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Aggiungi lotti</CardTitle>
          <CardDescription>
            Modulo Magazzino filtrato e interattivo: esclude sempre sku bloccati per la vendita, senza scorta o già nel batch.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAperta((v) => !v)} className="shrink-0">
          {aperta ? (
            <>
              <ChevronUp /> Comprimi
            </>
          ) : (
            <>
              <ChevronDown /> Mostra{numeroLottiNelBatch > 0 ? ` (${numeroLottiNelBatch} già nel batch)` : ""}
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className={aperta ? undefined : "hidden"}>{children}</CardContent>
    </Card>
  );
}
