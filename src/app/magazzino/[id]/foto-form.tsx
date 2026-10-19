"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { caricaUnaFotoSku } from "@/app/magazzino/actions";

type FotoScelta = { id: number; file: File; anteprima: string };

// Caricamento foto multiplo (2026-10-19). Scegli quante foto vuoi, con i nomi
// che hanno: compaiono in anteprima gia' ordinate per nome (numeri letti come
// numeri: IMG_2 prima di IMG_10) e l'ordine si corregge con le frecce. La
// prima e' la copertina (se lo sku non ha ancora foto). Al click le foto
// salgono UNA ALLA VOLTA nell'ordine mostrato e il software le rinomina
// SKU_a, SKU_b... Se una fallisce ci si ferma: restano salvate solo quelle
// prima, mai con buchi.
export function FotoForm({ skuId, nFotoEsistenti }: { skuId: number; nFotoEsistenti: number }) {
  const router = useRouter();
  const [scelte, setScelte] = React.useState<FotoScelta[]>([]);
  const [stato, setStato] = React.useState<{ fatte: number; totale: number } | null>(null);
  const [messaggio, setMessaggio] = React.useState<{ ok: boolean; testo: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const prossimoId = React.useRef(1);
  const scelteRef = React.useRef<FotoScelta[]>([]);

  React.useEffect(() => {
    scelteRef.current = scelte;
  }, [scelte]);

  React.useEffect(() => {
    const ref = scelteRef;
    return () => ref.current.forEach((f) => URL.revokeObjectURL(f.anteprima));
  }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nuovi = Array.from(e.target.files ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      .map((file) => ({ id: prossimoId.current++, file, anteprima: URL.createObjectURL(file) }));
    setScelte((prima) => [...prima, ...nuovi]);
    setMessaggio(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function sposta(indice: number, delta: number) {
    setScelte((prima) => {
      const j = indice + delta;
      if (j < 0 || j >= prima.length) return prima;
      const copia = [...prima];
      [copia[indice], copia[j]] = [copia[j], copia[indice]];
      return copia;
    });
  }

  function rimuovi(id: number) {
    setScelte((prima) => {
      const f = prima.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.anteprima);
      return prima.filter((x) => x.id !== id);
    });
  }

  async function carica() {
    const lista = scelte;
    if (lista.length === 0 || stato) return;
    setMessaggio(null);
    setStato({ fatte: 0, totale: lista.length });
    let fatte = 0;
    let errore: string | null = null;
    for (const f of lista) {
      const fd = new FormData();
      fd.set("skuId", String(skuId));
      fd.set("foto", f.file);
      const esito = await caricaUnaFotoSku(fd);
      if (!esito.ok) {
        errore = esito.errore ?? "Caricamento non riuscito.";
        break;
      }
      fatte += 1;
      setStato({ fatte, totale: lista.length });
    }
    // Quelle caricate escono dalla lista; restano le non caricate per riprovare.
    lista.slice(0, fatte).forEach((f) => URL.revokeObjectURL(f.anteprima));
    setScelte(lista.slice(fatte));
    setStato(null);
    setMessaggio(
      errore
        ? { ok: false, testo: `Caricate ${fatte} su ${lista.length}. Si è fermato alla foto ${fatte + 1}: ${errore} Le altre sono ancora qui sotto, riprova.` }
        : { ok: true, testo: `${fatte} foto caricate nell'ordine mostrato.` }
    );
    router.refresh();
  }

  const occupato = stato !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="foto" className="text-sm font-medium">
          Aggiungi foto
        </label>
        <p className="text-xs text-muted-foreground">
          Scegli anche molte foto insieme, con qualsiasi nome. Le rinomino io (SKU_a, SKU_b, …) nell&apos;ordine che vedi qui sotto.
          {nFotoEsistenti > 0
            ? ` Lo sku ha gia' ${nFotoEsistenti} foto: le nuove vanno in fondo (per cambiare la copertina usa le frecce sulla galleria).`
            : " La prima sara' la copertina."}
        </p>
        <input
          ref={inputRef}
          id="foto"
          type="file"
          accept="image/*"
          multiple
          disabled={occupato}
          onChange={onFileChange}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
        />
      </div>

      {scelte.length > 0 && (
        <ol className="flex flex-wrap gap-3">
          {scelte.map((f, i) => (
            <li key={f.id} className="relative flex w-24 flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.anteprima} alt="" className="size-24 rounded-md border object-cover" />
              <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                {nFotoEsistenti === 0 && i === 0 ? "copertina" : nFotoEsistenti + i + 1}
              </span>
              <button
                type="button"
                disabled={occupato}
                onClick={() => rimuovi(f.id)}
                className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground disabled:opacity-40"
                title="Togli dalla lista"
              >
                <X className="size-3" />
              </button>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground" title={f.file.name}>
                {f.file.name}
              </span>
              <div className="flex gap-1">
                <Button type="button" variant="secondary" size="icon" className="size-5" disabled={occupato || i === 0} onClick={() => sposta(i, -1)} title="Prima">
                  <ChevronLeft className="size-3" />
                </Button>
                <Button type="button" variant="secondary" size="icon" className="size-5" disabled={occupato || i === scelte.length - 1} onClick={() => sposta(i, 1)} title="Dopo">
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {messaggio && (
        <p className={`text-sm ${messaggio.ok ? "text-success" : "text-destructive"}`}>{messaggio.testo}</p>
      )}

      <div>
        <Button type="button" size="sm" disabled={scelte.length === 0 || occupato} onClick={carica}>
          <Upload />
          {stato ? `Carico ${stato.fatte + 1} di ${stato.totale}…` : scelte.length > 0 ? `Carica ${scelte.length} foto` : "Carica foto"}
        </Button>
        {stato && (
          <p className="mt-2 text-xs text-muted-foreground">
            Una foto alla volta (upload + elaborazione Shopify). Non chiudere la pagina.
          </p>
        )}
      </div>
    </div>
  );
}
