import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// File di configurazione dell'app installata, uno per Mac:
//   ~/Library/Application Support/it.posterclub.batch/config.json
// (lo stesso che legge il guscio Tauri all'avvio: src-tauri/src/main.rs >
// read_mac_config). Contiene le credenziali: e' leggibile solo dall'utente
// del Mac (permessi 600) e non finisce MAI in git ne' viene rimandato al
// browser - le pagine ricevono solo "configurato si/no".
// SOLO codice lato server (usa fs).
const APP_IDENTIFIER = "it.posterclub.batch";

export type AppConfig = {
  database_url?: string;
  shopify_shop?: string;
  shopify_client_id?: string;
  shopify_client_secret?: string;
};

export function configFilePath() {
  return path.join(os.homedir(), "Library", "Application Support", APP_IDENTIFIER, "config.json");
}

export function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(configFilePath(), "utf8")) as AppConfig;
  } catch {
    return {};
  }
}

export function writeConfig(patch: Partial<AppConfig>) {
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...readConfig(), ...patch }, null, 2), {
    mode: 0o600,
  });
}

// Protezione da richieste "alla cieca" di altri siti aperti nel browser verso
// questo server locale: le API di configurazione accettano solo richieste
// partite dalle pagine del server stesso (stesso Origin).
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Le credenziali Shopify vengono inviate a https://<shop>/...: il dominio va
// vincolato a *.myshopify.com, altrimenti un valore sbagliato le manderebbe
// a un sito qualsiasi.
export const SHOPIFY_SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
