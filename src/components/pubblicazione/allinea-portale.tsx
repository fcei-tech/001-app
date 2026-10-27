"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { analizzaAllineamentoAction, applicaAllineamentoAction } from "@/app/pubblicazione/esposizione-actions";
import { leggiExportShopify, leggiReportEbay, type VoceAllineamento } from "@/lib/allinea-portale";
import type { EsitoAnalisi } from "@/db/portale-queries";

const ETICHETTA_TIPO = {
  diverso: "Diversi",
  "solo-portale": "Sul portale ma non nel software",
  "solo-software": "Nel software ma non sul portale",
  "non-nel-software": "Sul portale, sku sconosciuto al software",
} as const;

// "Allinea con il portale": si carica il file che il portale stesso esporta; il
// software mostra le differenze e, se confermi, prende per buono il portale
// (stato, pezzi, prezzo e identificativo, che serve a modificare i prodotti).
export function AllineaPortale({ canaleId, nomePortale }: { canaleId: number; nomePortale: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const [voci, setVoci] = useState<VoceAllineamento[] | null>(null);
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [analisi, setAnalisi] = useState<EsitoAnalisi | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const eShopify = nomePortale === "Shopify";

  async function onFile(f: File | undefined) {
    setEsito(null);
    setAnalisi(null);
    setVoci(null);
    if (!f) return;
    const testo = await f.text();
    const lettura = eShopify ? leggiExportShopify(testo) : leggiReportEbay(testo);
    if (lettura.errore) {
      setEsito({ ok: false, testo: lettura.errore });
      return;
    }
    setAvvisi(lettura.avvisi);
    setVoci(lettura.voci);
    start(async () => {
      const r = await analizzaAllineamentoAction(canaleId, lettura.voci);
      if (!r.ok || !r.analisi) setEsito({ ok: false, testo: r.errore ?? "Errore." });
      else setAnalisi(r.analisi);
    });
  }

  function allinea() {
    if (!voci) return;
    start(async () => {
      const r = await applicaAllineamentoAction(canaleId, voci);
      setEsito({ ok: r.ok, testo: r.ok ? (r.messaggio ?? "Fatto.") : (r.errore ?? "Errore.") });
      if (r.ok) {
        setAnalisi(null);
        setVoci(null);
        if (input.current) input.current.value = "";
      }
      router.refresh();
    });
  }

  const c = analisi?.contatori;
  return (
    <details className="mb-6 rounded-xl border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Allinea con il portale</summary>
      <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm">
        <p className="text-xs text-muted-foreground">
          {eShopify
            ? "Su Shopify: Prodotti → Esporta → Tutti i prodotti → CSV per Excel. Poi scegli qui il file."
            : "Su eBay: Report → Tutti gli annunci attivi → scarica il file (CSV). Poi scegli qui il file. Si leggono solo gli annunci del sito IT."}{" "}
          Il software confronta, ti mostra le differenze e, se confermi, prende per buono quello che c&apos;è sul portale.
          {eShopify
            ? " Serve anche per memorizzare l'indirizzo (handle) di ogni prodotto: senza, il file non può modificarli."
            : " Serve anche per memorizzare il numero di ogni annuncio: senza, il file non può modificarli."}
        </p>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="text-xs"
          aria-label="File del portale"
        />
        {pending && !analisi && <p className="text-xs text-muted-foreground">Leggo il file…</p>}
        {avvisi.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">{avvisi.slice(0, 5).map((a) => <li key={a}>{a}</li>)}</ul>
        )}
        {analisi && c && (
          <>
            <p>
              {voci?.length} sku letti dal portale: <strong>{c.uguale}</strong> uguali, <strong>{c.diverso}</strong> diversi,{" "}
              <strong>{c["solo-portale"]}</strong> sul portale ma non nel software, <strong>{c["solo-software"]}</strong> nel software ma non sul portale,{" "}
              <strong>{c["non-nel-software"]}</strong> sconosciuti al software.
            </p>
            {analisi.diffs.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-md border text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/60 text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">Sku</th>
                      <th className="px-2 py-1">Software</th>
                      <th className="px-2 py-1">Portale</th>
                      <th className="px-2 py-1">Differenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisi.diffs.slice(0, 200).map((d) => (
                      <tr key={`${d.skuCode}-${d.tipo}`} className="border-t">
                        <td className="px-2 py-1 font-mono">{d.skuCode}</td>
                        <td className="px-2 py-1">{d.software}</td>
                        <td className="px-2 py-1">{d.portale}</td>
                        <td className="px-2 py-1">{d.cosa.length > 0 ? d.cosa.join(", ") : ETICHETTA_TIPO[d.tipo as keyof typeof ETICHETTA_TIPO]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analisi.diffs.length > 200 && <p className="px-2 py-1 text-muted-foreground">… e altri {analisi.diffs.length - 200}.</p>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" disabled={pending} onClick={allinea}>
                {pending ? "…" : "Allinea ora"}
              </Button>
              <span className="text-xs text-muted-foreground">Il software prende per buono il portale. Fai prima un backup se non l&apos;hai fatto oggi.</span>
            </div>
          </>
        )}
        {esito && <p className={esito.ok ? "" : "text-destructive"}>{esito.testo}</p>}
      </div>
    </details>
  );
}
