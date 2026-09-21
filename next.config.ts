import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @electric-sql/pglite e' usato SOLO nella variante di prova locale
  // (vedi src/db/index.ts) - va caricato nativamente, non impacchettato.
  serverExternalPackages: ["@electric-sql/pglite"],

  // "standalone": Next.js produce in .next/standalone un server Node
  // autosufficiente (senza bisogno di node_modules a fianco). E' l'output
  // che il guscio Tauri (src-tauri/) impacchetta dentro l'app nativa Mac,
  // vedi RELEASE.md per il flusso completo.
  output: "standalone",

  // Le migrazioni del database (cartella "drizzle": file SQL che creano le
  // tabelle al primo collegamento) vengono lette a runtime, non importate:
  // senza questa riga Next.js non le copierebbe dentro .next/standalone.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
