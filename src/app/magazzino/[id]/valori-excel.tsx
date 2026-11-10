import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ripristinaDaExcelAction } from "@/app/magazzino/actions";

const ETICHETTE: Record<string, string> = {
  artista: "Artista",
  opera: "Opera",
  larghezza: "Larghezza (cm)",
  altezza: "Altezza (cm)",
  supporto: "Supporto",
  anno: "Anno / epoca",
  note: "Note",
  valoreCarico: "Valore di carico",
  prezzoEbay: "Prezzo eBay",
  prezzoCatawiki: "Prezzo Catawiki",
  riservaCatawiki: "Riserva Catawiki",
};

function diverso(a: string | null, b: string): boolean {
  if (a === null || a === "") return true;
  const x = Number.parseFloat(a);
  const y = Number.parseFloat(b);
  if (Number.isFinite(x) && Number.isFinite(y) && /^-?[0-9.,\s]+$/.test(a) && /^-?[0-9.,\s]+$/.test(b)) return x !== y;
  return a.trim() !== b.trim();
}

// Campi che in BATCH hai cambiato rispetto all'ultimo valore letto da Excel
// (regola dei tre valori, Release 10): da qui li puoi riportare al valore Excel.
export function ValoriExcel({ skuId, attuali, daExcel }: { skuId: number; attuali: Record<string, string | null>; daExcel: Record<string, string> }) {
  const voci = Object.keys(ETICHETTE)
    .filter((c) => daExcel[c] !== undefined && diverso(attuali[c] ?? null, daExcel[c]))
    .map((c) => ({ campo: c, etichetta: ETICHETTE[c], attuale: attuali[c] ?? null, excel: daExcel[c] }));
  if (voci.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Diverso dall&apos;ultimo Excel</CardTitle>
        <CardDescription>
          Questi campi li hai modificati in BATCH: il tuo valore resta anche se reimporti il file. Puoi riportare un campo al valore letto da Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {voci.map((v) => (
          <form key={v.campo} action={ripristinaDaExcelAction} className="flex flex-wrap items-center gap-3 px-6 py-2 text-sm">
            <input type="hidden" name="id" value={skuId} />
            <input type="hidden" name="campo" value={v.campo} />
            <span className="w-36 font-medium">{v.etichetta}</span>
            <span className="min-w-0 flex-1">
              ora <b>{v.attuale || "vuoto"}</b> · Excel <b>{v.excel}</b>
            </span>
            <Button type="submit" size="sm" variant="outline">Ripristina da Excel</Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
