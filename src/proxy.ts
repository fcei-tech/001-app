import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Primo avvio dell'app nativa: se non e' ancora stata inserita la
// credenziale del database (DATABASE_URL, letta dal file di configurazione
// dal guscio Tauri - vedi src-tauri/src/main.rs), qualsiasi pagina porta
// alla schermata "Collega il database". In sviluppo (npm run dev) non
// interviene: li' si usa il database locale di prova.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" || process.env.DATABASE_URL) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/configura-database", request.url));
}

export const config = {
  // Esclude la schermata stessa, la sua API, i file interni di Next.js e
  // qualsiasi file con estensione (icone, immagini, font).
  matcher: ["/((?!configura-database|api/configura-database|_next|.*\\..*).*)"],
};
