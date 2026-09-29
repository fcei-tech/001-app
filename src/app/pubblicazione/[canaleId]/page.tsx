import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { TableEmpty } from "@/components/ui/table-empty";
import { getCanaleById, getBatchPerCanale } from "@/db/pubblicazione-queries";
import { creaBatch } from "../actions";
import { coloreCanale, fasceCanale } from "@/lib/colori-canali";
import { contaLottiConPrenotazione } from "@/lib/prenotazione-batch";
import { ListaBatchCanale, type RigaBatch } from "@/components/pubblicazione/lista-batch-canale";
import { BarraCanale } from "@/components/pubblicazione/barra-canale";

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

export default async function CanalePubblicazionePage({
  params,
  searchParams,
}: {
  params: Promise<{ canaleId: string }>;
  searchParams: Promise<{ eliminato?: string; eliminati?: string }>;
}) {
  const { canaleId } = await params;
  const sp = await searchParams;
  const id = Number(canaleId);
  const [canale, batch] = await Promise.all([getCanaleById(id), getBatchPerCanale(id)]);

  if (!canale) notFound();

  const colore = coloreCanale(canale.nome);
  const fasce = fasceCanale(canale.nome);
  const righe: RigaBatch[] = batch.map((b) => ({
    id: b.id,
    creatoIlFormattato: formatData(b.createdAt),
    stato: b.stato,
    numeroLotti: b.lotti.length,
    numeroLottiConPrenotazione: contaLottiConPrenotazione(b, canale),
  }));

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link
          href="/pubblicazione"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Tutti i canali
        </Link>

        {sp.eliminato && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Batch eliminato.
          </div>
        )}
        {sp.eliminati && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            {sp.eliminati} batch eliminati.
          </div>
        )}

        {/* 2026-09-29: bordo 20px (SPESSORE_BORDO_CANALE_PX, "opzione C") -
            eBay/eBay Asta usano BarraCanale (4 fasce) invece del bordo
            singolo, vedi barra-canale.tsx. "pl-9" (36px = 20px fascia + 16px
            respiro, come il border-l-[20px]+pl-4 del caso a colore singolo)
            mantiene il testo alla stessa distanza in entrambi i casi -
            "relative overflow-hidden" evita qualsiasi sconfinamento. */}
        <div
          className={`relative mb-6 flex items-center justify-between gap-4 overflow-hidden ${fasce ? "pl-9" : "border-l-[20px] pl-4"}`}
          style={!fasce && colore ? { borderLeftColor: colore } : undefined}
        >
          {fasce && <BarraCanale nomeCanale={canale.nome} />}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{canale.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {canale.esclusivo
                ? "Canale esclusivo — un pezzo alla volta, consuma disponibilita' alla conferma/accettazione"
                : "Canale parallelo — nessun consumo di disponibilita' condivisa"}
            </p>
          </div>
          <form action={creaBatch}>
            <input type="hidden" name="canaleId" value={canale.id} />
            <Button type="submit">Nuovo batch</Button>
          </form>
        </div>

        {righe.length === 0 ? (
          <div className="rounded-lg border">
            <TableEmpty>Nessun batch per questo canale. Creane uno per iniziare.</TableEmpty>
          </div>
        ) : (
          <ListaBatchCanale canaleId={canale.id} righe={righe} />
        )}
      </main>
    </div>
  );
}
