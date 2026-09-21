"use client";

// Controllo aggiornamenti automatico - SOLO quando l'app gira come
// programma nativo Mac (Tauri). In sviluppo/browser normale questo
// componente non fa nulla (le API @tauri-apps/* non esistono li').
//
// Comportamento: al primo caricamento controlla in silenzio se su
// GitHub Releases c'e' una versione piu' nuova di quella installata
// (vedi src-tauri/tauri.conf.json > plugins.updater.endpoints). Se si',
// mostra una fascia in basso con un pulsante "Aggiorna e riavvia".
// Se il controllo fallisce (es. niente internet in quel momento) non
// succede nulla di visibile: l'app continua a funzionare normalmente
// e riprovera' al prossimo avvio.
//
// Vedi RELEASE.md per come si pubblica una nuova versione.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string }
  | { status: "downloading" }
  | { status: "error" };

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return; // non siamo dentro l'app nativa: niente da fare
    }

    let cancelled = false;

    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!cancelled && update?.available) {
          setState({ status: "available", version: update.version });
        }
      } catch {
        // Nessun internet, GitHub momentaneamente irraggiungibile, o
        // altro problema transitorio: si ignora, l'app resta comunque
        // usabile con la versione gia' installata.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "idle") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t bg-secondary px-4 py-2 text-sm text-secondary-foreground">
      {state.status === "available" && (
        <>
          <span>E&apos; disponibile la versione {state.version}.</span>
          <Button
            size="sm"
            onClick={async () => {
              setState({ status: "downloading" });
              try {
                const { check } = await import("@tauri-apps/plugin-updater");
                const { relaunch } = await import("@tauri-apps/plugin-process");
                const update = await check();
                if (update?.available) {
                  await update.downloadAndInstall();
                  await relaunch();
                }
              } catch {
                setState({ status: "error" });
              }
            }}
          >
            Aggiorna e riavvia
          </Button>
        </>
      )}
      {state.status === "downloading" && <span>Aggiornamento in corso...</span>}
      {state.status === "error" && (
        <span>Aggiornamento non riuscito, riprova piu&apos; tardi.</span>
      )}
    </div>
  );
}
