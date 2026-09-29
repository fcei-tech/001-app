import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { listaSilenziamentiTutti } from "@/db/silenziamenti-queries";
import { getFotoPerSkuIds } from "@/db/queries";
import {
  risolviLottoCatawiki,
  IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT,
  ETICHETTA_ERRORE_VALIDAZIONE,
  TIPI_ERRORE_VALIDAZIONE,
  type TipoErroreValidazione,
} from "@/lib/catawiki-resolver";
import { TabellaSilenziamenti, type RigaSilenziamento } from "@/components/pubblicazione/tabella-silenziamenti";

const TIPI_ERRORE_VALIDAZIONE_SET = new Set<string>(TIPI_ERRORE_VALIDAZIONE);

function formatData(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const dynamic = "force-dynamic";

// Pagina dedicata "Silenziamenti" (2026-09-28, generazione output Catawiki -
// vedi commento su silenziamentiErrore in schema.ts per il design completo):
// elenco di TUTTI i silenziamenti attivi, indipendentemente dal batch da cui
// sono stati creati (la chiave e' sku+canale+tipoErrore, non batch+lotto) -
// "risolto" e' calcolato QUI, al momento del render, ricalcolando la
// validazione con i dati sku CORRENTI (override:null, impostazioni di
// default: nessuno dei 3 controlli - prezzo/soglia, anno, foto - dipende da
// un batch specifico, vedi risolviLottoCatawiki). Nessuna scrittura durante
// questo render (solo lettura) - la pulizia vera e propria (DELETE) avviene
// sempre da un'azione esplicita (bottone "Pulisci risolti"/"Riattiva" qui, o
// l'effetto collaterale automatico dentro generaFileCatawikiAction per gli
// sku di UN batch appena generato).
export default async function SilenziamentiPage() {
  const silenziamenti = await listaSilenziamentiTutti();
  const skuIds = [...new Set(silenziamenti.map((s) => s.skuId))];
  const fotoMappa = await getFotoPerSkuIds(skuIds);

  const righe: RigaSilenziamento[] = silenziamenti.map((s) => {
    // Il calcolo "risolto" ha senso solo per gli errori del vocabolario
    // Catawiki (oggi l'unico canale che produce silenziamenti) - un
    // tipoErrore ignoto/futuro di un altro canale resta sempre "attivo",
    // nessuna assunzione silenziosa.
    const risolto = TIPI_ERRORE_VALIDAZIONE_SET.has(s.tipoErrore)
      ? !risolviLottoCatawiki(
          {
            batchLottoId: 0,
            skuId: s.skuId,
            skuCode: s.skuCode,
            skuCondizione: s.skuCondizione,
            skuAnno: s.skuAnno,
            skuPrezzoCatawiki: s.skuPrezzoCatawiki,
            override: null,
            numeroFoto: fotoMappa.get(s.skuId)?.length ?? 0,
          },
          IMPOSTAZIONI_BATCH_CATAWIKI_DEFAULT
        ).errori.includes(s.tipoErrore as TipoErroreValidazione)
      : false;

    return {
      id: s.id,
      skuCode: s.skuCode,
      artista: s.artista,
      opera: s.opera,
      canaleNome: s.canaleNome,
      tipoErroreLabel: ETICHETTA_ERRORE_VALIDAZIONE[s.tipoErrore as TipoErroreValidazione] ?? s.tipoErrore,
      note: s.note,
      createdAtFormattato: formatData(s.createdAt),
      risolto,
    };
  });

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Silenziamenti</h1>
          <p className="text-sm text-muted-foreground">
            Errori di validazione accettati per uno sku - restano comunque esclusi dal file, non vengono piu&apos;
            segnalati nel banner della pagina batch. &quot;Risolto&quot; = l&apos;errore non si ripresenta piu&apos;
            con i dati sku attuali.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Silenziamenti attivi</CardTitle>
            <CardDescription>{righe.length} in elenco.</CardDescription>
          </CardHeader>
          <CardContent>
            <TabellaSilenziamenti righe={righe} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
