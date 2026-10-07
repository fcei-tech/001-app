import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { InterruttorePortale } from "@/components/archivi/interruttore-portale";

export const dynamic = "force-dynamic";

const ETICHETTE_TIPO: Record<string, string> = {
  statico: "Statico",
  asta_online: "Asta online",
  asta_fisica: "Asta fisica",
};

export default async function PortaliPage() {
  const canali = await db.query.canali.findMany({ orderBy: (c, { asc }) => asc(c.nome) });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Portali</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          I canali di vendita. Un portale non attivo sparisce da Pubblicazione e non genera liste &quot;Da fare&quot;; i suoi dati restano.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {canali.map((c) => {
            const imp = (c.impostazioni ?? {}) as { quantitaFissa?: number };
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {ETICHETTE_TIPO[c.tipo] ?? c.tipo}
                    {c.esclusivo ? " · un pezzo alla volta" : ""}
                    {imp.quantitaFissa ? ` · sempre ${imp.quantitaFissa} pezzo` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={c.attivo ? "success" : "secondary"}>{c.attivo ? "Attivo" : "Non attivo"}</Badge>
                  <InterruttorePortale canaleId={c.id} attivo={c.attivo} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
