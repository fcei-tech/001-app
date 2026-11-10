"use client";

import * as React from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apriZip, type VoceZip } from "@/lib/zip-store";
import { leggiFileSchede, mancaNellaScheda, type SchedaTelefono } from "@/lib/schede-telefono";
import { anteprimaSchede, creaSkuDaScheda, type VoceAnteprimaScheda } from "./actions";
import { caricaUnaFotoSku } from "@/app/magazzino/actions";

type Scelta = "rinomina" | "ignora";
type Esito = { creati: { vecchio: string; nuovo: string; foto: number }[]; saltati: string[]; errori: string[] };

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

function mimeDaNome(n: string) {
  const e = n.split(".").pop()?.toLowerCase();
  return e === "png" ? "image/png" : e === "webp" ? "image/webp" : e === "heic" ? "image/heic" : "image/jpeg";
}

export function ImportaSchedeFlow({
  depositi,
  tipi,
  proprietari,
  depositoIniziale,
  tipoIniziale,
}: {
  depositi: { id: number; nome: string }[];
  tipi: { id: number; nome: string }[];
  proprietari: { id: number; nome: string; tipo: string }[];
  depositoIniziale: number | null;
  tipoIniziale: number | null;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [lavoro, setLavoro] = React.useState<string | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);
  const [schede, setSchede] = React.useState<SchedaTelefono[] | null>(null);
  const [voci, setVoci] = React.useState<VoceAnteprimaScheda[]>([]);
  const [voceFoto, setVoceFoto] = React.useState<Map<string, VoceZip>>(new Map());
  const [scelte, setScelte] = React.useState<Record<string, Scelta>>({});
  const [deposito, setDeposito] = React.useState<number | null>(depositoIniziale);
  // Scelte per TESTO non riconosciuto (chiave = testo normalizzato): valgono per tutte le schede che lo usano.
  const [depositoTesto, setDepositoTesto] = React.useState<Record<string, number>>({});
  const [proprietarioTesto, setProprietarioTesto] = React.useState<Record<string, number>>({});
  const [tipoTesto, setTipoTesto] = React.useState<Record<string, number>>({});
  const [tipo, setTipo] = React.useState<number | null>(tipoIniziale);
  const [esito, setEsito] = React.useState<Esito | null>(null);

  async function analizza() {
    if (!file) return;
    setErrore(null);
    setEsito(null);
    setSchede(null);
    setLavoro("Leggo lo zip…");
    try {
      const voci = apriZip(await file.arrayBuffer());
      const json = voci.find((v) => v.nome === "schede.json");
      if (!json) throw new Error("Nello zip manca schede.json: e' lo zip giusto?");
      const testo = new TextDecoder().decode(await json.leggi());
      const letto = leggiFileSchede(JSON.parse(testo));
      const mappa = new Map<string, VoceZip>();
      for (const v of voci) if (v.nome.startsWith("foto/")) mappa.set(v.nome.slice(5), v);
      for (const s of letto.schede) for (const f of s.foto) if (!mappa.has(f)) throw new Error(`Nello zip manca la foto ${f} dell'articolo ${s.codice}.`);
      const r = await anteprimaSchede(JSON.stringify(letto));
      if (!r.ok) throw new Error(r.errore);
      setSchede(letto.schede);
      setVoci(r.voci);
      setVoceFoto(mappa);
      setScelte({});
      setDepositoTesto({});
      setProprietarioTesto({});
      setTipoTesto({});
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nella lettura.");
    } finally {
      setLavoro(null);
    }
  }

  // Deposito di una scheda: nome scritto sul telefono se coincide con un deposito di BATCH,
  // altrimenti la scelta fatta qui sulla riga, altrimenti il deposito principale (menu in alto).
  const riconosciuto = (s: SchedaTelefono) => (s.deposito.trim() ? depositi.find((d) => norm(d.nome) === norm(s.deposito))?.id ?? null : null);
  const depositoDi = (s: SchedaTelefono) => riconosciuto(s) ?? depositoTesto[norm(s.deposito)] ?? deposito;
  // Proprietario: nome scritto sul telefono se coincide, altrimenti scelta sulla riga, altrimenti la regola di sempre (FP = primo azienda, CV = primo soci).
  const propRiconosciuto = (s: SchedaTelefono) => (s.proprietario.trim() ? proprietari.find((p) => norm(p.nome) === norm(s.proprietario))?.id ?? null : null);
  const propPredefinito = (s: SchedaTelefono) => proprietari.find((p) => p.tipo === (s.proprieta === "FP" ? "azienda" : "soci"))?.id ?? proprietari[0]?.id ?? null;
  const proprietarioDi = (s: SchedaTelefono) => propRiconosciuto(s) ?? proprietarioTesto[norm(s.proprietario)] ?? propPredefinito(s);
  // Tipo oggetto: come il deposito; vuoto = tipo predefinito (menu in alto).
  const tipoRiconosciuto = (s: SchedaTelefono) => (s.tipo.trim() ? tipi.find((x) => norm(x.nome) === norm(s.tipo))?.id ?? null : null);
  const tipoDi = (s: SchedaTelefono) => tipoRiconosciuto(s) ?? tipoTesto[norm(s.tipo)] ?? tipo;
  const nomeDi = (lista: { id: number; nome: string }[], id: number | null) => lista.find((x) => x.id === id)?.nome ?? "—";
  const attive = (schede ?? []).filter((s) => voci.find((v) => v.codice === s.codice)?.stato !== "gia_presente");
  // Testi distinti non riconosciuti, con quante schede li usano.
  function gruppi(testo: (s: SchedaTelefono) => string, ok: (s: SchedaTelefono) => number | null) {
    const m = new Map<string, { testo: string; n: number }>();
    for (const s of attive) {
      const t = testo(s).trim();
      if (!t || ok(s) !== null) continue;
      const k = norm(t);
      m.set(k, { testo: t, n: (m.get(k)?.n ?? 0) + 1 });
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v }));
  }
  const gDep = gruppi((s) => s.deposito, riconosciuto);
  const gProp = gruppi((s) => s.proprietario, propRiconosciuto);
  const gTipo = gruppi((s) => s.tipo, tipoRiconosciuto);
  const daRisolvere = gDep.length + gProp.length + gTipo.length;
  const conflitti = voci.filter((v) => v.stato === "conflitto");
  const nonDecisi = conflitti.filter((v) => !scelte[v.codice]).length;
  const daCreare = voci.filter((v) => v.stato === "nuova" || (v.stato === "conflitto" && scelte[v.codice] === "rinomina"));

  async function conferma() {
    if (!schede || deposito === null || tipo === null) return;
    setErrore(null);
    const out: Esito = { creati: [], saltati: [], errori: [] };
    const json = JSON.stringify({ formato: "posterclub-schede", versione: 1, creato: "", schede });
    let fatte = 0;
    for (const v of voci) {
      const s = schede.find((x) => x.codice === v.codice)!;
      const rinomina = v.stato === "conflitto" && scelte[v.codice] === "rinomina";
      if (v.stato === "gia_presente" || (v.stato === "conflitto" && !rinomina)) {
        out.saltati.push(v.codice);
        continue;
      }
      setLavoro(`Creo ${v.codice} (${++fatte}/${daCreare.length})…`);
      const r = await creaSkuDaScheda(json, v.codice, depositoDi(s) ?? deposito, tipoDi(s) ?? tipo, rinomina, proprietarioDi(s));
      if (!r.ok || !r.skuId) {
        out.errori.push(`${v.codice}: ${r.errore ?? "errore"}`);
        continue;
      }
      if (r.tagNonTrovati && r.tagNonTrovati.length) out.errori.push(`${r.codice}: tag non trovati in BATCH e non assegnati: ${r.tagNonTrovati.join(", ")}`);
      let caricate = 0;
      for (let i = 0; i < s.foto.length; i++) {
        setLavoro(`Foto ${i + 1}/${s.foto.length} di ${r.codice}…`);
        const bytes = await voceFoto.get(s.foto[i])!.leggi();
        const fd = new FormData();
        fd.set("skuId", String(r.skuId));
        fd.set("foto", new File([new Uint8Array(bytes)], s.foto[i], { type: mimeDaNome(s.foto[i]) }));
        const f = await caricaUnaFotoSku(fd);
        if (!f.ok) {
          out.errori.push(`${r.codice}, foto ${i + 1}: ${f.errore ?? "caricamento non riuscito"} (le foto successive non sono state caricate: riprova dalla scheda sku)`);
          break;
        }
        caricate++;
      }
      out.creati.push({ vecchio: r.codiceOriginale ?? v.codice, nuovo: r.codice ?? v.codice, foto: caricate });
    }
    setEsito(out);
    setSchede(null);
    setLavoro(null);
  }

  const occupato = lavoro !== null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Carica lo zip</CardTitle>
          <CardDescription>Lo zip esce da BATCH Web (AirDrop) e contiene schede.json e la cartella foto.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".zip"
            disabled={occupato}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <Button onClick={analizza} disabled={!file || occupato}>
            {lavoro && !schede ? <Loader2 className="animate-spin" /> : <UploadCloud />} Analizza
          </Button>
        </CardContent>
      </Card>

      {errore && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <p>{errore}</p>
          </CardContent>
        </Card>
      )}

      {schede && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{schede.length} articoli nello zip</CardTitle>
              <CardDescription>
                Deposito, proprietario e tipo scritti in BATCH Web vengono riconosciuti per nome. Se mancano, deposito e tipo prendono i valori predefiniti qui sotto; il proprietario segue FP (azienda) / CV (soci).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Deposito principale (se manca o non è riconosciuto)
                <select className="h-9 rounded-md border bg-background px-2" value={deposito ?? ""} onChange={(e) => setDeposito(Number(e.target.value))}>
                  {depositi.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Tipo oggetto predefinito
                <select className="h-9 rounded-md border bg-background px-2" value={tipo ?? ""} onChange={(e) => setTipo(Number(e.target.value))}>
                  {tipi.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </label>
            </CardContent>
            {daRisolvere > 0 && (
              <CardContent className="grid gap-2 border-t bg-warning/5 py-4 text-sm">
                <p className="font-medium">Da risolvere ({daRisolvere}): nomi scritti in BATCH Web che BATCH non conosce. La scelta vale per tutti gli articoli con quel nome.</p>
                {gDep.map((g) => (
                  <label key={"d" + g.k} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-xs text-muted-foreground">Deposito</span>
                    <b>«{g.testo}»</b> <span className="text-xs text-muted-foreground">({g.n} {g.n === 1 ? "articolo" : "articoli"}) →</span>
                    <select className="h-8 rounded-md border bg-background px-2" value={depositoTesto[g.k] ?? deposito ?? ""} onChange={(e) => setDepositoTesto({ ...depositoTesto, [g.k]: Number(e.target.value) })}>
                      {depositi.map((d) => (<option key={d.id} value={d.id}>{d.nome}</option>))}
                    </select>
                  </label>
                ))}
                {gProp.map((g) => (
                  <label key={"p" + g.k} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-xs text-muted-foreground">Proprietario</span>
                    <b>«{g.testo}»</b> <span className="text-xs text-muted-foreground">({g.n} {g.n === 1 ? "articolo" : "articoli"}) →</span>
                    <select
                      className="h-8 rounded-md border bg-background px-2"
                      value={proprietarioTesto[g.k] ?? ""}
                      onChange={(e) => {
                        const c = { ...proprietarioTesto };
                        if (e.target.value) c[g.k] = Number(e.target.value); else delete c[g.k];
                        setProprietarioTesto(c);
                      }}
                    >
                      <option value="">in base a FP / CV</option>
                      {proprietari.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
                    </select>
                  </label>
                ))}
                {gTipo.map((g) => (
                  <label key={"t" + g.k} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-xs text-muted-foreground">Tipo</span>
                    <b>«{g.testo}»</b> <span className="text-xs text-muted-foreground">({g.n} {g.n === 1 ? "articolo" : "articoli"}) →</span>
                    <select className="h-8 rounded-md border bg-background px-2" value={tipoTesto[g.k] ?? tipo ?? ""} onChange={(e) => setTipoTesto({ ...tipoTesto, [g.k]: Number(e.target.value) })}>
                      {tipi.map((x) => (<option key={x.id} value={x.id}>{x.nome}</option>))}
                    </select>
                  </label>
                ))}
              </CardContent>
            )}
            <CardContent className="divide-y p-0">
              {schede.map((s) => {
                const v = voci.find((x) => x.codice === s.codice)!;
                const m = mancaNellaScheda(s);
                const salto = v.stato === "gia_presente";
                return (
                  <div key={s.codice} className="grid gap-x-3 gap-y-0.5 px-6 py-2 text-sm sm:grid-cols-[7rem_1fr_auto]">
                    <span className="font-mono text-xs">{s.codice} <span className="text-muted-foreground">{s.proprieta}</span></span>
                    <span className="min-w-0 truncate">{s.artista} — {s.opera} <span className="text-xs text-muted-foreground">· {s.foto.length} foto</span></span>
                    <span className={m.length ? "text-xs text-warning" : "text-xs text-success"}>{m.length ? `Mancano: ${m.join(", ")}` : "Completa"}</span>
                    <span />
                    <span className="text-xs text-muted-foreground sm:col-span-2">
                      {salto
                        ? "già in BATCH: salto"
                        : `Deposito ${nomeDi(depositi, depositoDi(s))} · Proprietario ${nomeDi(proprietari, proprietarioDi(s))} · Tipo ${nomeDi(tipi, tipoDi(s))}${s.quantita > 1 ? ` · Qtà ${s.quantita}` : ""}`}
                    </span>
                    {v.stato === "conflitto" && (
                      <span className="flex flex-wrap items-center gap-1 sm:col-span-3">
                        <span className="text-xs">In BATCH c&apos;è: <b>{v.esistente?.artista}</b> — {v.esistente?.opera}</span>
                        {(["rinomina", "ignora"] as const).map((o) => (
                          <Button key={o} size="sm" type="button" variant={scelte[s.codice] === o ? "default" : "outline"} onClick={() => setScelte({ ...scelte, [s.codice]: o })}>
                            {o === "rinomina" ? "Rinomina" : "Ignora"}
                          </Button>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="sticky bottom-4 z-20 shadow-lg">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <p className="text-sm text-muted-foreground">
                {lavoro ?? (nonDecisi > 0 ? `Mancano ${nonDecisi} scelte sui codici in conflitto.` : `Verranno creati ${daCreare.length} sku con le loro foto.`)}
              </p>
              <Button size="lg" onClick={conferma} disabled={occupato || nonDecisi > 0 || daCreare.length === 0 || deposito === null || tipo === null}>
                {occupato ? <Loader2 className="animate-spin" /> : null} Conferma e importa
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {esito && (
        <Card className={esito.errori.length ? "border-warning/40" : "border-success/40"}>
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5 text-success" /> Creati {esito.creati.length} sku
              {esito.saltati.length ? `, saltati ${esito.saltati.length}` : ""}.
            </p>
            {esito.creati.some((c) => c.vecchio !== c.nuovo) && (
              <div>
                <p className="font-medium">Codici cambiati (correggili nel file Excel):</p>
                <ul className="list-disc pl-5">
                  {esito.creati.filter((c) => c.vecchio !== c.nuovo).map((c) => (
                    <li key={c.nuovo}><span className="font-mono text-xs">{c.vecchio}</span> → <span className="font-mono text-xs">{c.nuovo}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {esito.errori.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-6 py-2">
                {esito.errori.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
