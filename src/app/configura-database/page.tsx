"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Schermata di primo avvio: si incolla la stringa di connessione al
// database (Neon). Viene verificata e salvata dall'API
// /api/configura-database; poi serve riaprire l'app per collegarsi.
export default function ConfiguraDatabasePage() {
  const [url, setUrl] = useState("");
  const [stato, setStato] = useState<"attesa" | "verifica" | "fatto">("attesa");
  const [errore, setErrore] = useState("");

  const [riavvioFallito, setRiavvioFallito] = useState(false);

  async function riavvia() {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setRiavvioFallito(true);
    }
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    setStato("verifica");
    try {
      const res = await fetch("/api/configura-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const dati = (await res.json()) as { ok: boolean; errore?: string };
      if (dati.ok) {
        setUrl("");
        setStato("fatto");
      } else {
        setErrore(dati.errore ?? "Errore sconosciuto.");
        setStato("attesa");
      }
    } catch {
      setErrore("Il programma interno non risponde. Chiudi e riapri l'app.");
      setStato("attesa");
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-1 items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Collega il database</CardTitle>
          <CardDescription>
            Al primo avvio serve la stringa di connessione del database (quella che inizia con
            postgresql://). Si incolla una volta sola, resta salvata su questo Mac.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stato === "fatto" ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">Collegamento verificato e salvato.</p>
              <p>
                Ora riavvia l&apos;app: al riavvio creo le tabelle da solo e trovi il magazzino
                pronto (il primo avvio puo&apos; richiedere circa 30 secondi).
              </p>
              <Button type="button" onClick={riavvia}>
                Riavvia ora
              </Button>
              {riavvioFallito ? (
                <p className="text-muted-foreground">
                  Non riesco a riavviare da solo: chiudi l&apos;app (Cmd+Q) e riaprila.
                </p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={salva} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Stringa di connessione</Label>
                <Input
                  id="url"
                  type="password"
                  autoComplete="off"
                  placeholder="postgresql://..."
                  value={url}
                  onChange={(ev) => setUrl(ev.target.value)}
                  required
                />
              </div>
              {errore ? <p className="text-sm text-destructive">{errore}</p> : null}
              <Button type="submit" disabled={stato === "verifica" || url.trim() === ""}>
                {stato === "verifica" ? "Verifico la connessione..." : "Verifica e salva"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
