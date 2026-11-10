import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRegolePrezzi } from "@/db/impostazioni-app-queries";
import { RegolePrezziForm } from "./regole-prezzi-form";

// Pagina Regole prezzi (2026-10-19; resa MODIFICABILE in Release 9,
// 2026-11-10): da quale campo dello sku nasce il prezzo di ogni portale e quali
// soglie valgono. I numeri arrivano dalle stesse regole usate per generare i
// file (tabella impostazioni_app), quindi non possono andare fuori sincrono.
export const dynamic = "force-dynamic";

const virgola = (n: number) => String(n).replace(".", ",");

export default async function RegolePrezziPage() {
  const regole = await getRegolePrezzi();
  const sconto = Math.round((1 - regole.scontoShopify) * 1e4) / 100;
  const fasce = regole.fasceQuantita
    .map((f, i) => {
      const da = i === 0 ? 1 : (regole.fasceQuantita[i - 1].fino ?? 0) + 1;
      return f.fino === null ? `${da} o più → ${f.pezzi}` : `${da}-${f.fino} → ${f.pezzi}`;
    })
    .join(" · ");
  const massimo = regole.fasceQuantita[2].pezzi;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regole prezzi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Da quale campo dello sku nasce il prezzo di ogni portale. I numeri sono quelli veri usati dal software e
          si possono cambiare qui sotto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valori modificabili</CardTitle>
          <CardDescription>
            Valgono per i prossimi file e per i calcoli a schermo. Cambiare lo sconto Shopify cambia il prezzo
            calcolato: gli sku già online con un prezzo diverso compaiono in &quot;Da riprezzare&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegolePrezziForm regole={regole} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prezzi dei portali fissi</CardTitle>
          <CardDescription>
            Ogni portale può avere un prezzo proprio sullo sku. Se è compilato vale quello; se è vuoto vale la regola
            indicata. Se manca anche il prezzo eBay da cui calcolare, lo sku non va su quel portale: non viene
            inventato nessun prezzo.
          </CardDescription>
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
                  Prezzo eBay così com&apos;è. Offerta minima accettata: {virgola(regole.offertaMinimaEbayPercentuale)}% del prezzo.
                </td>
              </tr>
              <tr>
                <td className="pr-4 font-medium">Shopify</td>
                <td>
                  Campo &quot;Prezzo Shopify&quot; dello sku. Se vuoto: prezzo eBay × {virgola(regole.scontoShopify)} (sconto {virgola(sconto)}%),
                  arrotondato all&apos;euro per eccesso (es. 100 € → {Math.ceil(Math.round(100 * regole.scontoShopify * 1e6) / 1e6)} €).
                </td>
              </tr>
              <tr>
                <td className="pr-4 font-medium">Subito</td>
                <td>Campo &quot;Prezzo Subito&quot; dello sku. Se vuoto: stesso prezzo eBay.</td>
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
            Se la stima finale è sotto <strong>{virgola(regole.sogliaMinimaCatawiki)} €</strong> il lotto viene scartato; se il prezzo manca, idem.
          </p>
          <p>
            <strong>Riserva</strong> (se nel batch è attiva), in quest&apos;ordine: 1) la riserva scritta sul lotto nel batch; 2) la riserva
            scritta sullo sku (campo &quot;Riserva Catawiki&quot;, da STOCK FP/CV): se è compilata viene sempre rispettata; 3) solo se mancano
            entrambe, il <strong>{virgola(Math.round(regole.moltiplicatoreRiservaCatawiki * 1e4) / 100)}% della stima</strong>. Sopra si aggiunge l&apos;eventuale
            modificatore in euro del batch. Mai 0: se il risultato è zero o negativo, la riserva resta vuota.
          </p>
          <p className="text-muted-foreground">
            Altri requisiti Catawiki: anno compilato e almeno una foto (il file riempie fino al numero minimo di foto ripetendo la copertina).
          </p>
          <p>
            <strong>Bidspirit</strong>: stesse regole di prezzo e riserva, senza soglia minima. Usa i campi &quot;Prezzo Bidspirit&quot; e
            &quot;Riserva Bidspirit&quot; dello sku; se sono vuoti usa quelli Catawiki.
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
            Disponibile libero → pezzi da caricare: {fasce} (massimo {massimo}). <strong>Subito: sempre 1.</strong>
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
