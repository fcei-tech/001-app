import path from "node:path";
import * as schema from "./schema";

// Due modalita' di connessione al database, scelte automaticamente in base
// alla presenza di DATABASE_URL nell'ambiente:
//
// 1) DATABASE_URL presente (produzione, dentro l'app nativa Mac o su un
//    Mac di sviluppo con Postgres vero): si usa Postgres reale (Neon in
//    cloud, o un Postgres locale) tramite il driver "pg".
//    Ogni Mac ha la propria stringa di connessione/credenziale - vedi
//    RELEASE.md "Configurazione per-Mac".
//
// 2) DATABASE_URL assente (sviluppo rapido senza nulla da installare,
//    es. dentro il container Claude): si usa PGlite, un Postgres embedded
//    su file (./pgdata-locale), per poter cliccare l'interfaccia senza
//    dipendenze esterne. NON usato in produzione.
const databaseUrl = process.env.DATABASE_URL;

export const db = databaseUrl
  ? await createRealDb(databaseUrl)
  : await createDevDb();

async function createRealDb(connectionString: string) {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString });
  const realDb = drizzle(pool, { schema });
  // Crea/aggiorna le tabelle da solo (cartella "drizzle" = file SQL generati
  // con "drizzle-kit generate"). Sicuro da rilanciare: applica solo le
  // migrazioni mancanti. Dentro l'app nativa la cartella sta accanto a
  // server.js (vedi il passo "assembla le risorse" in release.yml).
  // Se un collegamento con permessi di sola lettura/scrittura dati (senza
  // diritto di modificare la struttura) non puo' applicare migrazioni, non si
  // blocca tutto: le tabelle esistono gia' (create dal collegamento
  // "proprietario"); l'errore resta visibile nei log.
  try {
    await migrate(realDb, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } catch (err) {
    console.error("Migrazioni database non applicate:", err);
  }
  return realDb;
}

async function createDevDb() {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite("./pgdata-locale");
  return drizzle(client, { schema });
}
