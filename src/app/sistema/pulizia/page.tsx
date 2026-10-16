import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pulizia } from "@/components/sistema/pulizia";

export const dynamic = "force-dynamic";

export default function PuliziaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Pulizia dati</h1>
      <Card>
        <CardHeader>
          <CardTitle>Prepara il punto zero</CardTitle>
          <CardDescription>
            Scegli cosa cancellare prima di caricare i dati veri. Le foto e i loro link non si toccano mai. Ordine consigliato: Pulizia → Dati →
            Importa da Excel (FP e CV).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Pulizia />
        </CardContent>
      </Card>
    </div>
  );
}
