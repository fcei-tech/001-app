import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bomba } from "@/components/sistema/bomba";

export const dynamic = "force-dynamic";

export default function ZonaPericoloPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Zona pericolo</h1>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Elimina tutti i dati</CardTitle>
          <CardDescription>
            Cancella dal database tutti gli sku, i movimenti, i batch, i proprietari, i depositi e il resto, e toglie da questo Mac il collegamento al
            database. Dopo, l&apos;app si riavvia e chiede di nuovo il collegamento. <strong>Non</strong> tocca le foto su Shopify, i file di backup,
            e non cancella il progetto su Neon. Non fa nessun backup automatico: se ti serve, crealo prima da Sistema → Dati.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Bomba />
        </CardContent>
      </Card>
    </div>
  );
}
