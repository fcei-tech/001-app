import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pulizia } from "@/components/sistema/pulizia";

export const dynamic = "force-dynamic";

export default function PuliziaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Pulizia dati</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ripartenza dei dati</CardTitle>
          <CardDescription>
            Prepara il software a ricevere FP e CV come punto zero. Le foto e i loro link non si toccano mai. Non serve per i normali
            aggiornamenti: per quelli basta Importa da Excel. Ordine: Backup → Pulizia → Importa da Excel (FP e CV).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Pulizia />
        </CardContent>
      </Card>
    </div>
  );
}
