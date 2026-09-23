"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export function Header() {
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
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/" onClick={vaiA("/")} className="text-foreground">
            Magazzino
          </Link>
          <span className="opacity-50">Pubblicazione</span>
          <Link href="/impostazioni" onClick={vaiA("/impostazioni")} className="hover:text-foreground">
            Impostazioni
          </Link>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
