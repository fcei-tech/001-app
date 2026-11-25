"use client";

// Controlli condivisi dalle pagine a schede (Proprietari, Depositi).
import * as React from "react";

export function Interruttore({
  acceso,
  onCambia,
  titolo,
  spiegazione,
  disabilitato,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  spiegazione: string;
  disabilitato?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={acceso}
        aria-label={titolo}
        disabled={disabilitato}
        onClick={() => onCambia(!acceso)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${acceso ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${acceso ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-5">{titolo}</span>
        <span className="text-xs text-muted-foreground">{spiegazione}</span>
      </div>
    </div>
  );
}

export function SceltaTipo({
  opzioni,
  valore,
  onCambia,
  disabilitato,
}: {
  opzioni: { value: string; label: string }[];
  valore: string;
  onCambia: (v: string) => void;
  disabilitato?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Tipo">
      {opzioni.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={valore === t.value}
          disabled={disabilitato}
          onClick={() => onCambia(t.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${valore === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
