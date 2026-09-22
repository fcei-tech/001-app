"use client";

// Rete di sicurezza per un errore nel layout radice stesso (non nelle
// pagine: quello lo copre src/app/error.tsx) - caso raro, ma senza questo
// file un errore li' lascerebbe la finestra bianca senza nessun messaggio,
// esattamente il problema gia' risolto per l'avvio del server interno (vedi
// src-tauri/src/main.rs). Next.js richiede che questo file includa i propri
// tag <html>/<body>, non puo' riusare il layout radice (che e' proprio la
// parte che ha fallito).
export default function ErroreGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "-apple-system, sans-serif", padding: 32 }}>
        <h2>Si e&apos; verificato un errore</h2>
        <p style={{ color: "#666", fontSize: 14 }}>
          {error.message || "Errore sconosciuto."}
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Riprova
        </button>
      </body>
    </html>
  );
}
