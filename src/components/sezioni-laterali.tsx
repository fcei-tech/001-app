"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";

export type VoceSezione = { href: string; etichetta: string };

// Elenco delle sezioni a sinistra dentro Archivi e Sistema.
export function SezioniLaterali({ titolo, voci }: { titolo: string; voci: VoceSezione[] }) {
  const pathname = usePathname();
  const { guardedNavigate } = useUnsavedChanges();
  return (
    <aside className="md:w-52 md:shrink-0">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</h2>
      <nav className="flex gap-1 md:flex-col">
        {voci.map((v) => {
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
    </aside>
  );
}
