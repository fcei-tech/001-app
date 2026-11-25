"use client";

// Pagina Proprietari (ridisegnata 2026-11-25): una scheda per proprietario.
// Nome, pezzi e movimenti come frase, Tipo a tre pulsanti, due interruttori con
// una riga di spiegazione. Ogni modifica si salva da sola.
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Interruttore, SceltaTipo } from "./controlli-scheda";
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

const TIPI = [
  { value: "azienda", label: "Azienda" },
  { value: "soci", label: "Soci e privati" },
  { value: "terzo", label: "Clienti" },
];

function frase(pezzi: number, movimenti: number) {
  if (pezzi === 0 && movimenti === 0) return "Nessun pezzo, nessun movimento.";
  const p = pezzi === 1 ? "1 pezzo" : `${pezzi} pezzi`;
  const m = movimenti === 1 ? "1 movimento" : `${movimenti} movimenti`;
  return `${p} e ${m}.`;
}

function SchedaProprietario({ p, altriNomi, onDisattivato }: { p: Proprietario; altriNomi: string[]; onDisattivato: (id: number) => void }) {
  const [chiediConferma, setChiediConferma] = React.useState(false);
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
      setMessaggio({ testo: "Il nome non può essere vuoto", errore: true });
      return;
    }
    if (altriNomi.some((n) => n.trim().toLowerCase() === dati.nome.trim().toLowerCase())) {
      setMessaggio({ testo: "Nome già usato", errore: true });
      return;
    }
    startTransition(async () => {
      const esito = await aggiornaProprietario(p.id, dati);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
      else {
        setMessaggio({ testo: esito.avviso ?? "Salvato", errore: false });
        if (!dati.attivo) onDisattivato(p.id);
      }
    });
  }

  // Conferma "in riga" (due click): nell'app desktop il popup del browser non compare.
  function elimina() {
    setChiediConferma(false);
    startTransition(async () => {
      const esito = await eliminaProprietario(p.id);
      if (!esito.ok) setMessaggio({ testo: esito.errore ?? "Errore", errore: true });
    });
  }

  return (
    <div className={`flex flex-col gap-4 rounded-xl border bg-card p-4 ${attivo ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome !== p.nome && salva()}
            aria-label="Nome proprietario"
            aria-invalid={doppio}
            className="h-10 max-w-sm text-base font-medium"
          />
          <span className="text-sm text-muted-foreground">{frase(p.pezzi, p.movimenti)}</span>
        </div>
        <SceltaTipo
          opzioni={TIPI}
          valore={tipo}
          disabilitato={inCorso}
          onCambia={(v) => {
            setTipo(v);
            salva({ tipo: v });
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Interruttore
          acceso={conta}
          disabilitato={inCorso}
          titolo="Conta nel valore del magazzino"
          spiegazione="Il costo dei suoi pezzi entra nel Valore di carico del Magazzino."
          onCambia={(v) => {
            setConta(v);
            salva({ conta: v });
          }}
        />
        <Interruttore
          acceso={attivo}
          disabilitato={inCorso}
          titolo="Attivo"
          spiegazione="Se spento non compare più nelle scelte. I suoi pezzi restano."
          onCambia={(v) => {
            setAttivo(v);
            salva({ attivo: v });
          }}
        />
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-sm">
        <span className={messaggio?.errore || (doppio && !messaggio) ? "text-destructive" : "text-muted-foreground"}>
          {inCorso ? "Salvo…" : messaggio ? messaggio.testo : doppio ? "Nome già usato" : ""}
        </span>
        {p.movimenti === 0 ? (
          chiediConferma ? (
            <span className="flex items-center gap-1">
              <Button type="button" variant="destructive" size="sm" onClick={elimina} disabled={inCorso}>
                Sì, elimina
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChiediConferma(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setChiediConferma(true)} disabled={inCorso}>
              Elimina
            </Button>
          )
        ) : (
          <span className="text-xs text-muted-foreground">In uso: non si elimina, si disattiva.</span>
        )}
      </div>
    </div>
  );
}

export function GestioneProprietari({ proprietari }: { proprietari: Proprietario[] }) {
  const [nuovoAperto, setNuovoAperto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState("terzo");
  const [conta, setConta] = React.useState(false);
  const [esito, setEsito] = React.useState<EsitoManutenzione | null>(null);
  const [inCorso, startTransition] = React.useTransition();
  const [mostraDisattivati, setMostraDisattivati] = React.useState(false);
  // Appena disattivato resta visibile finche' non si lascia la pagina.
  const [toccati, setToccati] = React.useState<Set<number>>(new Set());
  const nDisattivati = proprietari.filter((p) => !p.attivo).length;
  const visibili = proprietari.filter((p) => p.attivo || mostraDisattivati || toccati.has(p.id));

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
        setNuovoAperto(false);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Proprietari</h2>
          <p className="text-sm text-muted-foreground">Di chi sono i pezzi.</p>
        </div>
        {!nuovoAperto && (
          <Button type="button" onClick={() => setNuovoAperto(true)}>
            <Plus /> Nuovo proprietario
          </Button>
        )}
      </div>

      {nuovoAperto && (
        <form onSubmit={aggiungi} className="flex flex-col gap-4 rounded-xl border border-dashed p-4">
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome, es. Mario Rossi"
            aria-label="Nome del nuovo proprietario"
            aria-invalid={doppio}
            className="h-10 max-w-sm"
          />
          <SceltaTipo opzioni={TIPI} valore={tipo} onCambia={setTipo} />
          <Interruttore acceso={conta} onCambia={setConta} titolo="Conta nel valore del magazzino" spiegazione="Il costo dei suoi pezzi entra nel Valore di carico del Magazzino." />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={inCorso || !nome.trim() || doppio}>
              Aggiungi
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNuovoAperto(false)}>
              Annulla
            </Button>
            {doppio && nome.trim() && <span className="text-sm text-destructive">Nome già usato</span>}
            {esito && !esito.ok && <span className="text-sm text-destructive">{esito.errore}</span>}
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {visibili.map((p) => (
          <SchedaProprietario
            key={p.id}
            p={p}
            onDisattivato={(id) => setToccati((t) => new Set(t).add(id))}
            altriNomi={proprietari.filter((x) => x.id !== p.id).map((x) => x.nome)}
          />
        ))}
      </div>

      {nDisattivati > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4" checked={mostraDisattivati} onChange={(e) => setMostraDisattivati(e.target.checked)} />
          Mostra anche i disattivati ({nDisattivati})
        </label>
      )}
    </section>
  );
}
