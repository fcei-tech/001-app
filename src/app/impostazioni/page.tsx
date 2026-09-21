import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readConfig } from "@/lib/app-config";
import { ShopifyForm } from "./shopify-form";

// Legge la configurazione a ogni richiesta. Al browser arrivano SOLO stati
// ("collegato si/no", nome del server, nome del negozio): mai password,
// Client ID o Client secret.
export const dynamic = "force-dynamic";

function hostDatabase(): string | null {
  const url = process.env.DATABASE_URL ?? readConfig().database_url;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return "collegato";
  }
}

export default function ImpostazioniPage() {
  const dbHost = hostDatabase();
  const cfg = readConfig();
  const shop = process.env.SHOPIFY_SHOP ?? cfg.shopify_shop ?? null;
  const shopifyConfigurato = Boolean(
    shop &&
      (process.env.SHOPIFY_CLIENT_ID ?? cfg.shopify_client_id) &&
      (process.env.SHOPIFY_CLIENT_SECRET ?? cfg.shopify_client_secret),
  );

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Impostazioni</h1>

        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>
              {dbHost ? `Collegato a ${dbHost}.` : "Non collegato."} La stringa di connessione
              resta salvata solo su questo Mac e non viene mai mostrata.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link href="/configura-database" className="underline underline-offset-4">
              Cambia stringa di connessione
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shopify (foto)</CardTitle>
            <CardDescription>
              {shopifyConfigurato
                ? `Configurato per ${shop}. Per cambiare le credenziali, inseriscile di nuovo qui sotto.`
                : "Non configurato: senza queste credenziali il caricamento delle foto non funziona."}{" "}
              Restano salvate solo su questo Mac e non vengono mai mostrate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShopifyForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
