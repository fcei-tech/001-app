"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Plus, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CHIAVE_MOSTRATO_SESSIONE,
  EVENTO_MOSTRA_BENVENUTO,
  benvenutoNascosto,
  impostaBenvenutoNascosto,
} from "@/lib/benvenuto-preferenza";

// Finestra guida (ridisegnata 2026-11-25, seconda versione): non le 4 aree del
// menu (prima versione, confusa - la card "Chiudi" coincideva col pulsante di
// chiusura della finestra) ma le 4 funzioni usate più spesso, scelte dal
// cliente: Importa dati (FP/CV, la più frequente, in alto a sinistra), Nuovo
// sku, Sistema quello che manca (va a Controllo dati), Pubblica su un portale.
// Compare una volta per apertura dell'app (salvo "Non mostrare più") e si
// riapre sempre dal tasto "?" nella barra in alto.
const PASSI = [
  { id: "importa", titolo: "Importa dati", testo: "Allinea il Magazzino ai fogli FP e CV", href: "/importa-excel", Icona: Upload },
  { id: "nuovo-sku", titolo: "Nuovo sku", testo: "Crea una scheda, o cerca per duplicarne una", href: "/magazzino/nuovo", Icona: Plus },
  { id: "controllo", titolo: "Sistema quello che manca", testo: "Foto, prezzi e anni mancanti, sku per sku", href: "/sistema/controllo-dati", Icona: ShieldCheck },
  { id: "pubblica", titolo: "Pubblica su un portale", testo: "Genera il file per Shopify, eBay, Catawiki...", href: "/pubblicazione", Icona: Download },
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PASSI.map(({ id, titolo, testo, href, Icona }) => (
            <Link
              key={id}
              href={href}
              onClick={() => { impostaBenvenutoNascosto(nonMostrare); setAperto(false); }}
              className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted"
            >
              <Icona className="size-6 shrink-0 text-primary" aria-hidden />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{titolo}</span>
                <span className="text-xs text-muted-foreground">{testo}</span>
              </span>
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
