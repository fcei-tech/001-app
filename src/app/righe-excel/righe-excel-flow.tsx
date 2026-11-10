"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { scaricaFileRigheAction, segnaComeRiportatiAction } from "./actions";

type Voce = { id: number; skuCode: string; artista: string; opera: string; fogli: string };

export function RigheExcelFlow({ voci, senzaFoglio }: { voci: Voce[]; senzaFoglio: { id: number; skuCode: string; artista: string; opera: string }[] }) {
  const [scaricati, setScaricati] = React.useState<number[] | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  function scarica() {
    setErrore(null);
    setInfo(null);
    startTransition(async () => {
      const r = await scaricaFileRigheAction();
      if (!r.ok) {
        setErrore(r.errore);
        return;
      }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nomeFile;
      a.click();
      URL.revokeObjectURL(url);
      setScaricati(r.skuIds);
      setInfo(`File scaricato (${r.righe} righe). Quando le hai copiate nei tuoi fogli, premi "Segna come riportati".`);
    });
  }

  function segna() {
    if (!scaricati) return;
    startTransition(async () => {
      const r = await segnaComeRiportatiAction(scaricati);
      if (!r.ok) {
        setErrore(r.errore ?? "Errore");
        return;
      }
      setScaricati(null);
      setInfo(`${r.segnati} sku segnati come riportati.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{voci.length} sku da riportare</CardTitle>
          <CardDescription>
            Il file ha due fogli (STOCK FP e STOCK FOGLI CV) con le colonne nello stesso ordine dei tuoi.
            Le colonne con formula (valori stock, stime, # CATA EBAY DISP, RISERVA_CATAWIKI sì/no) restano vuote.
            Gli sku già riportati non compaiono mai più.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={scarica} disabled={pending || voci.length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Download />} Scarica file righe
          </Button>
          <Button variant="outline" onClick={segna} disabled={pending || !scaricati}>
            <CheckCheck /> Segna come riportati{scaricati ? ` (${scaricati.length})` : ""}
          </Button>
          {errore && <p className="text-sm text-destructive">{errore}</p>}
          {info && <p className="text-sm text-success">{info}</p>}
        </CardContent>
      </Card>

      {voci.length > 0 && (
        <Card>
          <CardContent className="max-h-96 divide-y overflow-y-auto p-0">
            {voci.map((v) => (
              <div key={v.id} className="flex gap-3 px-6 py-2 text-sm">
                <span className="font-mono text-xs">{v.skuCode}</span>
                <span className="min-w-0 flex-1 truncate">{v.artista} — {v.opera}</span>
                <span className="text-xs text-muted-foreground">{v.fogli}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {senzaFoglio.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Senza foglio ({senzaFoglio.length})</CardTitle>
            <CardDescription>Nessun pezzo in azienda (FP) né soci (CV): non entrano nel file e restano da riportare.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {senzaFoglio.map((s) => (
              <p key={s.id}><span className="font-mono text-xs">{s.skuCode}</span> — {s.artista} / {s.opera}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
