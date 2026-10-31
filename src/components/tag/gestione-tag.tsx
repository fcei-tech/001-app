"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  creaTagAction,
  eliminaTagAction,
  impostaTipoTagAction,
  impostaVaiSuShopifyAction,
  rinominaTagAction,
} from "@/app/archivi/tag/actions";
import type { TagInfo } from "@/db/tag-queries";

function RigaTag({ t, onEsito }: { t: TagInfo; onEsito: (ok: boolean, testo: string) => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(t.nome);
  const [pending, start] = useTransition();
  const [confermaElimina, setConfermaElimina] = useState(false);

  function salvaNome() {
    if (nome.trim() === t.nome) return;
    start(async () => {
      const r = await rinominaTagAction(t.id, nome);
      if (!r.ok) {
        setNome(t.nome);
        onEsito(false, r.errore ?? "Non riuscito.");
      } else {
        onEsito(true, "Nome cambiato.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvaNome}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-8 w-56"
        aria-label={`Nome del tag ${t.nome}`}
        disabled={pending}
      />
      <select
        value={t.tipo}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await impostaTipoTagAction(t.id, e.target.value);
            if (!r.ok) onEsito(false, r.errore ?? "Non riuscito.");
            router.refresh();
          })
        }
        className="h-8 rounded-md border bg-background px-2 text-sm"
        aria-label="Tipo"
      >
        <option value="interno">Di lavoro (solo per me)</option>
        <option value="soggetto">Soggetto</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Per ora non fa nulla: nessun file per i portali legge questo interruttore.">
        <input
          type="checkbox"
          checked={t.vaiSuShopify}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const r = await impostaVaiSuShopifyAction(t.id, e.target.checked);
              if (!r.ok) onEsito(false, r.errore ?? "Non riuscito.");
              router.refresh();
            })
          }
          className="size-4"
        />
        Va su Shopify (non ancora attivo)
      </label>
      <Badge variant="secondary" className="ml-auto">{t.numeroSku} sku</Badge>
      {confermaElimina ? (
        <span className="flex items-center gap-2 text-xs">
          {t.numeroSku > 0 ? `Lo tolgo da ${t.numeroSku} sku e lo elimino?` : "Eliminare?"}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await eliminaTagAction(t.id);
                onEsito(r.ok, r.ok ? (r.messaggio ?? "Tag eliminato.") : (r.errore ?? "Non riuscito."));
                setConfermaElimina(false);
                router.refresh();
              })
            }
          >
            Sì, elimina
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfermaElimina(false)}>No</Button>
        </span>
      ) : (
        <Button type="button" size="icon" variant="ghost" onClick={() => setConfermaElimina(true)} aria-label={`Elimina il tag ${t.nome}`}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

export function GestioneTag({ tag }: { tag: TagInfo[] }) {
  const router = useRouter();
  const [nuovo, setNuovo] = useState("");
  const [tipo, setTipo] = useState("soggetto");
  const [pending, start] = useTransition();
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  function crea() {
    start(async () => {
      const r = await creaTagAction(nuovo, tipo);
      if (!r.ok) {
        setEsito({ ok: false, testo: r.errore ?? "Non riuscito." });
        return;
      }
      setEsito({ ok: true, testo: `Tag "${nuovo.trim()}" creato.` });
      setNuovo("");
      router.refresh();
    });
  }

  const interni = tag.filter((t) => t.tipo === "interno");
  const soggetti = tag.filter((t) => t.tipo !== "interno");

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); crea(); }}
      >
        <Input value={nuovo} onChange={(e) => setNuovo(e.target.value)} placeholder="Nome del nuovo tag" className="h-8 w-56" aria-label="Nome del nuovo tag" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Tipo del nuovo tag">
          <option value="soggetto">Soggetto</option>
          <option value="interno">Di lavoro (solo per me)</option>
        </select>
        <Button type="submit" size="sm" disabled={pending || !nuovo.trim()}>Aggiungi tag</Button>
      </form>

      {esito && (
        <div className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${esito.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          <span>{esito.testo}</span>
          <button type="button" onClick={() => setEsito(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {[{ titolo: "Di lavoro", voci: interni }, { titolo: "Soggetto", voci: soggetti }].map((g) => (
        <div key={g.titolo} className="rounded-xl border">
          <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titolo}</div>
          {g.voci.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nessun tag.</p>
          ) : (
            <div className="divide-y">{g.voci.map((t) => <RigaTag key={t.id} t={t} onEsito={(ok, testo) => setEsito({ ok, testo })} />)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
