"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// I campi con i segreti sono di tipo "password" (non leggibili a schermo) e
// vengono svuotati subito dopo l'invio: non restano nella pagina.
export function ShopifyForm() {
  const [shop, setShop] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [stato, setStato] = useState<"attesa" | "verifica" | "fatto">("attesa");
  const [errore, setErrore] = useState("");

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    setStato("verifica");
    try {
      const res = await fetch("/api/configura-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, clientId, clientSecret }),
      });
      const dati = (await res.json()) as { ok: boolean; errore?: string };
      if (dati.ok) {
        setShop("");
        setClientId("");
        setClientSecret("");
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
    <form onSubmit={salva} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shop">Negozio</Label>
        <Input
          id="shop"
          autoComplete="off"
          placeholder="nome-negozio.myshopify.com"
          value={shop}
          onChange={(ev) => setShop(ev.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="client-id">Client ID</Label>
        <Input
          id="client-id"
          type="password"
          autoComplete="off"
          value={clientId}
          onChange={(ev) => setClientId(ev.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="client-secret">Client secret</Label>
        <Input
          id="client-secret"
          type="password"
          autoComplete="off"
          value={clientSecret}
          onChange={(ev) => setClientSecret(ev.target.value)}
          required
        />
      </div>
      {errore ? <p className="text-sm text-destructive">{errore}</p> : null}
      {stato === "fatto" ? (
        <p className="text-sm font-medium">
          Credenziali verificate con Shopify e salvate. Il caricamento foto e&apos; attivo.
        </p>
      ) : null}
      <Button type="submit" disabled={stato === "verifica"}>
        {stato === "verifica" ? "Verifico con Shopify..." : "Verifica e salva"}
      </Button>
    </form>
  );
}
