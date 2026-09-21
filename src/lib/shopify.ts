// Integrazione Shopify Admin API - solo per upload foto sku su Shopify CDN
// (decisione 2026-09-17: le foto restano su Shopify CDN come oggi, nessuno
// storage dedicato). App custom creata su Dev Dashboard, un solo store
// (POSTERCLUB), nessun flusso OAuth con redirect: si usa il grant
// client_credentials, pensato apposta per "server-side app che agisce su
// store della propria organizzazione" (vedi shopify.dev/docs/apps/build/
// authentication-authorization/client-credentials-grant).
//
// Il token NON è un valore statico da incollare in .env: va richiesto a
// runtime scambiando client_id+client_secret, dura 24h (86399s) e va
// rinnovato. Questo modulo tiene il token in cache in memoria di processo
// e lo rinnova da solo quando manca poco alla scadenza - nessun bisogno di
// intervento manuale.

import { readConfig, SHOPIFY_SHOP_RE } from "@/lib/app-config";

const SHOPIFY_API_VERSION = "2026-07";

// Le credenziali si leggono a ogni chiamata (non all'avvio): nello sviluppo
// arrivano da .env.local (variabili d'ambiente), nell'app installata dal
// file di configurazione salvato dalla pagina Impostazioni (vedi
// src/lib/app-config.ts) - cosi' funzionano subito dopo il salvataggio,
// senza riavviare. Il dominio e' vincolato a *.myshopify.com.
function assertConfig() {
  const file = readConfig();
  const shop = process.env.SHOPIFY_SHOP ?? file.shopify_shop;
  const clientId = process.env.SHOPIFY_CLIENT_ID ?? file.shopify_client_id;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? file.shopify_client_secret;
  if (!shop || !clientId || !clientSecret) {
    throw new Error(
      "Credenziali Shopify non configurate: apri Impostazioni (in alto) e inseriscile."
    );
  }
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    throw new Error("Il negozio Shopify configurato non e' nel formato nome-negozio.myshopify.com");
  }
  return { shop, clientId, clientSecret };
}

// Controlla con Shopify che le credenziali siano valide (senza salvare nulla).
export async function verificaCredenzialiShopify(
  shop: string,
  clientId: string,
  clientSecret: string
): Promise<void> {
  if (!SHOPIFY_SHOP_RE.test(shop)) {
    throw new Error("Il negozio deve essere nel formato nome-negozio.myshopify.com");
  }
  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  } catch {
    throw new Error("Non riesco a raggiungere Shopify: controlla la connessione e il nome del negozio.");
  }
  if (!res.ok) {
    throw new Error(`Shopify ha rifiutato le credenziali (HTTP ${res.status}): controlla negozio, Client ID e Client secret.`);
  }
}

let tokenCache: { token: string; scadeAlle: number; chiave: string } | null = null;

// Scambia client_id+client_secret per un access token (grant client_credentials).
// Rinnova con 60s di margine prima della scadenza reale, come da esempio
// ufficiale Shopify.
async function ottieniAccessToken(): Promise<string> {
  const cfg = assertConfig();
  const chiave = `${cfg.shop}|${cfg.clientId}`;

  if (tokenCache && tokenCache.chiave === chiave && Date.now() < tokenCache.scadeAlle - 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`https://${cfg.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });

  if (!res.ok) {
    const testo = await res.text();
    throw new Error(`Scambio token Shopify fallito (HTTP ${res.status}): ${testo}`);
  }

  const dati = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: dati.access_token,
    scadeAlle: Date.now() + dati.expires_in * 1000,
    chiave,
  };
  return tokenCache.token;
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cfg = assertConfig();
  const token = await ottieniAccessToken();
  const res = await fetch(
    `https://${cfg.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!res.ok) {
    const testo = await res.text();
    throw new Error(`Chiamata Admin API fallita (HTTP ${res.status}): ${testo}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Errore GraphQL Shopify: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

const MUTATION_STAGED_UPLOADS_CREATE = /* GraphQL */ `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const MUTATION_FILE_CREATE = /* GraphQL */ `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const QUERY_NODE_FILE_STATUS = /* GraphQL */ `
  query fileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        fileStatus
        image {
          url
        }
      }
    }
  }
`;

// Carica un'immagine su Shopify CDN e restituisce l'URL definitivo.
// Passi (Admin API, come da schema GraphQL del negozio POSTERCLUB):
// 1) stagedUploadsCreate - ottiene un URL temporaneo firmato dove caricare i bytes
// 2) upload multipart diretto a quell'URL (non passa per l'Admin API)
// 3) fileCreate - registra il file caricato come MediaImage nel negozio
// 4) poll su node(id) finché fileStatus è READY - Shopify processa l'immagine
//    in modo asincrono, l'URL CDN definitivo non è pronto subito dopo fileCreate.
export async function caricaFotoSuShopify(
  bytes: Buffer,
  nomeFile: string,
  mimeType: string
): Promise<string> {
  assertConfig();

  const staged = await graphql<{
    stagedUploadsCreate: {
      stagedTargets: {
        url: string;
        resourceUrl: string;
        parameters: { name: string; value: string }[];
      }[];
      userErrors: { field: string; message: string }[];
    };
  }>(MUTATION_STAGED_UPLOADS_CREATE, {
    input: [
      {
        filename: nomeFile,
        mimeType,
        httpMethod: "POST",
        resource: "FILE",
      },
    ],
  });

  if (staged.stagedUploadsCreate.userErrors.length) {
    throw new Error(
      `stagedUploadsCreate: ${JSON.stringify(staged.stagedUploadsCreate.userErrors)}`
    );
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("Nessun target restituito da stagedUploadsCreate");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), nomeFile);

  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(`Upload su storage temporaneo fallito (HTTP ${uploadRes.status})`);
  }

  const creato = await graphql<{
    fileCreate: {
      files: { id: string; fileStatus: string }[];
      userErrors: { field: string; message: string }[];
    };
  }>(MUTATION_FILE_CREATE, {
    files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
  });

  if (creato.fileCreate.userErrors.length) {
    throw new Error(`fileCreate: ${JSON.stringify(creato.fileCreate.userErrors)}`);
  }
  const file = creato.fileCreate.files[0];
  if (!file) throw new Error("Nessun file restituito da fileCreate");

  // Poll fino a READY (in genere pochi secondi). Max ~20s per non bloccare
  // troppo la request dell'utente.
  for (let tentativo = 0; tentativo < 10; tentativo++) {
    const stato = await graphql<{
      node: { fileStatus: string; image?: { url: string } } | null;
    }>(QUERY_NODE_FILE_STATUS, { id: file.id });

    if (stato.node?.fileStatus === "READY" && stato.node.image?.url) {
      return stato.node.image.url;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Timeout in attesa che Shopify finisca di processare l'immagine");
}
