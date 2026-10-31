import { GestioneTag } from "@/components/tag/gestione-tag";
import { getTagConConteggio } from "@/db/tag-queries";

export const dynamic = "force-dynamic";

export default async function TagPage() {
  const tag = await getTagConConteggio();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Tag</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          L&apos;elenco dei tag che puoi dare agli sku. Si assegnano dalla scheda dello sku o, per più sku insieme, dal Magazzino (seleziona le righe e premi
          &quot;Tag…&quot;). Si usano come filtro in Magazzino e nei portali. I tag &quot;di lavoro&quot; (come res e no res) servono solo a te.
        </p>
      </div>
      <GestioneTag tag={tag} />
    </div>
  );
}
