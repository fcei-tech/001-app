import { GestioneDepositi } from "@/components/manutenzione/gestione-depositi";
import { getUbicazioniConUso } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function DepositiPage() {
  const depositi = await getUbicazioniConUso();
  return (
    <div className="flex flex-col gap-4">
      <GestioneDepositi depositi={depositi} />
    </div>
  );
}
