"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CellTesto } from "@/components/magazzino/editable-cell";
import {
  confermaFileAction,
  generaFilePortaleAction,
  ripristinaCellePortaleAction,
  ritiraDaPortaliAction,
  salvaCellaPortaleAction,
  scartaFileAction,
  segnaFattoAction,
  sospendiAction,
  type FileGenerato,
} from "@/app/pubblicazione/esposizione-actions";
import { useSelezioneMultipla } from "@/lib/selezione-multipla";
import {
  ETICHETTA_MOTIVO_MODIFICA,
  ETICHETTA_STATO,
  riassuntoModifiche,
  type RigaPortale,
  type StatoRiga,
} from "@/lib/tabella-portale";
import { prezziDiversi } from "@/lib/esposizione";

type Filtro = "tutti" | "da-inviare" | "nuovo" | "esaurito" | "archiviare" | "personalizzati";

const euro = (n: number | null) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

const SFONDO: Record<StatoRiga, string> = {
  online: "",
  nuovo: "bg-emerald-500/10",
  modificato: "bg-amber-400/15",
  esaurito: "bg-orange-400/15",
  archiviare: "bg-red-500/10",
};
const CHIP: Record<StatoRiga, string> = {
  online: "text-muted-foreground",
  nuovo: "bg-emerald-500/20 text-emerald-900 dark:text-emerald-200",
  modificato: "bg-amber-400/30 text-amber-950 dark:text-amber-100",
  esaurito: "bg-orange-400/30 text-orange-950 dark:text-orange-100",
  archiviare: "bg-red-500/20 text-red-950 dark:text-red-100",
};
const ORDINE: Record<StatoRiga, number> = { nuovo: 0, modificato: 1, esaurito: 2, archiviare: 3, online: 4 };
const LIMITE_RIGHE = 300;

function scarica(nome: string, testo: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function CellaDescrizione({ r, salva }: { r: RigaPortale; salva: (v: string | null) => void }) {
  const [aperta, setAperta] = useState(false);
  const [bozza, setBozza] = useState(r.descrizioneOverride ?? "");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBozza(r.descrizioneOverride ?? "");
          setAperta(true);
        }}
        className="rounded px-1.5 py-1 text-left text-xs hover:bg-muted/60"
      >
        {r.descrizioneOverride ? <span className="font-medium">Personalizzata</span> : <span className="text-muted-foreground">Automatica</span>}
      </button>
      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Descrizione di {r.skuCode} su questo portale</DialogTitle>
            <DialogDescription>
              Sostituisce il blocco Artista / Opera / Epoca / Dimensioni / Condizioni. Garanzia e Spedizione restano. Una riga per capoverso. Vuota = descrizione automatica.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={bozza} onChange={(e) => setBozza(e.target.value)} rows={10} />
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => { salva(null); setAperta(false); }}>
              Torna all&apos;automatica
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setAperta(false)}>Annulla</Button>
              <Button type="button" onClick={() => { salva(bozza); setAperta(false); }}>Salva</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Istruzioni ricavate dal nome del file (il nome contiene numero, tipo e spunte).
function istruzioneDaNome(nome: string, portale: string): string {
  if (portale === "Shopify") {
    if (nome.includes("[SOVRASCRIVI+PUBBLICA]")) return 'Shopify: Importa, spunta "Sovrascrivi" e "Pubblica i nuovi prodotti".';
    return 'Shopify: Importa, spunta solo "Sovrascrivi" (togli "Pubblica i nuovi prodotti").';
  }
  return nome.includes("DA-PROVARE") ? "eBay: File Exchange. DA PROVARE su 1–2 annunci." : "eBay: File Exchange.";
}

export function TabellaPortale({
  canaleId,
  nomePortale,
  righe,
  file,
}: {
  canaleId: number;
  nomePortale: string;
  righe: RigaPortale[];
  file: { nomi: string[]; creatoAtTesto: string; righe: number } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutti");
  const [mostraTutte, setMostraTutte] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string; dettaglio?: string[] } | null>(null);
  const conFile = nomePortale === "Shopify" || nomePortale === "eBay";
  const soloSegna = !conFile;
  const [scaricati, setScaricati] = useState<FileGenerato[]>([]);

  const riassunto = useMemo(() => riassuntoModifiche(righe), [righe]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe
      .filter((r) => {
        if (q && !`${r.skuCode} ${r.artista} ${r.opera}`.toLowerCase().includes(q)) return false;
        if (filtro === "da-inviare") return r.stato !== "online";
        if (filtro === "personalizzati") return r.pezziOverride !== null || r.condizioneOverride !== null || r.descrizioneOverride !== null;
        if (filtro === "nuovo" || filtro === "esaurito" || filtro === "archiviare") return r.stato === filtro;
        return true;
      })
      .sort((a, b) => ORDINE[a.stato] - ORDINE[b.stato] || a.skuCode.localeCompare(b.skuCode));
  }, [righe, cerca, filtro]);

  const mostrate = mostraTutte ? filtrate : filtrate.slice(0, LIMITE_RIGHE);
  const { selezionati, setSelezionati, gestisciSeleziona, segnalaShift, selezionaTutti } =
    useSelezioneMultipla<number>(mostrate.map((r) => r.skuId));
  const scelti = mostrate.filter((r) => selezionati.has(r.skuId));
  const tutti = mostrate.length > 0 && scelti.length === mostrate.length;
  const sceltiDaInviare = scelti.filter((r) => r.stato !== "online").length;
  const nFile = scelti.length > 0 ? sceltiDaInviare : riassunto.totale;

  function esegui(fn: () => Promise<{ ok: boolean; errore?: string; messaggio?: string }>, dopo?: () => void) {
    start(async () => {
      const r = await fn();
      setEsito({ ok: r.ok, testo: r.ok ? (r.messaggio ?? "Fatto.") : (r.errore ?? "Errore.") });
      if (r.ok) dopo?.();
      router.refresh();
    });
  }

  function scaricaFile() {
    start(async () => {
      const r = await generaFilePortaleAction(canaleId, scelti.map((x) => x.skuId));
      if (!r.ok || !r.files || r.files.length === 0) {
        setEsito({
          ok: false,
          testo: r.errore ?? "Errore.",
          dettaglio: r.scartati?.map((s) => `${s.skuCode}: ${s.motivo}`),
        });
        return;
      }
      setScaricati(r.files);
      // Un file alla volta, con una pausa: il browser blocca i download in raffica.
      for (const f of r.files) {
        scarica(f.nome, f.csv);
        await new Promise((ok) => setTimeout(ok, 400));
      }
      setEsito({
        ok: true,
        testo: `${r.files.length} ${r.files.length === 1 ? "file scaricato" : "file scaricati"} (${r.inclusi} sku). Caricali su ${nomePortale} nell'ordine indicato qui sotto, poi premi "Ho caricato il file".`,
        dettaglio: r.scartati?.length ? r.scartati.map((s) => `Esclusi: ${s.skuCode} — ${s.motivo}`) : undefined,
      });
      setSelezionati(new Set());
      router.refresh();
    });
  }

  function salvaCella(skuId: number, campo: "quantita" | "condizione" | "descrizione", valore: string | null) {
    start(async () => {
      const r = await salvaCellaPortaleAction(skuId, canaleId, campo, valore);
      if (!r.ok) setEsito({ ok: false, testo: r.errore ?? "Errore." });
      router.refresh();
    });
  }

  return (
    <section className="mb-6" aria-label={`Tabella ${nomePortale}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3">
        <div>
          <div className="text-base font-semibold">
            {riassunto.totale === 0 ? "Nessuna modifica in attesa" : `${riassunto.totale} modifiche in attesa`}
          </div>
          <div className="text-xs text-muted-foreground">
            {riassunto.nuovi} nuovi · {riassunto.modificati} da modificare · {riassunto.esauriti} esauriti · {riassunto.archiviati} da archiviare
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conFile && (
            <>
              <Button type="button" disabled={pending || nFile === 0} onClick={scaricaFile}>
                {pending ? "…" : `Scarica file ${nomePortale} (${nFile})`}
              </Button>
              <Button type="button" variant="secondary" disabled={pending || !file} onClick={() => esegui(() => confermaFileAction(canaleId), () => setScaricati([]))}>
                Ho caricato il file
              </Button>
            </>
          )}
          <Button
            type="button"
            variant={soloSegna ? "default" : "ghost"}
            disabled={pending || nFile === 0}
            onClick={() => esegui(() => segnaFattoAction(canaleId, scelti.map((x) => x.skuId)), () => setSelezionati(new Set()))}
          >
            {pending ? "…" : `Segna come fatto (${nFile})`}
          </Button>
        </div>
      </div>
      {conFile && (scaricati.length > 0 || file) && (
        <div className="mb-3 rounded-md border px-3 py-2 text-xs">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="font-medium">
              File da caricare su {nomePortale}
              {file ? ` (generati il ${file.creatoAtTesto}, ${file.righe} sku)` : ""}
            </span>
            {file && (
              <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => esegui(() => scartaFileAction(canaleId), () => setScaricati([]))}>
                Scarta
              </button>
            )}
          </div>
          <ol className="flex flex-col gap-1">
            {(scaricati.length > 0 ? scaricati.map((f) => ({ nome: f.nome, nSku: f.nSku, csv: f.csv, istruzione: f.istruzione })) : (file?.nomi ?? []).map((n) => ({ nome: n, nSku: null as number | null, csv: null as string | null, istruzione: istruzioneDaNome(n, nomePortale) }))).map((f) => (
              <li key={f.nome} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono">{f.nome}</span>
                {f.nSku !== null && <span className="text-muted-foreground">({f.nSku} sku)</span>}
                <span className="text-muted-foreground">— {f.istruzione}</span>
                {f.csv && (
                  <button type="button" className="underline-offset-4 hover:underline" onClick={() => scarica(f.nome, f.csv!)}>
                    scarica di nuovo
                  </button>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-1 text-muted-foreground">Carica nell&apos;ordine del numero davanti al nome. Se non carichi tutti i file, non premere &quot;Ho caricato il file&quot;.</p>
        </div>
      )}
      {soloSegna && (
        <p className="mb-3 text-xs text-muted-foreground">
          Il file per {nomePortale} non è ancora pronto: fai le modifiche sul portale e poi premi &quot;Segna come fatto&quot;.
        </p>
      )}

      {esito && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${esito.ok ? "bg-emerald-500/10" : "bg-destructive/10 text-destructive"}`}>
          <div className="flex items-start justify-between gap-3">
            <span>{esito.testo}</span>
            <button type="button" className="shrink-0 text-xs opacity-70 hover:opacity-100" onClick={() => setEsito(null)}>Chiudi</button>
          </div>
          {esito.dettaglio && esito.dettaglio.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">{esito.dettaglio.slice(0, 8).map((d) => <li key={d}>{d}</li>)}</ul>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="mr-1.5 inline-block size-3 rounded-sm border align-[-2px]" />online</span>
        <span><span className="mr-1.5 inline-block size-3 rounded-sm bg-amber-400/40 align-[-2px]" />da modificare</span>
        <span><span className="mr-1.5 inline-block size-3 rounded-sm bg-emerald-500/30 align-[-2px]" />nuovo</span>
        <span><span className="mr-1.5 inline-block size-3 rounded-sm bg-orange-400/40 align-[-2px]" />esaurito</span>
        <span><span className="mr-1.5 inline-block size-3 rounded-sm bg-red-500/30 align-[-2px]" />da archiviare</span>
      </div>

      <div className="rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca sku, artista, opera…" className="h-8 w-64" aria-label="Cerca" />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Filtro">
            <option value="tutti">Tutti ({righe.length})</option>
            <option value="da-inviare">Da mandare al portale ({riassunto.totale})</option>
            <option value="nuovo">Nuovi ({riassunto.nuovi})</option>
            <option value="esaurito">Esauriti ({riassunto.esauriti})</option>
            <option value="archiviare">Da archiviare ({riassunto.archiviati})</option>
            <option value="personalizzati">Con celle modificate a mano</option>
          </select>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={tutti ? true : scelti.length > 0 ? "indeterminate" : false}
              onCheckedChange={(v) => selezionaTutti(v === true)}
              aria-label="Seleziona tutti quelli mostrati"
            />
            Tutti
          </label>
        </div>

        <div className="hidden items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid grid-cols-[1.25rem_6rem_minmax(6rem,1fr)_7.5rem_6.5rem_8rem_6rem_8.5rem]">
          <span />
          <span>Sku</span>
          <span className="min-w-0 flex-1">Opera</span>
          <span>Pezzi ora → dopo</span>
          <span className="text-right">Prezzo</span>
          <span>Condizione</span>
          <span>Descrizione</span>
          <span>Stato</span>
        </div>

        {mostrate.length === 0 ? (
          <p className="border-t px-4 py-4 text-sm text-muted-foreground">
            {righe.length === 0 ? `Su ${nomePortale} non c'è ancora niente. Quando ci sono sku disponibili compaiono qui come "Nuovo".` : "Nessuno sku con questi filtri."}
          </p>
        ) : (
          <ul>
            {mostrate.map((r) => {
              const cambiato = prezziDiversi(r.prezzoOnline, r.prezzoOggi);
              const etichettaStato = r.stato === "nuovo" && nomePortale === "Shopify" && r.idPortale ? "Da riattivare" : r.stato === "modificato" ? r.motivi.map((m) => ETICHETTA_MOTIVO_MODIFICA[m]).join(", ") : r.esauritoOnline ? "Esaurito (online)" : ETICHETTA_STATO[r.stato];
              return (
                <li key={r.skuId} className={`grid grid-cols-[1.25rem_6rem_minmax(6rem,1fr)_7.5rem_6.5rem_8rem_6rem_8.5rem] items-center gap-3 border-t px-4 py-2 text-sm ${SFONDO[r.stato]}`}>
                  <span onClickCapture={segnalaShift}>
                    <Checkbox checked={selezionati.has(r.skuId)} onCheckedChange={(v) => gestisciSeleziona(r.skuId, v === true)} aria-label={`Seleziona ${r.skuCode}`} />
                  </span>
                  <span className="font-mono text-xs">{r.skuCode}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.artista} — {r.opera}
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">{r.inVetrina ? r.pezziOra : "—"}</span>
                    <span className="text-muted-foreground">→</span>
                    {r.stato === "archiviare" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="w-12">
                        <CellTesto
                          valore={r.pezziOverride === null ? null : String(r.pezziOverride)}
                          placeholder={String(r.pezziDopo)}
                          numerico
                          onSalva={(v) => salvaCella(r.skuId, "quantita", v.trim() === "" ? null : v)}
                        />
                      </span>
                    )}
                  </span>
                  <span className="text-right text-xs">
                    {cambiato ? (
                      <>
                        <span className="text-muted-foreground line-through">{euro(r.prezzoOnline)}</span> {euro(r.prezzoOggi)}
                      </>
                    ) : r.mancaPrezzo ? (
                      <span className="text-destructive">manca prezzo</span>
                    ) : (
                      euro(r.prezzoOggi)
                    )}
                  </span>
                  <span className="text-xs">
                    <CellTesto
                      valore={r.condizioneOverride}
                      placeholder="Buone (come da foto)"
                      onSalva={(v) => salvaCella(r.skuId, "condizione", v.trim() === "" ? null : v)}
                    />
                  </span>
                  <span>
                    <CellaDescrizione r={r} salva={(v) => salvaCella(r.skuId, "descrizione", v)} />
                  </span>
                  <span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${CHIP[r.stato]}`}>{etichettaStato}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {filtrate.length > mostrate.length && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>Mostro {mostrate.length} di {filtrate.length}.</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMostraTutte(true)}>Mostra tutti</Button>
          </div>
        )}

        {scelti.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-sky-500/10 px-4 py-2">
            <span className="text-sm font-medium">{scelti.length} selezionati</span>
            <span className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => esegui(() => ritiraDaPortaliAction(scelti.map((x) => x.skuId), [canaleId], true), () => setSelezionati(new Set()))}
            >
              Escludi da questo portale
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => esegui(() => sospendiAction(scelti.map((x) => x.skuId), canaleId), () => setSelezionati(new Set()))}>
              Sospendi (pezzi a 0)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => esegui(() => ripristinaCellePortaleAction(scelti.map((x) => x.skuId), canaleId), () => setSelezionati(new Set()))}
            >
              Ripristina valori automatici
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
