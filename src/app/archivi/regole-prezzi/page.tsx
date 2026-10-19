import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK, CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT } from "@/lib/catawiki-config";
import { SHOPIFY_SCONTO_SU_EBAY } from "@/lib/shopify-export";
import { EBAY_OFFERTA_MINIMA_PERCENTUALE } from "@/lib/regole-prezzi";
import { FASCE_QUANTITA, QUANTITA_MASSIMA_VISIBILE } from "@/lib/esposizione";

// Pagina di riferimento (2026-10-19): da quale campo dello sku nasce il prezzo
// di ogni portale e quali soglie valgono. I numeri arrivano dalle stesse
// costanti usate per generare i file, quindi non possono andare fuori sincrono.
export const dynamic = "force-static";

const virgola = (n: number) => String(n).replace(".", ",");

export default function RegolePrezziPage() {
  const fasce = FASCE_QUANTITA.map((f, i) => {
    const da = i === 0 ? 1 : FASCE_QUANTITA[i - 1].fino + 1;
    return f.fino === Infinity ? `${da} o più → ${f.pezzi}` : `${da}-${f.fino} → ${f.pezzi}`;
  }).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regole prezzi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Da quale campo dello sku nasce il prezzo di ogni portale. I numeri sono quelli veri usati dal software.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prezzo eBay: il prezzo di partenza</CardTitle>
          <CardDescription>Se è vuoto, lo sku non va su eBay, Shopify né Subito. Non esiste nessun prezzo di ripiego.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Portale</th>
                <th className="py-2 font-medium">Prezzo che viene usato</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-2 [&_td]:align-top [&_tr]:border-b last:[&_tr]:border-0">
              <tr>
                <td className="pr-4 font-medium">eBay</td>
                <td>
                  Prezzo eBay così com&apos;è. Offerta minima accettata: {EBAY_OFFERTA_MINIMA_PERCENTUALE}% del prezzo (regola del Master;
                  l&apos;output eBay nel software non è ancora costruito).
                </td>
              </tr>
              <tr>
                <td className="pr-4 font-medium">Shopify</td>
                <td>Prezzo eBay × {virgola(SHOPIFY_SCONTO_SU_EBAY)}, arrotondato all&apos;euro per eccesso (es. 100 € → 90 €, 95 € → 86 €).</td>
              </tr>
              <tr>
                <td className="pr-4 font-medium">Subito</td>
                <td>Stesso prezzo eBay. Non esiste un campo prezzo Subito.</td>
              </tr>
              <tr>
                <td className="pr-4 font-medium">Etsy</td>
                <td>Portale non attivo nel software (segue Shopify con la sincronizzazione esterna).</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prezzo e riserva Catawiki (aste)</CardTitle>
          <CardDescription>I prezzi dei lotti si possono cambiare per quel solo batch, senza toccare lo sku.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Stima del lotto</strong> = Prezzo Catawiki (o il prezzo scritto sul lotto nel batch), più l&apos;eventuale percentuale del batch.
            Se la stima finale è sotto <strong>{CATAWIKI_SOGLIA_MINIMA_STIMA_IMPORT} €</strong> il lotto viene scartato; se il prezzo manca, idem.
          </p>
          <p>
            <strong>Riserva</strong> (se nel batch è attiva), in quest&apos;ordine: 1) la riserva scritta sul lotto nel batch; 2) la riserva
            scritta sullo sku (campo &quot;Riserva Catawiki&quot;, da STOCK FP/CV): se è compilata viene sempre rispettata; 3) solo se mancano
            entrambe, il <strong>{Math.round(CATAWIKI_MOLTIPLICATORE_RISERVA_FALLBACK * 100)}% della stima</strong>. Sopra si aggiunge l&apos;eventuale
            modificatore in euro del batch. Mai 0: se il risultato è zero o negativo, la riserva resta vuota.
          </p>
          <p className="text-muted-foreground">
            Altri requisiti Catawiki: anno compilato e almeno una foto (il file riempie fino al numero minimo di foto ripetendo la copertina).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quantità sui portali fissi</CardTitle>
          <CardDescription>Dal disponibile libero (totale a magazzino meno quanto è impegnato nelle aste).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Disponibile libero → pezzi da caricare: {fasce} (massimo {QUANTITA_MASSIMA_VISIBILE}). <strong>Subito: sempre 1.</strong>
          </p>
          <p className="text-muted-foreground">
            La quantità caricata non viene mai aumentata da sola: viene segnalata solo se supera il disponibile (&quot;Da abbassare&quot;).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Se cambi un prezzo</CardTitle>
          <CardDescription>Il software ricorda il prezzo con cui ogni sku è online su ogni portale fisso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Cambiando il prezzo eBay cambiano anche Shopify e Subito. Sulla pagina di ogni portale fisso, in{" "}
            <strong>&quot;Da riprezzare&quot;</strong>, compaiono gli sku il cui prezzo di oggi è diverso da quello caricato: cambiali sul portale e
            premi &quot;Conferma prezzo aggiornato&quot;.
          </p>
          <p className="text-muted-foreground">
            Gli sku già caricati prima di questa funzione non hanno un prezzo ricordato: iniziano a essere controllati alla prima conferma
            (o quando si importa la situazione dal Master).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Valore di carico</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">Costo interno, facoltativo. Non va su nessun portale.</CardContent>
      </Card>
    </div>
  );
}
