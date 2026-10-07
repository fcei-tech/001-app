import { GestioneProprietari } from "@/components/manutenzione/gestione-proprietari";
import { getProprietariConUso } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function ProprietariPage() {
  const proprietari = await getProprietariConUso();
  return (
    <div className="flex flex-col gap-4">
      <GestioneProprietari proprietari={proprietari} />
    </div>
  );
}
