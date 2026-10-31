"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";
import type { GruppoImpostazioni } from "@/lib/voci-impostazioni";

// Menu a sinistra di "Impostazioni": gruppi con titolo, voce attiva evidenziata.
export function SezioniLaterali({ titolo, gruppi }: { titolo: string; gruppi: GruppoImpostazioni[] }) {
  const pathname = usePathname();
  const { guardedNavigate } = useUnsavedChanges();
  return (
    <aside className="md:w-56 md:shrink-0">
      <h2 className="mb-3 px-3 text-sm font-semibold">{titolo}</h2>
      <div className="flex flex-col gap-4">
        {gruppi.map((g) => (
          <div key={g.titolo}>
            <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titolo}</h3>
            <nav className="flex flex-wrap gap-1 md:flex-col">
              {g.voci.map((v) => {
                const attiva = pathname === v.href;
                return (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      e.preventDefault();
                      guardedNavigate(v.href);
                    }}
                    className={`rounded-md px-3 py-2 text-sm transition-colors ${attiva ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                  >
                    {v.etichetta}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
