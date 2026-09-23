"use client";

// Celle editabili inline per la tabella Magazzino (2026-09-23).
//
// CellTesto: click sul valore -> diventa un Input a fuoco, Invio/blur salva,
// Esc annulla la modifica in corso (senza toccare il valore gia' salvato).
// CellSelect: stesso schema click-per-modificare ma con una Select aperta
// subito (per campi a vocabolario chiuso: condizione, tipo) - il salvataggio
// avviene alla scelta di un'opzione, non serve un blur separato.
//
// Entrambe sono "controllate dall'esterno": non tengono lo stato salvato,
// solo la bozza mentre l'utente sta scrivendo/scegliendo. Il salvataggio
// vero (autosave, senza conferma per la singola cella) e' responsabilita'
// del chiamante via onSalva.

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CellTesto({
  valore,
  placeholder,
  allineaDestra,
  numerico,
  visualizza,
  onSalva,
}: {
  valore: string | null;
  placeholder?: string;
  allineaDestra?: boolean;
  numerico?: boolean;
  // Formattazione SOLO per la modalita' non-editing (es. "€ 45.00" invece
  // del numero grezzo) - il campo di modifica mostra/salva sempre il valore
  // grezzo, mai il testo formattato.
  visualizza?: (v: string) => React.ReactNode;
  onSalva: (nuovoValore: string) => void;
}) {
  const [inModifica, setInModifica] = useState(false);
  const [bozza, setBozza] = useState(valore ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inModifica) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [inModifica]);

  // Riallinea la bozza quando il valore salvato cambia dall'esterno (es. un
  // annulla-ultima-modifica o una modifica in blocco su questa stessa
  // cella) mentre non si sta editando - adeguamento durante il render
  // invece di un effetto, per non innescare un giro di render in piu'
  // (pattern "Adjusting state when a prop changes" di React).
  const [ultimoValoreVisto, setUltimoValoreVisto] = useState(valore);
  if (!inModifica && valore !== ultimoValoreVisto) {
    setUltimoValoreVisto(valore);
    setBozza(valore ?? "");
  }

  function confermaModifica() {
    setInModifica(false);
    const attuale = valore ?? "";
    if (bozza.trim() === attuale.trim() && bozza === attuale) return;
    onSalva(bozza);
  }

  function annullaModifica() {
    setBozza(valore ?? "");
    setInModifica(false);
  }

  if (!inModifica) {
    return (
      <button
        type="button"
        onClick={() => setInModifica(true)}
        className={`-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded px-1.5 py-1 text-left hover:bg-muted/60 ${allineaDestra ? "text-right" : ""}`}
      >
        {valore ? (visualizza ? visualizza(valore) : valore) : <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={bozza}
      inputMode={numerico ? "decimal" : undefined}
      onChange={(e) => setBozza(e.target.value)}
      onBlur={confermaModifica}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confermaModifica();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          annullaModifica();
        }
      }}
      className={`h-8 ${allineaDestra ? "text-right" : ""}`}
    />
  );
}

export function CellSelect({
  display,
  valoreAttuale,
  opzioni,
  larghezzaClasse,
  onSalva,
}: {
  display: React.ReactNode;
  valoreAttuale: string;
  opzioni: { value: string; label: string }[];
  larghezzaClasse?: string;
  onSalva: (nuovo: string) => void;
}) {
  const [inModifica, setInModifica] = useState(false);

  if (!inModifica) {
    return (
      <button type="button" onClick={() => setInModifica(true)} className="rounded hover:opacity-75">
        {display}
      </button>
    );
  }

  return (
    <Select
      defaultOpen
      value={valoreAttuale}
      onValueChange={(v) => {
        setInModifica(false);
        if (v !== valoreAttuale) onSalva(v);
      }}
      onOpenChange={(open) => {
        if (!open) setInModifica(false);
      }}
    >
      <SelectTrigger className={`h-8 ${larghezzaClasse ?? "w-28"}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opzioni.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Misura (larghezza x altezza): le due dimensioni vanno salvate insieme in
// un'unica chiamata (stesso "voce.campi" con due chiavi), altrimenti
// l'annulla-ultima-modifica dovrebbe ricostruire due passaggi distinti per
// quella che per l'utente e' una sola modifica.
export function CellMisura({
  larghezza,
  altezza,
  onSalva,
}: {
  larghezza: string | null;
  altezza: string | null;
  onSalva: (larghezza: string, altezza: string) => void;
}) {
  const [inModifica, setInModifica] = useState(false);
  const [bozzaL, setBozzaL] = useState(larghezza ?? "");
  const [bozzaH, setBozzaH] = useState(altezza ?? "");
  const primoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inModifica) primoInputRef.current?.focus();
  }, [inModifica]);

  // Stesso adeguamento-durante-il-render di CellTesto sopra, per le due
  // dimensioni insieme.
  const [ultimaLVista, setUltimaLVista] = useState(larghezza);
  const [ultimaHVista, setUltimaHVista] = useState(altezza);
  if (!inModifica && (larghezza !== ultimaLVista || altezza !== ultimaHVista)) {
    setUltimaLVista(larghezza);
    setUltimaHVista(altezza);
    setBozzaL(larghezza ?? "");
    setBozzaH(altezza ?? "");
  }

  function confermaModifica() {
    setInModifica(false);
    if (bozzaL === (larghezza ?? "") && bozzaH === (altezza ?? "")) return;
    onSalva(bozzaL, bozzaH);
  }

  function annullaModifica() {
    setBozzaL(larghezza ?? "");
    setBozzaH(altezza ?? "");
    setInModifica(false);
  }

  if (!inModifica) {
    return (
      <button
        type="button"
        onClick={() => setInModifica(true)}
        className="-mx-1.5 -my-1 w-[calc(100%+0.75rem)] rounded px-1.5 py-1 text-left text-muted-foreground hover:bg-muted/60"
      >
        {!larghezza && !altezza ? "—" : `${larghezza ?? "?"} × ${altezza ?? "?"} cm`}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={primoInputRef}
        value={bozzaL}
        inputMode="decimal"
        onChange={(e) => setBozzaL(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confermaModifica(); }
          if (e.key === "Escape") { e.preventDefault(); annullaModifica(); }
        }}
        onBlur={(e) => {
          if (!e.relatedTarget || !(e.currentTarget.parentElement?.contains(e.relatedTarget as Node))) confermaModifica();
        }}
        className="h-8 w-16"
      />
      <span className="text-muted-foreground">×</span>
      <Input
        value={bozzaH}
        inputMode="decimal"
        onChange={(e) => setBozzaH(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confermaModifica(); }
          if (e.key === "Escape") { e.preventDefault(); annullaModifica(); }
        }}
        onBlur={(e) => {
          if (!e.relatedTarget || !(e.currentTarget.parentElement?.contains(e.relatedTarget as Node))) confermaModifica();
        }}
        className="h-8 w-16"
      />
    </div>
  );
}
