import Link from "next/link";
import { getRegolePrezzi } from "@/db/impostazioni-app-queries";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { getFotoSku, getProprietariAttivi, getSkuById, getTipiOggetto, getUbicazioniAttive } from "@/db/queries";
import { getTagBrevi, getTagIdsDiSku } from "@/db/tag-queries";
import { leggiValori } from "@/lib/campi-personalizzati";
import { getCampiPersonalizzati } from "@/db/campi-personalizzati-queries";
import { NuovoSkuFlow, type DuplicaDa } from "./nuovo-sku-flow";

// Questa pagina legge dal database: va costruita a ogni richiesta, mai
// "pre-generata" durante la build (in build il database non esiste).
export const dynamic = "force-dynamic";

export default async function NuovoSkuPage({ searchParams }: { searchParams: Promise<{ duplica?: string }> }) {
  const sp = await searchParams;
  const duplicaId = Number(sp.duplica);
  const regole = await getRegolePrezzi();
  const [tipi, ubicazioni, proprietari, campiPersonalizzati, tuttiTag] = await Promise.all([
    getTipiOggetto(),
    getUbicazioniAttive(),
    getProprietariAttivi(),
    getCampiPersonalizzati(),
    getTagBrevi(),
  ]);
  const famiglie = tuttiTag.filter((t) => t.tipo === "soggetto").map((t) => ({ id: t.id, nome: t.nome }));
  const tagInterni = tuttiTag.filter((t) => t.tipo === "interno").map((t) => ({ id: t.id, nome: t.nome }));

  // Duplica: lo sku di partenza (nessun salvataggio finche' non si preme Salva).
  let duplicaDa: DuplicaDa | undefined;
  if (Number.isInteger(duplicaId) && duplicaId > 0) {
    const [origine, tagIdsOrigine, fotoOrigine] = await Promise.all([getSkuById(duplicaId), getTagIdsDiSku(duplicaId), getFotoSku(duplicaId)]);
    if (origine) {
      const idSoggetto = new Set(famiglie.map((f) => f.id));
      duplicaDa = {
        id: origine.id,
        skuCode: origine.skuCode,
        artista: origine.artista,
        opera: origine.opera,
        larghezza: origine.larghezza,
        altezza: origine.altezza,
        supporto: origine.supporto,
        anno: origine.anno,
        note: origine.note,
        tipoId: origine.tipoId,
        condizione: origine.condizione,
        valoreCarico: origine.valoreCarico,
        prezzoEbay: origine.prezzoEbay,
        prezzoCatawiki: origine.prezzoCatawiki,
        riservaCatawiki: origine.riservaCatawiki,
        prezzoShopify: origine.prezzoShopify,
        prezzoSubito: origine.prezzoSubito,
        prezzoBidspirit: origine.prezzoBidspirit,
        riservaBidspirit: origine.riservaBidspirit,
        valoriCampi: leggiValori(origine.campiPersonalizzati),
        tagIds: tagIdsOrigine.filter((id) => idSoggetto.has(id)),
        tagInterniIds: tagIdsOrigine.filter((id) => tagInterni.some((t) => t.id === id)),
        numeroFoto: fotoOrigine.length,
      };
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href={duplicaDa ? `/magazzino/${duplicaDa.id}` : "/"}>
            <ArrowLeft /> {duplicaDa ? "Torna alla scheda" : "Torna al Magazzino"}
          </Link>
        </Button>
        <NuovoSkuFlow tipi={tipi} ubicazioni={ubicazioni} proprietari={proprietari} regole={regole} campiPersonalizzati={campiPersonalizzati} famiglie={famiglie} tagInterni={tagInterni} duplicaDa={duplicaDa} />
      </main>
    </div>
  );
}
