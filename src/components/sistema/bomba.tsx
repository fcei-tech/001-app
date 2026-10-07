"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bombaAction } from "@/app/sistema/zona-pericolo/actions";

const FRASE = "ELIMINA TUTTO";
const ATTESA = 10;

export function Bomba() {
  const [frase, setFrase] = useState("");
  const [conto, setConto] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  useEffect(() => {
    if (conto === null) return;
    if (conto > 0) {
      const t = setTimeout(() => setConto((c) => (c === null ? null : c - 1)), 1000);
      return () => clearTimeout(t);
    }
    // conto === 0: si esegue
    let annullato = false;
    (async () => {
      const r = await bombaAction(frase);
      if (annullato) return;
      if (!r.ok) {
        setErrore(r.errore ?? "Non riuscito");
        setConto(null);
        return;
      }
      setFatto(true);
      setTimeout(async () => {
        try {
          if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
            return;
          }
        } catch {
          // se il riavvio non parte, si passa alla schermata di collegamento
        }
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/configura-database";
      }, 800);
    })();
    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conto]);

  if (fatto) return <p className="text-sm">Fatto. L&apos;app si riavvia…</p>;

  return (
    <div className="flex flex-col gap-3">
      {conto === null ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="frase-bomba">Per procedere scrivi <strong>{FRASE}</strong></label>
            <Input id="frase-bomba" value={frase} onChange={(e) => setFrase(e.target.value)} autoComplete="off" className="max-w-xs" />
          </div>
          <div>
            <Button type="button" variant="destructive" disabled={frase !== FRASE} onClick={() => { setErrore(null); setConto(ATTESA); }}>
              Elimina tutti i dati
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-destructive">Eliminazione tra {conto} secondi…</span>
          <Button type="button" onClick={() => setConto(null)}>Annulla</Button>
        </div>
      )}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
