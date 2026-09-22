"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

// Rete di sicurezza per qualsiasi pagina che legge dal database (Magazzino,
// dettaglio sku, movimenti...): se la query fallisce - credenziale Neon
// revocata o sbagliata, database irraggiungibile, connessione scaduta -
// senza questo file l'utente vedrebbe la schermata di errore generica di
// Next.js ("Application error: a client-side exception has occurred"),
// senza nessuna indicazione su cosa fare. Qui si riconoscono i casi tipici
// di problema database e si rimanda dritti a Impostazioni invece di lasciare
// l'utente bloccato. Non sostituisce la schermata "Collega il database"
// (src/proxy.ts): quella scatta PRIMA, quando manca del tutto la
// configurazione; questa scatta DOPO, quando la configurazione c'e' ma non
// funziona piu' (es. il socio a cui e' stato revocato l'accesso, vedi
// indice progetto/architettura_installata_locale_SOSTITUISCE_web_app).
function sembraErroreDatabase(messaggio: string): boolean {
  const m = messaggio.toLowerCase();
  return [
    "econnrefused",
    "enotfound",
    "etimedout",
    "connection terminated",
    "timeout expired",
    "password authentication failed",
    "terminating connection",
    "server closed the connection",
    "self-signed certificate",
    "sasl",
    "role \"", // "role \"xyz\" does not exist"
    "database", // fallback ampio: molti errori pg contengono "database"
  ].some((frammento) => m.includes(frammento));
}

export default function ErroreMagazzino({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Resta nei log del processo interno (visibili nel report diagnostico
    // dell'app, vedi src-tauri/src/main.rs > push_log), utile se il
    // problema va segnalato in chat.
    console.error("[errore pagina]", error);
  }, [error]);

  const problemaDatabase = sembraErroreDatabase(error.message ?? "");

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              <CardTitle>
                {problemaDatabase ? "Il database non risponde" : "Si e' verificato un errore"}
              </CardTitle>
            </div>
            <CardDescription>
              {problemaDatabase
                ? "La connessione al database configurata su questo Mac non funziona piu' (credenziale cambiata o revocata, oppure il database non e' raggiungibile in questo momento)."
                : "Qualcosa non ha funzionato in questa pagina. Puoi riprovare, oppure tornare al Magazzino."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {problemaDatabase ? (
              <p className="text-sm text-muted-foreground">
                Controlla la stringa di connessione in Impostazioni. Se il database e&apos; stato
                spostato o la credenziale revocata, va inserita quella nuova.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => reset()}>Riprova</Button>
              {problemaDatabase ? (
                <Button variant="secondary" asChild>
                  <Link href="/impostazioni">Vai a Impostazioni</Link>
                </Button>
              ) : (
                <Button variant="secondary" asChild>
                  <Link href="/">Torna al Magazzino</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
