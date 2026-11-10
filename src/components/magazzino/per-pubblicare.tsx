import { Check, CircleAlert } from "lucide-react";

// Etichetta "serve per pubblicare" (ambra) che diventa verde quando il dato e'
// a posto. Usata nel form "Nuovo sku".
export function PerPubblicare({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300")
      }
    >
      {ok ? <Check className="size-3" /> : <CircleAlert className="size-3" />}
      {ok ? "ok per pubblicare" : "serve per pubblicare"}
    </span>
  );
}
