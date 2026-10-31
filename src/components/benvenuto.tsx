"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cosaFareAction } from "@/app/cosa-fare-actions";
import type { VoceCosaFare } from "@/db/cosa-fare";
import {
  CHIAVE_MOSTRATO_SESSIONE,
  EVENTO_MOSTRA_BENVENUTO,
  benvenutoNascosto,
  impostaBenvenutoNascosto,
} from "@/lib/benvenuto-preferenza";

// Finestra "Cosa devi fare" all'apertura dell'app: una volta per apertura,
// salvo "Non mostrare più". Si riattiva da Sistema > Collegamenti.
export function Benvenuto() {
  const pathname = usePathname();
  const [aperto, setAperto] = useState(false);
  const [voci, setVoci] = useState<VoceCosaFare[] | null>(null);
  const [nonMostrare, setNonMostrare] = useState(false);

  function carica(): void {
    cosaFareAction().then((v) => {
      if (v === null) return; // database non collegato o errore: niente finestra
      setVoci(v);
      setNonMostrare(false);
      setAperto(true);
    });
  }

  // All'avvio: una sola volta per apertura dell'app, mai nelle pagine di configurazione.
  useEffect(() => {
    if (pathname.startsWith("/configura-database")) return;
    try {
      if (window.sessionStorage.getItem(CHIAVE_MOSTRATO_SESSIONE) === "1") return;
      window.sessionStorage.setItem(CHIAVE_MOSTRATO_SESSIONE, "1");
    } catch {
      // senza sessionStorage la finestra comparirebbe a ogni pagina: meglio non mostrarla
      return;
    }
    if (benvenutoNascosto()) return;
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Mostra adesso" dalla pagina Collegamenti.
  useEffect(() => {
    const h = () => carica();
    window.addEventListener(EVENTO_MOSTRA_BENVENUTO, h);
    return () => window.removeEventListener(EVENTO_MOSTRA_BENVENUTO, h);
  }, []);

  function chiudi() {
    if (nonMostrare) impostaBenvenutoNascosto(true);
    setAperto(false);
  }

  const gruppi = (["Portali", "Aste"] as const).map((g) => ({ g, items: (voci ?? []).filter((v) => v.gruppo === g) }));

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cosa devi fare</DialogTitle>
          <DialogDescription>
            {voci && voci.length > 0
              ? "Clicca una voce per andare dove serve."
              : "Niente in sospeso sui portali e sulle aste."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {gruppi.map(({ g, items }) =>
            items.length ? (
              <div key={g} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</span>
                {items.map((v) => (
                  <Link
                    key={v.id}
                    href={v.href}
                    onClick={() => setAperto(false)}
                    className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    {v.testo}
                  </Link>
                ))}
              </div>
            ) : null
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={nonMostrare} onChange={(e) => setNonMostrare(e.target.checked)} className="size-4" />
            Non mostrare più
          </label>
          <Button type="button" onClick={chiudi}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
