import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRegolePrezzi } from "@/db/impostazioni-app-queries";
import { getMagazzino } from "@/db/queries";
import { calcolaControlli } from "@/lib/controllo-dati";

export const dynamic = "force-dynamic";

const ANTEPRIMA = 12;

export default async function ControlloDatiPage() {
  const [righe, regole] = await Promise.all([getMagazzino(), getRegolePrezzi()]);
  const controlli = calcolaControlli(righe, regole.sogliaMinimaCatawiki);
  const daSistemare = controlli.filter((c) => c.righe.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Controllo dati</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cosa c&apos;è da sistemare negli sku prima di mandarli sui portali. Non cambia niente da solo: ti mostra gli sku e ti porta
            alla loro scheda. Rifallo dopo ogni importazione: l&apos;Excel aggiunge dati e può portare nuovi buchi.
          </p>
        </div>
        <Button asChild variant="secondary" className="ml-auto">
          <Link href="/sistema/controllo-dati">Ricontrolla</Link>
        </Button>
      </div>

      <p className="text-sm">
        {daSistemare === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <CheckCircle2 className="size-4" /> Tutto a posto su {righe.length} sku.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-warning">
            <TriangleAlert className="size-4" /> {daSistemare} {daSistemare === 1 ? "controllo" : "controlli"} con qualcosa da sistemare, su {righe.length} sku.
          </span>
        )}
      </p>

      {controlli.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {c.titolo}
              {c.righe.length === 0 ? <Badge variant="success">ok</Badge> : <Badge variant="warning">{c.righe.length}</Badge>}
            </CardTitle>
            <CardDescription>{c.spiegazione}</CardDescription>
          </CardHeader>
          {c.righe.length > 0 && (
            <CardContent>
              <ul className="divide-y text-sm">
                {c.righe.slice(0, ANTEPRIMA).map((r) => (
                  <Riga key={r.id} r={r} />
                ))}
              </ul>
              {c.righe.length > ANTEPRIMA && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Mostra gli altri {c.righe.length - ANTEPRIMA}</summary>
                  <ul className="mt-2 divide-y text-sm">
                    {c.righe.slice(ANTEPRIMA).map((r) => (
                      <Riga key={r.id} r={r} />
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function Riga({ r }: { r: { id: number; skuCode: string; artista: string; opera: string; dettaglio?: string } }) {
  return (
    <li>
      <Link href={`/magazzino/${r.id}`} className="flex flex-wrap items-baseline gap-x-3 py-1.5 hover:bg-accent/50">
        <span className="font-mono text-xs">{r.skuCode}</span>
        <span>
          {r.artista} — {r.opera}
        </span>
        {r.dettaglio && <span className="text-xs text-muted-foreground">{r.dettaglio}</span>}
      </Link>
    </li>
  );
}
