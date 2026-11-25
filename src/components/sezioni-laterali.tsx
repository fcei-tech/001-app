"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { Users, Warehouse, Store, Tags, ListPlus, Euro, DatabaseBackup, ShieldCheck, Eraser, TriangleAlert, LifeBuoy, type LucideIcon } from "lucide-react";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";
import type { GruppoImpostazioni } from "@/lib/voci-impostazioni";

const ICONE: Record<string, LucideIcon> = {
  users: Users,
  warehouse: Warehouse,
  store: Store,
  tags: Tags,
  "list-plus": ListPlus,
  euro: Euro,
  "database-backup": DatabaseBackup,
  "shield-check": ShieldCheck,
  eraser: Eraser,
  "triangle-alert": TriangleAlert,
  "life-buoy": LifeBuoy,
};

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
                const Icona = ICONE[v.icona];
                return (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      e.preventDefault();
                      guardedNavigate(v.href);
                    }}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                      v.pericolo
                        ? `text-destructive ${attiva ? "bg-destructive/10 font-medium" : "hover:bg-destructive/5"}`
                        : attiva
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {Icona && <Icona className="size-4 shrink-0" aria-hidden />}
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
