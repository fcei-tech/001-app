"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Copy, CopyPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cambiaStatoBatchAction, duplicaBatchAction, duplicaBatchSuCanaleAction, rinominaBatchAction, spostaBatchAction } from "@/app/pubblicazione/actions";
import { EliminaBatchDialog } from "@/components/pubblicazione/elimina-batch-button";

type Stato = "bozza" | "confermato" | "pubblicato";

const VOCI: { stato: Stato; etichetta: string; descrizione: string }[] = [
  { stato: "bozza", etichetta: "Torna a bozza", descrizione: "Il batch torna modificabile; la disponibilità prenotata si libera." },
  { stato: "confermato", etichetta: "Segna come Pronto", descrizione: "Il batch è pronto per generare il file o la lista." },
  { stato: "pubblicato", etichetta: "Segna come Inviato", descrizione: "Il file o la lista sono già stati mandati al portale." },
];

// Menu ⋯ della pagina batch: cambio di stato manuale (tutte le direzioni) ed
// Elimina batch, lontano dal bottone principale. Un solo posto per tutto quello
// che non serve ad andare avanti.
export function MenuAzioniBatch({
  batchId,
  canaleId,
  stato,
  nome,
  numeroLottiConPrenotazione,
  numeroLottiConsegnati,
  avvisoRegistroPortale,
  tipoCanale,
  destinazioni,
}: {
  batchId: number;
  canaleId: number;
  stato: Stato;
  nome: string | null;
  numeroLottiConPrenotazione: number;
  numeroLottiConsegnati: number;
  avvisoRegistroPortale: boolean;
  tipoCanale: string;
  destinazioni: { id: number; nome: string; tipo: string }[];
}) {
  const router = useRouter();
  const [spostaAperto, setSpostaAperto] = useState(false);
  const [modo, setModo] = useState<"sposta" | "duplica">("sposta");
  const [destId, setDestId] = useState<number | null>(null);
  const [erroreSposta, setErroreSposta] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [eliminaAperto, setEliminaAperto] = useState(false);
  const [rinominaAperto, setRinominaAperto] = useState(false);
  const [nomeBozza, setNomeBozza] = useState(nome ?? "");

  function campi(): FormData {
    const fd = new FormData();
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    return fd;
  }

  function duplica() {
    start(async () => {
      await duplicaBatchAction(campi());
    });
  }

  function salvaNome() {
    const fd = campi();
    fd.set("nome", nomeBozza);
    start(async () => {
      await rinominaBatchAction(fd);
      setRinominaAperto(false);
    });
  }

  function conferma() {
    if (!destId) return;
    start(async () => {
      if (modo === "sposta") {
        const r = await spostaBatchAction(batchId, destId);
        if (!r.ok) {
          setErroreSposta(r.errore);
          return;
        }
        setSpostaAperto(false);
        router.push(`/pubblicazione/${destId}/${batchId}`);
      } else {
        const r = await duplicaBatchSuCanaleAction(batchId, destId);
        if (!r.ok) {
          setErroreSposta(r.errore);
          return;
        }
        setSpostaAperto(false);
        router.push(`/pubblicazione/${r.canaleId}/${r.batchId}`);
      }
    });
  }

  const destScelta = destinazioni.find((d) => d.id === destId);
  const cambioTipo = !!destScelta && destScelta.tipo !== tipoCanale;

  function vaiA(nuovoStato: Stato) {
    const fd = new FormData();
    fd.set("batchId", String(batchId));
    fd.set("canaleId", String(canaleId));
    fd.set("nuovoStato", nuovoStato);
    start(async () => {
      await cambiaStatoBatchAction(fd);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={pending} aria-label="Altre azioni sul batch" title="Altre azioni">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => { setNomeBozza(nome ?? ""); setRinominaAperto(true); }}>
            <Pencil /> Rinomina batch…
          </DropdownMenuItem>
          <DropdownMenuItem className="flex-col items-start gap-0.5" onSelect={duplica}>
            <span className="flex items-center gap-2"><Copy className="size-4" /> Duplica batch</span>
            <span className="text-xs text-muted-foreground">Crea una copia in bozza con gli stessi lotti e le stesse impostazioni.</span>
          </DropdownMenuItem>
          {destinazioni.length > 0 && (
            <>
              <DropdownMenuItem onSelect={() => { setModo("sposta"); setDestId(null); setErroreSposta(null); setSpostaAperto(true); }}>
                <ArrowRightLeft /> Sposta su un altro portale…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setModo("duplica"); setDestId(null); setErroreSposta(null); setSpostaAperto(true); }}>
                <CopyPlus /> Duplica su un altro portale…
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {VOCI.filter((v) => v.stato !== stato).map((v) => (
            <DropdownMenuItem key={v.stato} className="flex-col items-start gap-0.5" onSelect={() => vaiA(v.stato)}>
              <span className="font-medium">{v.etichetta}</span>
              <span className="text-xs text-muted-foreground">{v.descrizione}</span>
              {v.stato === "bozza" && numeroLottiConsegnati > 0 && (
                <span className="text-xs text-warning">
                  Attenzione: {numeroLottiConsegnati} {numeroLottiConsegnati === 1 ? "lotto consegnato resta consegnato" : "lotti consegnati restano consegnati"} (usa Rientrato sui lotti se devono tornare).
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setEliminaAperto(true)}>
            <Trash2 /> Elimina batch…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={rinominaAperto} onOpenChange={setRinominaAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina batch</DialogTitle>
            <DialogDescription>Un nome per riconoscerlo nell&apos;elenco (es. &quot;Asta di dicembre&quot;). Vuoto = &quot;Batch #{batchId}&quot;.</DialogDescription>
          </DialogHeader>
          <Input
            value={nomeBozza}
            onChange={(e) => setNomeBozza(e.target.value)}
            maxLength={80}
            placeholder={`Batch #${batchId}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") salvaNome();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRinominaAperto(false)} disabled={pending}>Annulla</Button>
            <Button type="button" onClick={salvaNome} disabled={pending}>{pending ? "Salvo…" : "Salva nome"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={spostaAperto} onOpenChange={setSpostaAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modo === "sposta" ? "Sposta batch" : "Duplica batch"}</DialogTitle>
            <DialogDescription>
              {modo === "sposta" ? "Lotti, riserve e stato restano uguali." : "Crea una copia in preparazione con gli stessi lotti."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {destinazioni.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setDestId(d.id); setErroreSposta(null); }}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${destId === d.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              >
                {d.nome}
              </button>
            ))}
          </div>
          {cambioTipo && (
            <p className="text-sm text-muted-foreground">
              {modo === "sposta"
                ? "Cambia il tipo di asta: il batch torna in preparazione e i lotti ripartono da capo. Le riserve restano."
                : "Cambia il tipo di asta: i lotti ripartono da capo. Le riserve restano."}
            </p>
          )}
          {erroreSposta && <p className="text-sm text-destructive">{erroreSposta}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSpostaAperto(false)} disabled={pending}>Annulla</Button>
            <Button type="button" onClick={conferma} disabled={pending || !destId}>
              {pending ? (modo === "sposta" ? "Sposto…" : "Duplico…") : modo === "sposta" ? "Sposta" : "Duplica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EliminaBatchDialog
        batchId={batchId}
        canaleId={canaleId}
        numeroLottiConPrenotazione={numeroLottiConPrenotazione}
        numeroLottiConsegnati={numeroLottiConsegnati}
        avvisoRegistroPortale={avvisoRegistroPortale}
        aperto={eliminaAperto}
        onAperto={setEliminaAperto}
      />
    </>
  );
}
