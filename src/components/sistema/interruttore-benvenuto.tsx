"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  EVENTO_MOSTRA_BENVENUTO,
  EVENTO_PREFERENZA_BENVENUTO,
  benvenutoNascosto,
  impostaBenvenutoNascosto,
} from "@/lib/benvenuto-preferenza";

function sottoscrivi(cb: () => void) {
  window.addEventListener(EVENTO_PREFERENZA_BENVENUTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO_PREFERENZA_BENVENUTO, cb);
    window.removeEventListener("storage", cb);
  };
}

export function InterruttoreBenvenuto() {
  const nascosto = useSyncExternalStore(sottoscrivi, benvenutoNascosto, () => false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!nascosto}
          onChange={(e) => impostaBenvenutoNascosto(!e.target.checked)}
          className="size-4"
        />
        Mostra la guida iniziale quando apro l&apos;app
      </label>
      <Button type="button" variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(EVENTO_MOSTRA_BENVENUTO))}>
        Mostrala adesso
      </Button>
    </div>
  );
}
