"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Viste salvate: una combinazione di filtri e ordinamento con un nome (es.
// "Candidati no reserve"), riaprile con un clic. Preferenza personale di
// questo Mac (localStorage), non un dato del database.
type Vista = { nome: string; qs: string };

const VUOTO: Vista[] = [];
const cache = new Map<string, Vista[]>();
const listeners = new Set<() => void>();

function leggi(chiave: string): Vista[] {
  const gia = cache.get(chiave);
  if (gia) return gia;
  if (typeof window === "undefined") return VUOTO;
  let v: Vista[] = VUOTO;
  try {
    const s = window.localStorage.getItem(chiave);
    if (s) {
      const p = JSON.parse(s);
      if (Array.isArray(p)) v = p.filter((x) => x && typeof x.nome === "string" && typeof x.qs === "string");
    }
  } catch {
    // nessuna vista salvata leggibile - riparte vuoto
  }
  cache.set(chiave, v);
  return v;
}

function scrivi(chiave: string, v: Vista[]) {
  cache.set(chiave, v);
  try {
    window.localStorage.setItem(chiave, JSON.stringify(v));
  } catch {
    // non salvata (storage bloccato) - la vista resta valida finche' l'app e' aperta
  }
  listeners.forEach((l) => l());
}

function sottoscrivi(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function MenuViste({
  chiave,
  onApplica,
  ignora = [],
}: {
  // Nome della pagina a cui appartengono le viste (ognuna ha le sue).
  chiave: string;
  // Applica una vista: riceve la query string da riportare nell'URL.
  onApplica: (qs: string) => void;
  // Parametri dell'URL che non fanno parte della vista (es. messaggi di esito).
  ignora?: string[];
}) {
  const chiaveStorage = `posterclub.viste.${chiave}.v1`;
  const viste = useSyncExternalStore(sottoscrivi, () => leggi(chiaveStorage), () => VUOTO);
  const sp = useSearchParams();
  const [dialogAperto, setDialogAperto] = useState(false);
  const [nome, setNome] = useState("");

  const qsAttuale = (() => {
    const p = new URLSearchParams(sp.toString());
    for (const k of ignora) p.delete(k);
    return p.toString();
  })();

  function salva() {
    const n = nome.trim();
    if (!n) return;
    scrivi(chiaveStorage, [...viste.filter((v) => v.nome.toLowerCase() !== n.toLowerCase()), { nome: n, qs: qsAttuale }].sort((a, b) => a.nome.localeCompare(b.nome, "it")));
    setNome("");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" title="Viste salvate: combinazioni di filtri da riaprire con un clic">
            <Bookmark /> Viste <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>Viste salvate</DropdownMenuLabel>
          {viste.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Ancora nessuna vista.</div>}
          {viste.map((v) => (
            <DropdownMenuItem key={v.nome} onSelect={() => onApplica(v.qs)}>
              {v.nome}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogAperto(true)}>Salva la vista attuale…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogAperto} onOpenChange={setDialogAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Viste salvate</DialogTitle>
            <DialogDescription>
              Salva i filtri e l&apos;ordinamento che hai adesso con un nome, per riaprirli in seguito con un clic dal menu «Viste».
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              salva();
            }}
          >
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome della vista, es. Candidati no reserve" maxLength={60} aria-label="Nome della vista" />
            <Button type="submit" disabled={!nome.trim()}>Salva</Button>
          </form>
          {viste.length > 0 && (
            <ul className="flex max-h-60 flex-col divide-y rounded-md border text-sm">
              {viste.map((v) => (
                <li key={v.nome} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 truncate">{v.nome}</span>
                  <button
                    type="button"
                    onClick={() => scrivi(chiaveStorage, viste.filter((x) => x.nome !== v.nome))}
                    aria-label={`Elimina la vista ${v.nome}`}
                    title="Elimina la vista"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogAperto(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
