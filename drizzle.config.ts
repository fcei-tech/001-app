import { defineConfig } from "drizzle-kit";

// Variante SOLO per la prova locale sul Mac (database Postgres embedded,
// nessuna installazione di sistema necessaria). Lo sviluppo vero usera'
// un Postgres reale in locale (vedi modello_sviluppo_2026_09_11) + Neon
// in cloud - questa e' solo per vedere/testare subito l'interfaccia.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: "./pgdata-locale",
  },
  verbose: true,
});
