import { canali } from "./schema";

// Elenco di riferimento dei canali del modulo Pubblicazione (vedi
// modulo_pubblicazione_struttura_dati_base_2026_09_23_sera in knowledge).
// Dato di riferimento (non demo/test) - deve esistere in QUALSIASI database
// reale del software, produzione inclusa - non solo negli ambienti di
// sviluppo. Prima viveva solo dentro src/db/seed.ts (script pensato per
// popolare dati DEMO di sviluppo, mai eseguito contro il database reale
// dell'utente): risultato, /pubblicazione mostrava "nessun canale trovato"
// sulla build installata, perche' le migrazioni creano le tabelle ma non
// inseriscono righe. Estratto qui per essere richiamato automaticamente
// da src/db/index.ts ad ogni avvio (vedi seedCanaliBase sotto), cosi' non
// serve un terminale/script manuale che l'utente non puo' eseguire.
export const CANALI_INIZIALI: (typeof canali.$inferInsert)[] = [
  { nome: "Shopify", tipo: "statico", esclusivo: false },
  { nome: "eBay", tipo: "statico", esclusivo: false },
  { nome: "Etsy", tipo: "statico", esclusivo: false },
  { nome: "Subito", tipo: "statico", esclusivo: false },
  { nome: "Catawiki", tipo: "asta_online", esclusivo: true },
  { nome: "Bidspirit", tipo: "asta_online", esclusivo: true },
  { nome: "eBay Asta", tipo: "asta_online", esclusivo: true },
  { nome: "Cambi", tipo: "asta_fisica", esclusivo: true },
  { nome: "Bolaffi", tipo: "asta_fisica", esclusivo: true },
  { nome: "Wannenes", tipo: "asta_fisica", esclusivo: true },
  { nome: "Libero", tipo: "asta_fisica", esclusivo: true },
];

// Tipizzato "largo" apposta: accetta sia il client node-postgres (Neon/
// Postgres reale) sia PGlite (sviluppo), entrambi espongono la stessa
// interfaccia .insert(table).values(...).onConflictDoNothing() a runtime.
// Idempotente (onConflictDoNothing sulla colonna nome, unique) - sicuro da
// richiamare ad ogni avvio dell'app, stesso principio gia' in uso per le
// migrazioni in src/db/index.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedCanaliBase(db: any) {
  await db.insert(canali).values(CANALI_INIZIALI).onConflictDoNothing();
}
