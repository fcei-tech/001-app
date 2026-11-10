"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REGOLE_PREZZI_STANDARD, eRegoleStandard, type RegolePrezzi } from "@/lib/regole-prezzi-config";
import { ripristinaRegolePrezziAction, salvaRegolePrezziAction } from "./actions";

const testo = (n: number) => String(Math.round(n * 1e6) / 1e6);

function Campo({ nome, etichetta, valore, aiuto, standard, suffisso }: { nome: string; etichetta: string; valore: string; aiuto: string; standard: string; suffisso: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nome}>{etichetta}</Label>
      <div className="flex items-center gap-2">
        <Input id={nome} name={nome} inputMode="decimal" defaultValue={valore} className="w-28" />
        <span className="text-sm text-muted-foreground">{suffisso}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {aiuto} Standard: {standard}.
      </p>
    </div>
  );
}

export function RegolePrezziForm({ regole }: { regole: RegolePrezzi }) {
  const [pending, start] = useTransition();
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);
  const [versione, setVersione] = useState(0);
  const s = REGOLE_PREZZI_STANDARD;
  const f = regole.fasceQuantita;
  const fs = s.fasceQuantita;

  function salva(formData: FormData) {
    setMessaggio(null);
    start(async () => {
      try {
        await salvaRegolePrezziAction(formData);
        setMessaggio({ ok: true, testo: "Salvato. Vale dai prossimi file e dai calcoli a schermo." });
      } catch (e) {
        setMessaggio({ ok: false, testo: e instanceof Error ? e.message : "Errore sconosciuto" });
      }
    });
  }

  function ripristina() {
    setMessaggio(null);
    start(async () => {
      try {
        await ripristinaRegolePrezziAction();
        setVersione((v) => v + 1);
        setMessaggio({ ok: true, testo: "Valori standard ripristinati." });
      } catch (e) {
        setMessaggio({ ok: false, testo: e instanceof Error ? e.message : "Errore sconosciuto" });
      }
    });
  }

  // key = versione: dopo "Ripristina" il form si ricrea con i valori standard.
  const base = versione > 0 ? s : regole;
  const fb = base.fasceQuantita;
  return (
    <form action={salva} key={versione} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          nome="scontoShopifyPct"
          etichetta="Sconto Shopify"
          valore={testo(Math.round((1 - base.scontoShopify) * 1e4) / 100)}
          suffisso="% sotto il prezzo eBay"
          aiuto="Prezzo Shopify = prezzo eBay meno questo sconto, arrotondato all'euro per eccesso (solo se lo sku non ha un suo Prezzo Shopify)."
          standard={`${testo(Math.round((1 - s.scontoShopify) * 1e4) / 100)}%`}
        />
        <Campo
          nome="offertaMinimaEbay"
          etichetta="Offerta minima eBay"
          valore={testo(base.offertaMinimaEbayPercentuale)}
          suffisso="% del prezzo"
          aiuto="Sotto questa percentuale eBay rifiuta da solo le offerte."
          standard={`${s.offertaMinimaEbayPercentuale}%`}
        />
        <Campo
          nome="sogliaCatawiki"
          etichetta="Soglia minima Catawiki"
          valore={testo(base.sogliaMinimaCatawiki)}
          suffisso="€"
          aiuto="Sotto questa stima il lotto Catawiki viene scartato (non vale per Bidspirit)."
          standard={`${s.sogliaMinimaCatawiki} €`}
        />
        <Campo
          nome="riservaCatawikiPct"
          etichetta="Riserva Catawiki di ripiego"
          valore={testo(Math.round(base.moltiplicatoreRiservaCatawiki * 1e4) / 100)}
          suffisso="% della stima"
          aiuto="Usata solo se mancano la riserva sul lotto e quella sullo sku (anche per Bidspirit)."
          standard={`${Math.round(s.moltiplicatoreRiservaCatawiki * 100)}%`}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Pezzi da caricare sui portali fissi (Shopify, eBay)</p>
        <p className="text-xs text-muted-foreground">
          Dal disponibile libero (totale a magazzino meno quanto è impegnato nelle aste). Subito resta sempre 1.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Fino a</span>
          <Input name="fino1" inputMode="numeric" defaultValue={String(fb[0].fino)} className="w-20" />
          <span>disponibili → carica</span>
          <Input name="pezzi1" inputMode="numeric" defaultValue={String(fb[0].pezzi)} className="w-16" />
          <span>·</span>
          <span>fino a</span>
          <Input name="fino2" inputMode="numeric" defaultValue={String(fb[1].fino)} className="w-20" />
          <span>→</span>
          <Input name="pezzi2" inputMode="numeric" defaultValue={String(fb[1].pezzi)} className="w-16" />
          <span>·</span>
          <span>oltre → carica</span>
          <Input name="pezzi3" inputMode="numeric" defaultValue={String(fb[2].pezzi)} className="w-16" />
        </div>
        <p className="text-xs text-muted-foreground">
          Standard: fino a {fs[0].fino} → {fs[0].pezzi} · fino a {fs[1].fino} → {fs[1].pezzi} · oltre → {fs[2].pezzi}. In uso adesso: fino a {f[0].fino} → {f[0].pezzi} · fino a {f[1].fino} → {f[1].pezzi} · oltre → {f[2].pezzi}.
        </p>
      </div>

      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t bg-card/95 px-6 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvo…" : "Salva regole"}
        </Button>
        <Button type="button" variant="outline" onClick={ripristina} disabled={pending || (eRegoleStandard(regole) && versione === 0)}>
          Ripristina i valori standard
        </Button>
        {messaggio && <span className={`text-sm ${messaggio.ok ? "text-success" : "text-destructive"}`}>{messaggio.testo}</span>}
      </div>
    </form>
  );
}
