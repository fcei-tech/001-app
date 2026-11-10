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

function mimeDaNome(n: string) {
  const e = n.split(".").pop()?.toLowerCase();
  return e === "png" ? "image/png" : e === "webp" ? "image/webp" : e === "heic" ? "image/heic" : "image/jpeg";
}

export function ImportaSchedeFlow({
  depositi,
  tipi,
  depositoIniziale,
  tipoIniziale,
}: {
  depositi: { id: number; nome: string }[];
  tipi: { id: number; nome: string }[];
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
      for (const s of letto.schede) for (const f of s.foto) if (!mappa.has(f)) throw new Error(`Nello zip manca la foto ${f} della scheda ${s.codice}.`);
      const r = await anteprimaSchede(JSON.stringify(letto));
      if (!r.ok) throw new Error(r.errore);
      setSchede(letto.schede);
      setVoci(r.voci);
      setVoceFoto(mappa);
      setScelte({});
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore nella lettura.");
    } finally {
      setLavoro(null);
    }
  }

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
      const r = await creaSkuDaScheda(json, v.codice, deposito, tipo, rinomina);
      if (!r.ok || !r.skuId) {
        out.errori.push(`${v.codice}: ${r.errore ?? "errore"}`);
        continue;
      }
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
          <CardDescription>Lo zip arriva dal telefono (AirDrop) e contiene schede.json e la cartella foto.</CardDescription>
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
              <CardTitle className="text-base">{schede.length} schede nello zip</CardTitle>
              <CardDescription>
                FP e CV decidono il proprietario (primo attivo di tipo azienda / soci). Deposito e tipo valgono per tutte; quantità 1 salvo diversa indicazione.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Deposito
                <select className="h-9 rounded-md border bg-background px-2" value={deposito ?? ""} onChange={(e) => setDeposito(Number(e.target.value))}>
                  {depositi.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Tipo oggetto
                <select className="h-9 rounded-md border bg-background px-2" value={tipo ?? ""} onChange={(e) => setTipo(Number(e.target.value))}>
                  {tipi.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </label>
            </CardContent>
            <CardContent className="divide-y p-0">
              {schede.map((s) => {
                const v = voci.find((x) => x.codice === s.codice)!;
                const m = mancaNellaScheda(s);
                return (
                  <div key={s.codice} className="flex flex-wrap items-center gap-3 px-6 py-2 text-sm">
                    <span className="font-mono text-xs">{s.codice}</span>
                    <span className="text-xs text-muted-foreground">{s.proprieta}</span>
                    <span className="min-w-0 flex-1 truncate">{s.artista} — {s.opera} · {s.foto.length} foto</span>
                    <span className={m.length ? "text-xs text-warning" : "text-xs text-success"}>{m.length ? `Mancano: ${m.join(", ")}` : "Completa"}</span>
                    {v.stato === "gia_presente" && <span className="text-xs text-muted-foreground">già in BATCH: salto</span>}
                    {v.stato === "conflitto" && (
                      <span className="flex items-center gap-1">
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
