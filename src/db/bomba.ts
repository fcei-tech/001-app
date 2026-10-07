import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { configFilePath } from "@/lib/app-config";

// "Bomba": cancella TUTTO dal database (tabelle, tipi, registro delle
// migrazioni) e la credenziale salvata su questo Mac. Non tocca foto su
// Shopify, ne' file di backup, ne' il progetto Neon.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualunque = any;

export async function eseguiBomba(): Promise<void> {
  await (db as Qualunque).transaction(async (tx: Qualunque) => {
    const t = await tx.execute(sql`select tablename from pg_tables where schemaname = 'public'`);
    for (const r of t.rows as { tablename: string }[]) {
      await tx.execute(sql.raw(`DROP TABLE IF EXISTS "public"."${r.tablename.replace(/"/g, "")}" CASCADE`));
    }
    const e = await tx.execute(
      sql`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'`
    );
    for (const r of e.rows as { typname: string }[]) {
      await tx.execute(sql.raw(`DROP TYPE IF EXISTS "public"."${r.typname.replace(/"/g, "")}" CASCADE`));
    }
    await tx.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  });
  try {
    fs.rmSync(configFilePath(), { force: true });
  } catch {
    // la pagina avvisa se il file resta
  }
}
