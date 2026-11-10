import { getCampiPersonalizzati } from "@/db/campi-personalizzati-queries";
import { GestioneCampiSku } from "./gestione-campi-sku";

export const dynamic = "force-dynamic";

export default async function CampiSkuPage() {
  const campi = await getCampiPersonalizzati();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Campi personalizzati</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggiungi colonne tue agli sku, come in Excel: scegli nome e tipo. Compaiono nella scheda dello sku e in Magazzino (colonne
          da attivare da &quot;Colonne&quot;). Sono solo tuoi: non vanno sui portali.
        </p>
      </div>
      <GestioneCampiSku campi={campi} />
    </div>
  );
}
