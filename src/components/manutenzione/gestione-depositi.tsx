"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  creaDeposito,
  aggiornaDeposito,
  eliminaDeposito,
  type EsitoManutenzione,
} from "@/app/manutenzione/actions";

type Deposito = {
  id: number;
  nome: string;
  tipo: string;
  vendibile: boolean;
  fiscale: boolean;
  referente: string | null;
  attivo: boolean;
  movimenti: number;
  pezzi: number;
  collegatoCanale: boolean;
};

const CLASSE_SELECT =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TIPI = [
  { value: "deposito", label: "Aziendale" },
  { value: "presso_proprietario", label: "Presso il proprietario" },
  { value: "esposizione", label: "Esposizione" },
];

const ETICHETTA_ASTA = "Casa d'asta";

function RigaDeposito({ d, altriNomi, onDisattivato }: { d: Deposito; altriNomi: string[]; onDisattivato: (id: number) => void }) {
  const [chiediConferma, setChiediConferma] = React.useState(false);
  const asta = d.tipo === "asta_fisica";
  const [nome, setNome] = React.useState(d.nome);
  const [tipo, setTipo] = React.useState(d.tipo);
  const [vendibile, setVendibile] = React.useState(d.vendibile);
  const [fiscale, setFiscale] = React.useState(d.fiscale);
  const [referente, setReferente] = React.useState(d.referente ?? "");
  const [attivo, setAttivo] = React.useState(d.attivo);
  const [messaggio, setMessaggio] = React.useState<{ testo: string; errore: boolean } | null>(null);
  const [inCorso, startTransition] = React.useTransition();

  const doppio = altriNomi.some((n) => n.trim().toLowerCase() === nome.trim().toLowerCase());

  function salva(
    sovrascrivi: Partial<{ nome: string; tipo: string; vendibile: boolean; fiscale: boolean; referente: string; attivo: boolean }> = {}
  ) {
    const dati = {
      nome: sovrascrivi.nome ?? nome,
      tipo: sovrascrivi.tipo ?? tipo,
      vendibile: sovrascrivi.vendibile ?? vendibile,
      fiscale: sovrascrivi.fiscale ?? fiscale,
      referente: sovrascrivi.referente ?? referente,
      attivo: sovrascrivi.attivo ?? attivo,
    };
    if (!dati.nome.trim()) {
      setMessaggio({ testo: "Il nome non puo' essere vuoto", errore: true });
      return;
    }
    if (altriNomi.some((n) => n.trim().toLowerCase() === dati.nome.trim().toLowerCase())) {
      setMessaggio({ testo: "Esiste gia' un deposito con questo nome", errore: true });
      return;
    }
    startTransition(async () => {
      const esito = await aggiornaDeposito(d.id, dati);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
      else {
        setMessaggio({ testo: esito.avviso ?? "Salvato", errore: false });
        if (!dati.attivo) onDisattivato(d.id);
      }
    });
  }

  // Conferma "in riga" (due click) invece di window.confirm: nella finestra
  // dell'app desktop il popup del browser non compare e il tasto sembrava
  // non fare nulla.
  function elimina() {
    setChiediConferma(false);
    startTransition(async () => {
      const esito = await eliminaDeposito(d.id);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
    });
  }

  return (
    <tr className={attivo ? "" : "opacity-60"}>
      <td className="p-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => !asta && nome !== d.nome && salva()}
          disabled={asta}
          title={asta ? "Il nome coincide con quello del canale: non modificabile" : undefined}
          aria-label="Nome deposito"
          aria-invalid={doppio}
          className="min-w-40"
        />
      </td>
      <td className="p-2">
        {asta ? (
          <span className="text-sm text-muted-foreground">{ETICHETTA_ASTA}</span>
        ) : (
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
        )}
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          className="size-4"
          checked={vendibile}
          onChange={(e) => {
            setVendibile(e.target.checked);
            salva({ vendibile: e.target.checked });
          }}
          aria-label="Vendibile"
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          className="size-4"
          checked={fiscale}
          onChange={(e) => {
            setFiscale(e.target.checked);
            salva({ fiscale: e.target.checked });
          }}
          aria-label="Fiscale"
        />
      </td>
      <td className="p-2">
        <Input
          value={referente}
          onChange={(e) => setReferente(e.target.value)}
          onBlur={() => referente !== (d.referente ?? "") && salva()}
          aria-label="Referente"
          placeholder="—"
          className="min-w-32"
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
        {d.pezzi} pz · {d.movimenti} mov.
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
        {asta ? (
          <span className="text-xs text-muted-foreground">legato al canale</span>
        ) : d.pezzi === 0 ? (
          chiediConferma ? (
            <span className="flex flex-col items-start gap-1">
              {d.movimenti > 0 && (
                <span className="text-xs text-muted-foreground">
                  Verranno cancellati anche i suoi {d.movimenti} movimenti storici (nessuna quantità cambia).
                </span>
              )}
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Button type="button" variant="destructive" size="sm" onClick={elimina} disabled={inCorso}>
                  Sì, elimina
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setChiediConferma(false)}>
                  No
                </Button>
              </span>
            </span>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setChiediConferma(true)} disabled={inCorso}>
              Elimina
            </Button>
          )
        ) : (
          <span className="text-xs text-muted-foreground" title="Sposta prima i pezzi altrove, oppure disattiva">contiene pezzi</span>
        )}
      </td>
    </tr>
  );
}

export function GestioneDepositi({ depositi }: { depositi: Deposito[] }) {
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState("deposito");
  const [vendibile, setVendibile] = React.useState(true);
  const [fiscale, setFiscale] = React.useState(false);
  const [referente, setReferente] = React.useState("");
  const [esito, setEsito] = React.useState<EsitoManutenzione | null>(null);
  const [inCorso, startTransition] = React.useTransition();
  const [mostraDisattivati, setMostraDisattivati] = React.useState(false);
  // Righe appena disattivate: restano visibili finche' non si lascia la
  // pagina, cosi' si vede l'esito/avviso del salvataggio.
  const [toccati, setToccati] = React.useState<Set<number>>(new Set());
  const nDisattivati = depositi.filter((d) => !d.attivo).length;
  const visibili = depositi.filter((d) => d.attivo || mostraDisattivati || toccati.has(d.id));

  const doppio = depositi.some((d) => d.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || doppio) return;
    startTransition(async () => {
      const r = await creaDeposito({ nome, tipo, vendibile, fiscale, referente });
      setEsito(r);
      if (r.ok) {
        setNome("");
        setTipo("deposito");
        setVendibile(true);
        setFiscale(false);
        setReferente("");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Depositi</h2>
        <p className="text-sm text-muted-foreground">
          Dove si trovano fisicamente i pezzi. &quot;Vendibile&quot; e &quot;Fiscale&quot; sono per ora solo informativi.
          I depositi delle case d&apos;asta nascono insieme al canale e non si rinominano. Un deposito gia&apos; usato non
          si elimina: lo si disattiva.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Nome</th>
              <th className="p-2 font-medium">Tipo</th>
              <th className="p-2 font-medium text-center">Vendibile</th>
              <th className="p-2 font-medium text-center">Fiscale</th>
              <th className="p-2 font-medium">Referente</th>
              <th className="p-2 font-medium text-center">Attivo</th>
              <th className="p-2 font-medium">Contenuto</th>
              <th className="p-2 font-medium" />
              <th className="p-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibili.map((d) => (
              <RigaDeposito
                key={d.id}
                d={d}
                onDisattivato={(id) => setToccati((t) => new Set(t).add(id))}
                altriNomi={depositi.filter((x) => x.id !== d.id).map((x) => x.nome)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {nDisattivati > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4" checked={mostraDisattivati} onChange={(e) => setMostraDisattivati(e.target.checked)} />
          Mostra anche i disattivati ({nDisattivati})
        </label>
      )}
      <form onSubmit={aggiungi} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="nuovo-dep-nome">
            Nuovo deposito
          </label>
          <Input
            id="nuovo-dep-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="es. Magazzino Milano"
            className="min-w-48"
            aria-invalid={doppio}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="nuovo-dep-tipo">
            Tipo
          </label>
          <select id="nuovo-dep-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CLASSE_SELECT}>
            {TIPI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="nuovo-dep-ref">
            Referente
          </label>
          <Input id="nuovo-dep-ref" value={referente} onChange={(e) => setReferente(e.target.value)} className="min-w-32" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4" checked={vendibile} onChange={(e) => setVendibile(e.target.checked)} />
          Vendibile
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4" checked={fiscale} onChange={(e) => setFiscale(e.target.checked)} />
          Fiscale
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
