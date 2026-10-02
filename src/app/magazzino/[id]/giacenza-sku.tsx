"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { annullaMovimenti, correggiQuantita, spostaGiacenza, type EsitoSpostamento } from "@/app/magazzino/actions";
import { CasellaRegistro } from "@/components/magazzino/casella-registro";
import type { GiacenzaRiga } from "@/lib/giacenza";

type Opzione = { id: number; nome: string };

const CLASSE_SELECT =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Messaggio = { testo: string; tipo: "ok" | "avviso" | "errore" };

type Ctx = {
  skuId: number;
  destinazioni: Opzione[];
  proprietari: Opzione[];
  righe: GiacenzaRiga[];
  esegui: (op: () => Promise<EsitoSpostamento>, descrizione: string) => Promise<boolean>;
  occupato: boolean;
  inRegistro: boolean;
};

function RigaSposta({ riga, ctx }: { riga: GiacenzaRiga; ctx: Ctx }) {
  const asta = riga.ubicazioneTipo === "asta_fisica";
  const [numero, setNumero] = React.useState(String(riga.saldo));
  const [aperto, setAperto] = React.useState(false);
  const [quanti, setQuanti] = React.useState(String(riga.saldo));
  const [aProp, setAProp] = React.useState(String(riga.proprietarioId));
  const [aDep, setADep] = React.useState(
    String(ctx.destinazioni.find((d) => d.id !== riga.ubicazioneId)?.id ?? ctx.destinazioni[0]?.id ?? "")
  );

  async function salvaNumero() {
    if (numero.trim() === String(riga.saldo)) return;
    const ok = await ctx.esegui(
      () =>
        correggiQuantita({
          skuId: ctx.skuId,
          proprietarioId: riga.proprietarioId,
          ubicazioneId: riga.ubicazioneId,
          nuovaQuantita: Number(numero),
          inRegistro: ctx.inRegistro,
        }),
      `${riga.ubicazioneNome} (${riga.proprietarioNome}): ${riga.saldo} → ${numero}`
    );
    if (!ok) setNumero(String(riga.saldo));
  }

  async function sposta() {
    const ok = await ctx.esegui(
      () =>
        spostaGiacenza({
          skuId: ctx.skuId,
          proprietarioId: riga.proprietarioId,
          daUbicazioneId: riga.ubicazioneId,
          aUbicazioneId: Number(aDep),
          aProprietarioId: Number(aProp),
          quantita: Number(quanti),
          inRegistro: ctx.inRegistro,
        }),
      `Spostamento da ${riga.ubicazioneNome}`
    );
    if (ok) setAperto(false);
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-36 font-medium">{riga.ubicazioneNome}</span>
        <span className="min-w-20 text-muted-foreground">{riga.proprietarioNome}</span>
        {asta ? (
          <span className="tabular-nums" title="In una casa d'asta il numero non si corregge a mano">
            {riga.saldo} pz <span className="text-xs text-muted-foreground">(presso l&apos;asta)</span>
          </span>
        ) : (
          <label className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onBlur={salvaNumero}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              disabled={ctx.occupato}
              aria-label={`Quantita' in ${riga.ubicazioneNome}`}
              className="h-8 w-20 text-right tabular-nums"
            />
            <span className="text-sm text-muted-foreground">pz</span>
          </label>
        )}
        {!aperto && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAperto(true)}>
            Sposta
          </Button>
        )}
      </div>
      {aperto && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Quanti pezzi</label>
            <Input type="number" min={1} max={riga.saldo} value={quanti} onChange={(e) => setQuanti(e.target.value)} className="h-9 w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Proprietario</label>
            <select value={aProp} onChange={(e) => setAProp(e.target.value)} className={CLASSE_SELECT}>
              {ctx.proprietari.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Deposito</label>
            <select value={aDep} onChange={(e) => setADep(e.target.value)} className={CLASSE_SELECT}>
              {ctx.destinazioni.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={sposta} disabled={ctx.occupato || !aDep}>
            {ctx.occupato ? "Sposto…" : "Conferma"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAperto(false)} disabled={ctx.occupato}>
            Chiudi
          </Button>
          {asta && (
            <p className="basis-full text-xs text-muted-foreground">
              Questi pezzi sono presso una casa d&apos;asta. Se sono tornati indietro usa piuttosto Rientrato dal batch, cosi&apos; il
              lotto resta coerente.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function AggiungiPezzi({ ctx }: { ctx: Ctx }) {
  const [aperto, setAperto] = React.useState(false);
  const [prop, setProp] = React.useState(String(ctx.proprietari[0]?.id ?? ""));
  const [dep, setDep] = React.useState(String(ctx.destinazioni[0]?.id ?? ""));
  const [quanti, setQuanti] = React.useState("1");

  if (!aperto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAperto(true)}>
        + Aggiungi pezzi
      </Button>
    );
  }

  async function aggiungi() {
    const esistente = ctx.righe.find((r) => r.proprietarioId === Number(prop) && r.ubicazioneId === Number(dep));
    const nuova = (esistente?.saldo ?? 0) + Number(quanti);
    const ok = await ctx.esegui(
      () =>
        correggiQuantita({
          skuId: ctx.skuId,
          proprietarioId: Number(prop),
          ubicazioneId: Number(dep),
          nuovaQuantita: nuova,
          inRegistro: ctx.inRegistro,
          nota: `Aggiunti ${quanti} pezzi`,
        }),
      `Aggiunti ${quanti} pezzi`
    );
    if (ok) setAperto(false);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Proprietario</label>
        <select value={prop} onChange={(e) => setProp(e.target.value)} className={CLASSE_SELECT}>
          {ctx.proprietari.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Deposito</label>
        <select value={dep} onChange={(e) => setDep(e.target.value)} className={CLASSE_SELECT}>
          {ctx.destinazioni.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Quanti pezzi in piu&apos;</label>
        <Input type="number" min={1} value={quanti} onChange={(e) => setQuanti(e.target.value)} className="h-9 w-24" />
      </div>
      <Button type="button" size="sm" onClick={aggiungi} disabled={ctx.occupato || !prop || !dep || Number(quanti) < 1}>
        Aggiungi
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAperto(false)} disabled={ctx.occupato}>
        Chiudi
      </Button>
    </div>
  );
}

// Dove sono i pezzi di questo sku adesso e come cambiarli: numero
// modificabile (nel registro o no, a scelta con la casella), Sposta fra depositi
// e/o proprietari scegliendo quanti pezzi, Aggiungi pezzi, Annulla dell'ultima
// operazione. Usato sia nella scheda sku sia nella finestra aperta dalla
// tabella Magazzino.
export function GiacenzaSku({
  skuId,
  righe,
  destinazioni,
  proprietari,
  impegnato,
}: {
  skuId: number;
  righe: GiacenzaRiga[];
  destinazioni: Opzione[];
  proprietari: Opzione[];
  impegnato?: number;
}) {
  const router = useRouter();
  const [messaggio, setMessaggio] = React.useState<Messaggio | null>(null);
  const [ultima, setUltima] = React.useState<{ ids: number[]; testo: string } | null>(null);
  const [occupato, startTransition] = React.useTransition();
  const [chiave, setChiave] = React.useState(0);
  // Scelta valida per UNA operazione: dopo ogni operazione torna spuntata.
  const [inRegistro, setInRegistro] = React.useState(true);

  const esegui: Ctx["esegui"] = (op, descrizione) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const esito = await op();
        if (!esito.ok) {
          setMessaggio({ testo: esito.errore ?? "Errore", tipo: "errore" });
          resolve(false);
          return;
        }
        setMessaggio(
          esito.avviso
            ? { testo: `${esito.messaggio ?? "Fatto."} ${esito.avviso}`, tipo: "avviso" }
            : { testo: esito.messaggio ?? "Fatto.", tipo: "ok" }
        );
        setUltima(esito.movimentoIds && esito.movimentoIds.length > 0 ? { ids: esito.movimentoIds, testo: descrizione } : null);
        setChiave((k) => k + 1);
        setInRegistro(true);
        router.refresh();
        resolve(true);
      });
    });

  function annulla() {
    if (!ultima) return;
    const { ids } = ultima;
    startTransition(async () => {
      const esito = await annullaMovimenti(skuId, ids);
      if (!esito.ok) {
        setMessaggio({ testo: esito.errore ?? "Errore", tipo: "errore" });
        return;
      }
      setMessaggio({ testo: "Operazione annullata.", tipo: "ok" });
      setUltima(null);
      setChiave((k) => k + 1);
      router.refresh();
    });
  }

  const ctx: Ctx = { skuId, destinazioni, proprietari, righe, esegui, occupato, inRegistro };

  return (
    <div className="flex flex-col gap-3">
      {righe.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun pezzo a magazzino.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {righe.map((r) => (
            <RigaSposta key={`${r.ubicazioneId}:${r.proprietarioId}:${r.saldo}:${chiave}`} riga={r} ctx={ctx} />
          ))}
        </ul>
      )}
      <AggiungiPezzi key={`add-${chiave}`} ctx={ctx} />
      <CasellaRegistro id={`registro-giacenza-${skuId}`} checked={inRegistro} onCheckedChange={setInRegistro} disabled={occupato} />
      {impegnato !== undefined && impegnato > 0 && (
        <p className="text-xs text-muted-foreground">Impegnati in batch: {impegnato}.</p>
      )}
      {(messaggio || ultima) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {messaggio && (
            <span
              className={
                messaggio.tipo === "errore"
                  ? "text-destructive"
                  : messaggio.tipo === "avviso"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }
            >
              {messaggio.testo}
            </span>
          )}
          {ultima && (
            <Button type="button" variant="outline" size="sm" onClick={annulla} disabled={occupato}>
              Annulla ultima operazione
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
