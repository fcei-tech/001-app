"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { contatoriMenuAction } from "@/app/menu-actions";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { EVENTO_MOSTRA_BENVENUTO } from "@/lib/benvenuto-preferenza";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

// Menu principale (stile gestionale): le voci rare stanno dentro Archivi
// (elenchi di base) e Sistema (collegamenti, dati, zona pericolo).
const VOCI = [
  { href: "/", etichetta: "Magazzino" },
  { href: "/pubblicazione", etichetta: "Pubblicazione" },
  { href: "/impostazioni", etichetta: "Impostazioni" },
];

// Pagine che appartengono a "Impostazioni" (elenchi, prezzi, dati, sistema).
const PREFISSI_IMPOSTAZIONI = ["/impostazioni", "/archivi", "/sistema"];

export function Header() {
  const pathname = usePathname();
  // Numero di cose da fare su Pubblicazione (registro dei portali statici):
  // si ricalcola a ogni cambio pagina.
  const [daFare, setDaFare] = useState<number | null>(null);
  useEffect(() => {
    let attivo = true;
    contatoriMenuAction()
      .then((c) => {
        if (attivo && c) setDaFare(c.pubblicazione);
      })
      .catch(() => {});
    return () => {
      attivo = false;
    };
  }, [pathname]);
  // CORREZIONE 2026-09-23: prima questi Link navigavano senza controllo -
  // era la via con cui si aggirava (senza volerlo) l'avviso di modifiche
  // non salvate sulla scheda sku, perche' erano un percorso di uscita
  // diverso dal bottone "Torna al Magazzino". Ora passano tutti dallo
  // stesso guardedNavigate condiviso.
  const { guardedNavigate } = useUnsavedChanges();

  function vaiA(href: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      guardedNavigate(href);
    };
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" onClick={vaiA("/")} className="flex items-center gap-3">
          <Image
            src="/brand/logo.png"
            alt="BATCH_"
            width={410}
            height={100}
            priority
            className="block h-8 w-auto dark:hidden"
          />
          <Image
            src="/brand/logo-white.png"
            alt="BATCH_"
            width={410}
            height={100}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {VOCI.map((v) => {
            const attiva =
              v.href === "/"
                ? pathname === "/" || pathname.startsWith("/magazzino")
                : v.href === "/impostazioni"
                  ? PREFISSI_IMPOSTAZIONI.some((p) => pathname.startsWith(p))
                  : pathname.startsWith(v.href);
            return (
              <Link
                key={v.href}
                href={v.href}
                onClick={vaiA(v.href)}
                className={`rounded-md px-3 py-1.5 transition-colors ${attiva ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v.etichetta}
                {v.href === "/pubblicazione" && daFare !== null && daFare > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">{daFare}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => window.dispatchEvent(new Event(EVENTO_MOSTRA_BENVENUTO))}
            aria-label="Guida: cosa vuoi fare?"
            title="Guida: cosa vuoi fare?"
          >
            <CircleHelp />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
