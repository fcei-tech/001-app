"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setCanaleAttivoAction } from "@/app/archivi/portali/actions";

export function InterruttorePortale({ canaleId, attivo }: { canaleId: number; attivo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {errore && <span className="text-xs text-destructive">{errore}</span>}
      <Button
        type="button"
        size="sm"
        variant={attivo ? "outline" : "default"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErrore(null);
            const e = await setCanaleAttivoAction(canaleId, !attivo);
            if (!e.ok) setErrore(e.errore ?? "Errore");
            router.refresh();
          })
        }
      >
        {attivo ? "Disattiva" : "Attiva"}
      </Button>
    </div>
  );
}
