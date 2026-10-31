"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Send, Tags, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CHIAVE_MOSTRATO_SESSIONE,
  EVENTO_MOSTRA_BENVENUTO,
  benvenutoNascosto,
  impostaBenvenutoNascosto,
} from "@/lib/benvenuto-preferenza";

// Finestra guida: il giro di lavoro del programma in quattro passi, ognuno
// porta alla pagina giusta. Compare una volta per apertura dell'app (salvo
// "Non mostrare più") e si riapre sempre dal tasto "?" nella barra in alto.
const PASSI = [
  { id: "carica", titolo: "Carica", testo: "Excel, foto o nuovo sku", href: "/importa-excel", Icona: Upload },
  { id: "organizza", titolo: "Organizza", testo: "Dati, tag, viste del magazzino", href: "/", Icona: Tags },
  { id: "pubblica", titolo: "Pubblica", testo: "Portali e aste", href: "/pubblicazione", Icona: Send },
  { id: "chiudi", titolo: "Chiudi", testo: "Vendite, giacenze, copia di sicurezza", href: "/sistema/dati", Icona: Archive },
] as const;

export function Benvenuto() {
  const pathname = usePathname();
  const [aperto, setAperto] = useState(false);
  const [nonMostrare, setNonMostrare] = useState(false);

  function mostra(): void {
    setNonMostrare(benvenutoNascosto());
    setAperto(true);
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
    // Un attimo dopo il caricamento della pagina (senza annullare il timer: in sviluppo
    // l'effetto gira due volte e la seconda troverebbe già il segno "mostrata").
    setTimeout(mostra, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tasto "?" nella barra in alto e "Mostrala adesso" da Impostazioni.
  useEffect(() => {
    const h = () => mostra();
    window.addEventListener(EVENTO_MOSTRA_BENVENUTO, h);
    return () => window.removeEventListener(EVENTO_MOSTRA_BENVENUTO, h);
  }, []);

  function chiudi() {
    impostaBenvenutoNascosto(nonMostrare);
    setAperto(false);
  }

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cosa vuoi fare?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PASSI.map(({ id, titolo, testo, href, Icona }) => (
            <Link
              key={id}
              href={href}
              onClick={() => { impostaBenvenutoNascosto(nonMostrare); setAperto(false); }}
              className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-3 py-4 text-center transition-colors hover:bg-muted"
            >
              <Icona className="size-8 text-primary" aria-hidden />
              <span className="text-sm font-medium">{titolo}</span>
              <span className="text-xs text-muted-foreground">{testo}</span>
            </Link>
          ))}
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
