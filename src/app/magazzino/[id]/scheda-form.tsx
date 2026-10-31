"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { modificaSku } from "@/app/magazzino/actions";
import { EliminaSkuButton } from "./elimina-sku-button";
import { CampiPrezzi } from "@/components/magazzino/campi-prezzi";
import { useUnsavedChanges } from "@/components/unsaved-changes-provider";
import { EditorTagSku } from "@/components/tag/editor-tag-sku";
import type { TagBreve } from "@/db/tag-queries";

const CONDIZIONI = ["A", "A-", "B+", "B", "B-", "C"];

const MESSAGGI: Record<string, string> = {
  creato: "Sku creato.",
  carico: "Carico registrato.",
  salvato: "Modifiche salvate.",
  movimento: "Movimento registrato.",
  foto: "Foto caricata su Shopify CDN.",
  fotoeliminata: "Foto rimossa dalla galleria.",
};

type ItemForm = {
  id: number;
  skuCode: string;
  artista: string;
  opera: string;
  larghezza: string | null;
  altezza: string | null;
  supporto: string | null;
  anno: string | null;
  tipoId: number;
  condizione: string;
  tag: string | null;
  note: string | null;
  valoreCarico: string | null;
  prezzoEbay: string | null;
  prezzoCatawiki: string | null;
  riservaCatawiki: string | null;
  bloccatoVendita: boolean;
};

// Scheda sku: back-button + form dati, in un unico componente client perche'
// devono condividere lo stato "modifiche non salvate" (il pulsante Torna al
// Magazzino sopra il form deve sapere se il form sotto e' stato toccato).
export function SchedaSkuForm({
  item,
  tipi,
  disponibile,
  esito,
  tagDisponibili,
  tagIdsSku,
}: {
  item: ItemForm;
  tagDisponibili: TagBreve[];
  tagIdsSku: number[];
  tipi: { id: number; nome: string }[];
  disponibile: number;
  esito?: string;
}) {
  // Stato "modifiche non salvate" condiviso via context (non piu' locale):
  // deve valere anche per i link dell'header, vedi unsaved-changes-provider.tsx
  // per il dettaglio della correzione 2026-09-23 (window.confirm non
  // funzionava nell'app installata).
  const { hasUnsaved: modificato, setHasUnsaved: setModificato, guardedNavigate } = useUnsavedChanges();

  // Entrando in una scheda sku si riparte sempre puliti (es. se una scheda
  // precedente era rimasta "sporca" per qualche motivo), e uscendo si
  // rilascia lo stato condiviso cosi' non resta agganciato ad altre pagine.
  useEffect(() => {
    setModificato(false);
    return () => setModificato(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copre chiusura tab, refresh (F5) o uscita verso un altro sito: eventi
  // di unload reale del browser, non la navigazione interna di Next.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!modificato) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [modificato]);

  function tornaAlMagazzino() {
    guardedNavigate("/");
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={tornaAlMagazzino}>
        <ArrowLeft /> Torna al Magazzino
      </Button>

      {esito && MESSAGGI[esito] && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {MESSAGGI[esito]}
        </div>
      )}

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">{item.skuCode}</h1>
          <p className="text-sm text-muted-foreground">{item.artista} — {item.opera}</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Disponibile: <span className="font-medium text-foreground">{disponibile}</span>
          </p>
          <EliminaSkuButton skuId={item.id} skuCode={item.skuCode} />
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Dati sku</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={modificaSku}
            className="flex flex-col gap-6"
            onChange={() => setModificato(true)}
            onSubmit={() => setModificato(false)}
          >
            <input type="hidden" name="id" value={item.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="artista">Artista *</Label>
                <Input id="artista" name="artista" defaultValue={item.artista} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opera">Opera *</Label>
                <Input id="opera" name="opera" defaultValue={item.opera} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="larghezza">Larghezza (cm)</Label>
                <Input id="larghezza" name="larghezza" inputMode="decimal" defaultValue={item.larghezza ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="altezza">Altezza (cm)</Label>
                <Input id="altezza" name="altezza" inputMode="decimal" defaultValue={item.altezza ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supporto">Supporto</Label>
                <Input id="supporto" name="supporto" defaultValue={item.supporto ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="anno">Anno / epoca</Label>
                <Input id="anno" name="anno" defaultValue={item.anno ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tipoId">Tipo</Label>
                <Select name="tipoId" defaultValue={String(item.tipoId)} onValueChange={() => setModificato(true)}>
                  <SelectTrigger id="tipoId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipi.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="condizione">Condizione</Label>
                <Select name="condizione" defaultValue={item.condizione} onValueChange={() => setModificato(true)}>
                  <SelectTrigger id="condizione">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDIZIONI.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Tag</Label>
                <EditorTagSku skuId={item.id} tag={tagDisponibili} iniziali={tagIdsSku} />
                <p className="text-xs text-muted-foreground">Ogni click salva subito. L&apos;elenco dei tag si gestisce in Archivi &gt; Tag.</p>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="note">Note</Label>
                <Input id="note" name="note" defaultValue={item.note ?? ""} />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-muted-foreground">Dati commerciali</p>
              <CampiPrezzi
                iniziali={{
                  valoreCarico: item.valoreCarico,
                  prezzoEbay: item.prezzoEbay,
                  prezzoCatawiki: item.prezzoCatawiki,
                  riservaCatawiki: item.riservaCatawiki,
                }}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="bloccatoVendita" defaultChecked={item.bloccatoVendita} onCheckedChange={() => setModificato(true)} />
              Bloccato per la vendita (escluso da tutti i portali)
            </label>

            <div>
              <Button type="submit">Salva modifiche</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
