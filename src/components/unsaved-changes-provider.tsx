"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// CORREZIONE 2026-09-23: la versione precedente usava window.confirm()
// nativo. Nell'app installata (Tauri/WKWebView su macOS) window.confirm()
// non mostra alcun dialogo visibile e restituisce un valore falso in modo
// silenzioso - risultato osservato dal cliente: nessun avviso, e il click
// su "Torna al Magazzino" sembra non fare nulla (la funzione interpretava
// il valore falso come "annulla", quindi non navigava mai). Il fix e'
// sostituire il dialogo nativo del browser con un dialogo disegnato dentro
// l'app stessa (Radix Dialog, gia' in uso altrove) - non dipende da nessuna
// funzionalita' nativa del motore di rendering, quindi si comporta allo
// stesso modo ovunque giri l'app (Chromium in sandbox, Safari, WKWebView).
//
// Stato condiviso a livello di app (non solo della scheda sku) perche' la
// stessa protezione deve valere anche sui link di navigazione nell'header
// (Magazzino/Impostazioni/logo) - prima quei link bypassavano del tutto
// l'avviso, era la via di fuga che il cliente aveva trovato come workaround.

type UnsavedChangesContextValue = {
  hasUnsaved: boolean;
  setHasUnsaved: (v: boolean) => void;
  guardedNavigate: (href: string) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [dialogoAperto, setDialogoAperto] = useState(false);
  const hrefInAttesa = useRef<string | null>(null);

  const guardedNavigate = useCallback(
    (href: string) => {
      if (!hasUnsaved) {
        router.push(href);
        return;
      }
      hrefInAttesa.current = href;
      setDialogoAperto(true);
    },
    [hasUnsaved, router]
  );

  function confermaUscita() {
    setDialogoAperto(false);
    setHasUnsaved(false);
    if (hrefInAttesa.current) router.push(hrefInAttesa.current);
    hrefInAttesa.current = null;
  }

  function annullaUscita() {
    setDialogoAperto(false);
    hrefInAttesa.current = null;
  }

  return (
    <UnsavedChangesContext.Provider value={{ hasUnsaved, setHasUnsaved, guardedNavigate }}>
      {children}
      <Dialog open={dialogoAperto} onOpenChange={(open) => { if (!open) annullaUscita(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifiche non salvate</DialogTitle>
            <DialogDescription>
              Hai modifiche non salvate su questo sku. Vuoi uscire comunque senza salvare?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={annullaUscita}>Annulla</Button>
            <Button type="button" variant="destructive" onClick={confermaUscita}>Esci senza salvare</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChanges va usato dentro <UnsavedChangesProvider>");
  return ctx;
}
