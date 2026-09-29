// Fascia colore canale a 4 righe orizzontali per eBay statico/eBay Asta
// (2026-09-29, richiesta esplicita cliente dopo il bordo colorato piu'
// spesso - opzione C, SPESSORE_BORDO_CANALE_PX in colori-canali.ts - MA
// eBay ha 2 canali distinti con la stessa famiglia di colore brand, quindi
// diventano 4 fasce orizzontali con i 4 colori del logo eBay, in ordine
// invertito fra i due canali per distinguerli a colpo d'occhio).
//
// Deliberatamente NON un CSS border-image (bug reale trovato in fase di
// mockup e mostrato in chat: la fascia sconfinava oltre l'angolo arrotondato
// della card - "ebay deve stare nello spazio di opzione c e non
// sconfinare!" - causato dal clipping inaffidabile di border-image su
// border-radius, un problema di rendering cross-engine particolarmente
// sentito su WKWebView, lo stesso motore dell'app desktop Mac di questo
// progetto). Qui invece: un blocco assoluto largo ESATTAMENTE
// SPESSORE_BORDO_CANALE_PX, tagliato dal bordo arrotondato del contenitore
// grazie a overflow-hidden - nessuno sconfinamento possibile per
// costruzione, il blocco non e' mai piu' largo del contenitore che lo
// clippa.
//
// Il contenitore chiamante DEVE avere "relative overflow-hidden" e riservare
// SPESSORE_BORDO_CANALE_PX di spazio a sinistra (padding, non margin - vedi
// i 3 punti d'uso in src/app/pubblicazione/page.tsx,
// src/app/pubblicazione/[canaleId]/page.tsx e
// src/app/pubblicazione/[canaleId]/[batchId]/page.tsx) cosi' il testo non ci
// finisce sotto.
import { fasceCanale } from "@/lib/colori-canali";

export function BarraCanale({ nomeCanale }: { nomeCanale: string }) {
  const fasce = fasceCanale(nomeCanale);
  if (!fasce) return null;
  return (
    // w-5 (20px) = SPESSORE_BORDO_CANALE_PX - vedi nota sulla costante in
    // colori-canali.ts (Tailwind non puo' leggerla a runtime).
    <div className="pointer-events-none absolute inset-y-0 left-0 flex w-5 flex-col" aria-hidden>
      {fasce.map((colore, i) => (
        <span key={i} className="flex-1" style={{ backgroundColor: colore }} />
      ))}
    </div>
  );
}
