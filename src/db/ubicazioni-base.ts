import { ubicazioni } from "./schema";

// Elenco di riferimento delle ubicazioni fisiche (2026-09-25, sessione 5) -
// stesso principio/stesso bug gia' risolto per i canali (vedi
// CANALI_INIZIALI in canali-base.ts): prima esistevano SOLO dentro
// src/db/seed.ts, script demo "mai eseguito contro il database reale
// dell'utente" (vedi commento in canali-base.ts) - risultato, sul database
// reale la tabella ubicazioni restava vuota, e il flusso Consegna/Rientro
// (che ha bisogno di ubicazioni vere per Cambi/Bolaffi/Wannenes/Libero, non
// solo dei canali con lo stesso nome) non avrebbe avuto nulla da mostrare
// nei select origine/destinazione. Dato di riferimento (non demo), deve
// esistere in QUALSIASI database reale - stessi 4 nomi delle case d'asta
// fisiche gia' presenti come canali in CANALI_INIZIALI, piu' "Deposito"
// come ubicazione di partenza di default.
export const UBICAZIONI_INIZIALI: (typeof ubicazioni.$inferInsert)[] = [
  { nome: "Deposito", tipo: "deposito" },
  { nome: "Cambi", tipo: "asta_fisica" },
  { nome: "Bolaffi", tipo: "asta_fisica" },
  { nome: "Wannenes", tipo: "asta_fisica" },
  { nome: "Libero", tipo: "asta_fisica" },
];

// Stessa firma "larga" di seedCanaliBase (canali-base.ts) - accetta sia il
// client node-postgres (Neon/Postgres reale) sia PGlite (sviluppo).
// Idempotente (onConflictDoNothing sulla colonna nome, unique).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedUbicazioniBase(db: any) {
  await db.insert(ubicazioni).values(UBICAZIONI_INIZIALI).onConflictDoNothing();
}
