import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getMagazzino, getTipiOggetto } from "@/db/queries";
import { Plus, FileSpreadsheet, Images } from "lucide-react";
import { VistaMagazzino } from "@/components/magazzino/vista-magazzino";

type SearchParams = {
  q?: string;
  tipo?: string;
  condizione?: string;
  proprieta?: string;
  bloccato?: string;
  disponibilita?: string;
  senzafoto?: string;
  skueliminato?: string;
};

export const dynamic = "force-dynamic";

export default async function MagazzinoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { q, skueliminato } = sp;

  const tipoId = sp.tipo && sp.tipo !== "tutti" ? Number(sp.tipo) : undefined;
  const condizione = sp.condizione && sp.condizione !== "tutti" ? sp.condizione : undefined;
  const proprieta = sp.proprieta === "FP" || sp.proprieta === "CV" ? sp.proprieta : undefined;
  const bloccato = sp.bloccato === "si" || sp.bloccato === "no" ? sp.bloccato : undefined;
  const disponibilita = sp.disponibilita === "disponibile" || sp.disponibilita === "esaurito" ? sp.disponibilita : undefined;
  const senzaFoto = sp.senzafoto === "si";

  const filtriAttivi = Boolean(q || tipoId || condizione || proprieta || bloccato || disponibilita || senzaFoto);

  const [righe, tipi] = await Promise.all([
    getMagazzino({ ricerca: q, tipoId, condizione, proprieta, bloccato, disponibilita, senzaFoto }),
    getTipiOggetto(),
  ]);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {skueliminato && (
          <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Sku eliminato.</div>
        )}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Magazzino</h1>
            <p className="text-sm text-muted-foreground">{righe.length} sku {filtriAttivi ? "con questi filtri" : "totali"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary"><Link href="/importa-excel"><FileSpreadsheet /> Importa da Excel</Link></Button>
            <Button asChild variant="secondary"><Link href="/importa-foto"><Images /> Importa Foto</Link></Button>
            <Button asChild><Link href="/magazzino/nuovo"><Plus /> Nuovo sku</Link></Button>
          </div>
        </div>

        <VistaMagazzino
          righe={righe}
          tipi={tipi}
          filtriAttivi={filtriAttivi}
          filtriIniziali={{
            q: q ?? "",
            tipo: tipoId ? String(tipoId) : "tutti",
            condizione: condizione ?? "tutti",
            proprieta: proprieta ?? "tutti",
            bloccato: bloccato ?? "tutti",
            disponibilita: disponibilita ?? "tutti",
            senzafoto: senzaFoto ? "si" : "no",
          }}
        />
      </main>
    </div>
  );
}
