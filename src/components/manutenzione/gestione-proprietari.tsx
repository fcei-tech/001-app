"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  creaProprietario,
  aggiornaProprietario,
  eliminaProprietario,
  type EsitoManutenzione,
} from "@/app/manutenzione/actions";

type Proprietario = {
  id: number;
  nome: string;
  tipo: string;
  contaValoreAziendale: boolean;
  attivo: boolean;
  movimenti: number;
  pezzi: number;
};

const CLASSE_SELECT =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TIPI = [
  { value: "azienda", label: "Azienda" },
  { value: "soci", label: "Soci / privati" },
  { value: "terzo", label: "Terzo (cliente)" },
];

function RigaProprietario({ p, altriNomi }: { p: Proprietario; altriNomi: string[] }) {
  const [nome, setNome] = React.useState(p.nome);
  const [tipo, setTipo] = React.useState(p.tipo);
  const [conta, setConta] = React.useState(p.contaValoreAziendale);
  const [attivo, setAttivo] = React.useState(p.attivo);
  const [messaggio, setMessaggio] = React.useState<{ testo: string; errore: boolean } | null>(null);
  const [inCorso, startTransition] = React.useTransition();

  const doppio = altriNomi.some((n) => n.trim().toLowerCase() === nome.trim().toLowerCase());

  function salva(sovrascrivi: Partial<{ nome: string; tipo: string; conta: boolean; attivo: boolean }> = {}) {
    const dati = {
      nome: sovrascrivi.nome ?? nome,
      tipo: sovrascrivi.tipo ?? tipo,
      contaValoreAziendale: sovrascrivi.conta ?? conta,
      attivo: sovrascrivi.attivo ?? attivo,
    };
    if (!dati.nome.trim()) {
      setMessaggio({ testo: "Il nome non puo' essere vuoto", errore: true });
      return;
    }
    if (altriNomi.some((n) => n.trim().toLowerCase() === dati.nome.trim().toLowerCase())) {
      setMessaggio({ testo: "Esiste gia' un proprietario con questo nome", errore: true });
      return;
    }
    startTransition(async () => {
      const esito = await aggiornaProprietario(p.id, dati);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
      else setMessaggio({ testo: esito.avviso ?? "Salvato", errore: false });
    });
  }

  function elimina() {
    if (!window.confirm(`Eliminare il proprietario "${p.nome}"?`)) return;
    startTransition(async () => {
      const esito = await eliminaProprietario(p.id);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
    });
  }

  return (
    <tr className={attivo ? "" : "opacity-60"}>
      <td className="p-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome !== p.nome && salva()}
          aria-label="Nome proprietario"
          aria-invalid={doppio}
          className="min-w-40"
        />
      </td>
      <td className="p-2">
        <select
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value);
            salva({ tipo: e.target.value });
          }}
          className={CLASSE_SELECT}
          aria-label="Tipo"
        >
          {TIPI.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          className="size-4"
          checked={conta}
          onChange={(e) => {
            setConta(e.target.checked);
            salva({ conta: e.target.checked });
          }}
          aria-label="Conta nel valore aziendale"
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          className="size-4"
          checked={attivo}
          onChange={(e) => {
            setAttivo(e.target.checked);
            salva({ attivo: e.target.checked });
          }}
          aria-label="Attivo"
        />
      </td>
      <td className="p-2 text-sm text-muted-foreground whitespace-nowrap">
        {p.pezzi} pz · {p.movimenti} mov.
      </td>
      <td className="p-2 text-sm">
        {inCorso ? (
          <span className="text-muted-foreground">Salvo…</span>
        ) : messaggio ? (
          <span className={messaggio.errore ? "text-destructive" : "text-muted-foreground"}>{messaggio.testo}</span>
        ) : null}
        {doppio && !messaggio && <span className="text-destructive">Nome gia&apos; usato</span>}
      </td>
      <td className="p-2">
        {p.movimenti === 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={elimina} disabled={inCorso}>
            Elimina
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">in uso</span>
        )}
      </td>
    </tr>
  );
}

export function GestioneProprietari({ proprietari }: { proprietari: Proprietario[] }) {
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState("terzo");
  const [conta, setConta] = React.useState(false);
  const [esito, setEsito] = React.useState<EsitoManutenzione | null>(null);
  const [inCorso, startTransition] = React.useTransition();

  const doppio = proprietari.some((p) => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || doppio) return;
    startTransition(async () => {
      const r = await creaProprietario({ nome, tipo, contaValoreAziendale: conta });
      setEsito(r);
      if (r.ok) {
        setNome("");
        setTipo("terzo");
        setConta(false);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Proprietari</h2>
        <p className="text-sm text-muted-foreground">
          Di chi sono i pezzi. &quot;Conta nel valore aziendale&quot; indica quali proprieta&apos; rientreranno nel valore di
          magazzino dell&apos;azienda (per ora solo informativo). Un proprietario gia&apos; usato non si elimina: lo si
          disattiva.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Nome</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium text-center">Conta nel valore aziendale</th>
              <th className="p-2 font-medium text-center">Attivo</th>
              <th className="p-2 font-medium">Uso</th>
              <th className="p-2 font-medium" />
              <th className="p-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {proprietari.map((p) => (
              <RigaProprietario
                key={p.id}
                p={p}
                altriNomi={proprietari.filter((x) => x.id !== p.id).map((x) => x.nome)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={aggiungi} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="nuovo-prop-nome">
            Nuovo proprietario
          </label>
          <Input
            id="nuovo-prop-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="es. Mario Rossi"
            className="min-w-48"
            aria-invalid={doppio}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="nuovo-prop-tipo">
            Tipo
          </label>
          <select id="nuovo-prop-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CLASSE_SELECT}>
            {TIPI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4" checked={conta} onChange={(e) => setConta(e.target.checked)} />
          Conta nel valore aziendale
        </label>
        <Button type="submit" size="sm" disabled={inCorso || !nome.trim() || doppio}>
          Aggiungi
        </Button>
        {doppio && nome.trim() && <span className="pb-2 text-sm text-destructive">Nome gia&apos; usato</span>}
        {esito && !esito.ok && <span className="pb-2 text-sm text-destructive">{esito.errore}</span>}
      </form>
    </section>
  );
}
