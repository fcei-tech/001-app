import { isSameOrigin, SHOPIFY_SHOP_RE, writeConfig } from "@/lib/app-config";
import { verificaCredenzialiShopify } from "@/lib/shopify";

// Salva le credenziali Shopify (per le foto) nel file di configurazione
// dell'app, dopo aver verificato con Shopify che funzionano. Non restituisce
// mai le credenziali al browser. Vale subito, senza riavviare.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, errore: "Richiesta non ammessa." }, { status: 403 });
  }

  let shop = "";
  let clientId = "";
  let clientSecret = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    shop = typeof body.shop === "string" ? body.shop.trim().toLowerCase() : "";
    clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  } catch {
    return Response.json({ ok: false, errore: "Richiesta non valida." }, { status: 400 });
  }

  shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    return Response.json(
      { ok: false, errore: "Il negozio deve essere nel formato nome-negozio.myshopify.com" },
      { status: 400 },
    );
  }
  if (!clientId || !clientSecret) {
    return Response.json({ ok: false, errore: "Servono sia Client ID sia Client secret." }, { status: 400 });
  }

  try {
    await verificaCredenzialiShopify(shop, clientId, clientSecret);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, errore: motivo }, { status: 400 });
  }

  try {
    writeConfig({
      shopify_shop: shop,
      shopify_client_id: clientId,
      shopify_client_secret: clientSecret,
    });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, errore: `Non riesco a salvare il file di configurazione: ${motivo}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
