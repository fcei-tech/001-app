import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Backup, Ripristino } from "@/components/sistema/backup-ripristino";
import { Consolida } from "@/components/sistema/consolida";
import { StatoPortaliMaster } from "@/components/sistema/stato-portali-master";

export const dynamic = "force-dynamic";

export default function DatiPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dati</h1>

      <Card>
        <CardHeader>
          <CardTitle>Importa dal Master</CardTitle>
          <CardDescription>Carica nel Magazzino i dati dal file Excel e le foto.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/importa-excel">Importa da Excel</Link></Button>
          <Button asChild variant="secondary"><Link href="/importa-foto">Importa Foto</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Situazione sui portali (dal Master)</CardTitle>
          <CardDescription>
            Legge dal Master le colonne PUB_* (valore 0 = sku bloccato su quel portale) e CARICATO_* (sku già caricato). Importa solo quello che manca nel
            software: si può rifare senza sovrascrivere nulla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatoPortaliMaster />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            Salva tutti i dati in un file nella cartella Documenti → &quot;BATCH_ backup&quot;. Si fa a mano, quando vuoi. Le foto non sono incluse (stanno
            su Shopify).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Backup />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ripristino da backup</CardTitle>
          <CardDescription>Riporta i dati a come erano in un backup. Sostituisce tutto quello che c&apos;è adesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <Ripristino />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consolida</CardTitle>
          <CardDescription>
            Fonde le tante piccole correzioni &quot;senza registro&quot; in una sola riga per articolo. Le quantità non cambiano e i movimenti visibili non
            vengono toccati.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Consolida />
        </CardContent>
      </Card>
    </div>
  );
}
