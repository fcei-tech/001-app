import { Pool } from "pg";
import { isSameOrigin, writeConfig } from "@/lib/app-config";

// Salva la credenziale del database nel file di configurazione dell'app.
// Prima di salvare verifica che la connessione funzioni davvero, cosi'
// non si puo' salvare per errore una credenziale sbagliata. Vale dal
// riavvio successivo dell'app.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, errore: "Richiesta non ammessa." }, { status: 403 });
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
    writeConfig({ database_url: cleaned });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, errore: `Non riesco a salvare il file di configurazione: ${motivo}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
