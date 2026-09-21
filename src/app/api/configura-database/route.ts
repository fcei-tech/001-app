import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";

// Salva la credenziale del database nel file di configurazione dell'app
// (lo stesso che legge il guscio Tauri all'avvio: vedi
// src-tauri/src/main.rs > read_mac_config). Su macOS il percorso e'
// ~/Library/Application Support/<identifier di tauri.conf.json>/config.json.
// Prima di salvare verifica che la connessione funzioni davvero, cosi'
// non si puo' salvare per errore una credenziale sbagliata.
const APP_IDENTIFIER = "it.posterclub.batch";

function configPath() {
  return path.join(
    os.homedir(),
    "Library",
    "Application Support",
    APP_IDENTIFIER,
    "config.json",
  );
}

export async function POST(request: Request) {
  // Solo al primo avvio: a credenziale gia' presente questa via e' chiusa.
  if (process.env.DATABASE_URL) {
    return Response.json(
      { ok: false, errore: "Il database e' gia' collegato." },
      { status: 409 },
    );
  }

  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return Response.json({ ok: false, errore: "Richiesta non valida." }, { status: 400 });
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    return Response.json(
      { ok: false, errore: "Non sembra una stringa di connessione: deve iniziare con postgresql://" },
      { status: 400 },
    );
  }

  // "channel_binding=require" (presente nelle stringhe Neon piu' recenti) non
  // e' necessario: la connessione resta cifrata con TLS (sslmode=require).
  let cleaned = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("channel_binding");
    cleaned = parsed.toString();
  } catch {
    return Response.json(
      { ok: false, errore: "La stringa non e' leggibile: controlla di averla copiata per intero." },
      { status: 400 },
    );
  }

  const pool = new Pool({ connectionString: cleaned, connectionTimeoutMillis: 20000 });
  try {
    await pool.query("select 1");
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    // Il messaggio del driver non contiene la password; per sicurezza la oscuro comunque.
    const pulito = motivo.split(cleaned).join("(stringa)");
    return Response.json(
      { ok: false, errore: `Il database non risponde con questa stringa: ${pulito}` },
      { status: 400 },
    );
  } finally {
    await pool.end().catch(() => {});
  }

  try {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let esistente: Record<string, unknown> = {};
    try {
      esistente = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      // file assente o illeggibile: si riparte da zero
    }
    fs.writeFileSync(file, JSON.stringify({ ...esistente, database_url: cleaned }, null, 2), {
      mode: 0o600,
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
