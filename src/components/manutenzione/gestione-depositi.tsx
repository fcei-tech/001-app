"use client";

// Pagina Depositi (ridisegnata 2026-11-25): una scheda per deposito, come i Proprietari.
// Ogni modifica si salva da sola.
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Interruttore, SceltaTipo } from "./controlli-scheda";
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

const TIPI = [
  { value: "deposito", label: "Aziendale" },
  { value: "presso_proprietario", label: "Presso il proprietario" },
];

function frase(pezzi: number, movimenti: number) {
  if (pezzi === 0 && movimenti === 0) return "Nessun pezzo, nessun movimento.";
  const p = pezzi === 1 ? "1 pezzo" : `${pezzi} pezzi`;
  const m = movimenti === 1 ? "1 movimento" : `${movimenti} movimenti`;
  return `${p} e ${m}.`;
}

function SchedaDeposito({ d, altriNomi, onDisattivato }: { d: Deposito; altriNomi: string[]; onDisattivato: (id: number) => void }) {
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
      setMessaggio({ testo: "Il nome non può essere vuoto", errore: true });
      return;
    }
    if (altriNomi.some((n) => n.trim().toLowerCase() === dati.nome.trim().toLowerCase())) {
      setMessaggio({ testo: "Nome già usato", errore: true });
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

  // Conferma "in riga" (due click): nell'app desktop il popup del browser non compare.
  function elimina() {
    setChiediConferma(false);
    startTransition(async () => {
      const esito = await eliminaDeposito(d.id);
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
            onBlur={() => !asta && nome !== d.nome && salva()}
            disabled={asta}
            title={asta ? "Il nome coincide con quello del canale: non modificabile" : undefined}
            aria-label="Nome deposito"
            aria-invalid={doppio}
            className="h-10 max-w-sm text-base font-medium"
          />
          <span className="text-sm text-muted-foreground">{frase(d.pezzi, d.movimenti)}</span>
        </div>
        {asta ? (
          <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground">Casa d&apos;asta · legato al canale</span>
        ) : (
          <SceltaTipo
            opzioni={TIPI}
            valore={tipo}
            disabilitato={inCorso}
            onCambia={(v) => {
              setTipo(v);
              salva({ tipo: v });
            }}
          />
        )}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`dep-ref-${d.id}`}>
          Referente
        </label>
        <Input
          id={`dep-ref-${d.id}`}
          value={referente}
          onChange={(e) => setReferente(e.target.value)}
          onBlur={() => referente !== (d.referente ?? "") && salva()}
          placeholder="—"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Interruttore
          acceso={vendibile}
          disabilitato={inCorso}
          titolo="Vendibile"
          spiegazione="Solo informativo, per ora."
          onCambia={(v) => {
            setVendibile(v);
            salva({ vendibile: v });
          }}
        />
        <Interruttore
          acceso={fiscale}
          disabilitato={inCorso}
          titolo="Fiscale"
          spiegazione="Solo informativo, per ora."
          onCambia={(v) => {
            setFiscale(v);
            salva({ fiscale: v });
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
        {asta ? (
          <span className="text-xs text-muted-foreground">Nome e vita del deposito seguono il canale.</span>
        ) : d.pezzi === 0 ? (
          chiediConferma ? (
            <span className="flex flex-wrap items-center gap-2">
              {d.movimenti > 0 && (
                <span className="text-xs text-muted-foreground">
                  Verranno cancellati anche i suoi {d.movimenti} movimenti storici (nessuna quantità cambia).
                </span>
              )}
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
          <span className="text-xs text-muted-foreground">Contiene pezzi: sposta prima i pezzi, oppure disattiva.</span>
        )}
      </div>
    </div>
  );
}

export function GestioneDepositi({ depositi }: { depositi: Deposito[] }) {
  const [nuovoAperto, setNuovoAperto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState("deposito");
  const [vendibile, setVendibile] = React.useState(true);
  const [fiscale, setFiscale] = React.useState(false);
  const [referente, setReferente] = React.useState("");
  const [esito, setEsito] = React.useState<EsitoManutenzione | null>(null);
  const [inCorso, startTransition] = React.useTransition();
  const [mostraDisattivati, setMostraDisattivati] = React.useState(false);
  // Appena disattivato resta visibile finche' non si lascia la pagina.
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
        setNuovoAperto(false);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Depositi</h2>
          <p className="text-sm text-muted-foreground">
            Dove si trovano fisicamente i pezzi. I depositi delle case d&apos;asta nascono insieme al canale.
          </p>
        </div>
        {!nuovoAperto && (
          <Button type="button" onClick={() => setNuovoAperto(true)}>
            <Plus /> Nuovo deposito
          </Button>
        )}
      </div>

      {nuovoAperto && (
        <form onSubmit={aggiungi} className="flex flex-col gap-4 rounded-xl border border-dashed p-4">
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome, es. Magazzino Milano"
            aria-label="Nome del nuovo deposito"
            aria-invalid={doppio}
            className="h-10 max-w-sm"
          />
          <SceltaTipo opzioni={TIPI} valore={tipo} onCambia={setTipo} />
          <Input
            value={referente}
            onChange={(e) => setReferente(e.target.value)}
            placeholder="Referente (facoltativo)"
            aria-label="Referente"
            className="max-w-sm"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Interruttore acceso={vendibile} onCambia={setVendibile} titolo="Vendibile" spiegazione="Solo informativo, per ora." />
            <Interruttore acceso={fiscale} onCambia={setFiscale} titolo="Fiscale" spiegazione="Solo informativo, per ora." />
          </div>
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
        {visibili.map((d) => (
          <SchedaDeposito
            key={d.id}
            d={d}
            onDisattivato={(id) => setToccati((t) => new Set(t).add(id))}
            altriNomi={depositi.filter((x) => x.id !== d.id).map((x) => x.nome)}
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
