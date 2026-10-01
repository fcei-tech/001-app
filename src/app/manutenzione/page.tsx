import { Header } from "@/components/header";
import { GestioneProprietari } from "@/components/manutenzione/gestione-proprietari";
import { GestioneDepositi } from "@/components/manutenzione/gestione-depositi";
import { getProprietariConUso, getUbicazioniConUso } from "@/db/queries";

// Legge dal database: mai pre-generata in build.
export const dynamic = "force-dynamic";

export default async function ManutenzionePage() {
  const [depositi, proprietari] = await Promise.all([getUbicazioniConUso(), getProprietariConUso()]);

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold">Manutenzione</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Elenchi di base del Magazzino: <strong>Depositi</strong> (dove si trovano i pezzi) e{" "}
            <strong>Proprietari</strong> (di chi sono). Le modifiche si salvano da sole.
          </p>
        </div>
        <GestioneDepositi depositi={depositi} />
        <GestioneProprietari proprietari={proprietari} />
      </main>
    </div>
  );
}
