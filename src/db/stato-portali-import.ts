import { db } from "./index";
import { getBaseSku } from "./esposizione-queries";
import { bloccoSkuCanale, esposizioneCanale } from "./schema";
import { disponibileLibero, quantitaDaCaricare } from "@/lib/esposizione";
import { type StatoSkuMaster } from "@/lib/master-stato-portali";

export type AnteprimaStatoPortali = {
  skuNelFile: number;
  skuTrovati: number;
  skuNonTrovati: number;
  esempiNonTrovati: string[];
  portali: { nome: string; presenteNelSoftware: boolean; blocchiNuovi: number; caricatiNuovi: number; giaPresenti: number }[];
};

type Piano = {
  anteprima: AnteprimaStatoPortali;
  blocchi: { skuId: number; canaleId: number }[];
  caricati: { skuId: number; canaleId: number; quantita: number }[];
};

async function costruisciPiano(stato: StatoSkuMaster[]): Promise<Piano> {
  const [tuttiCanali, base, bloccoEsistenti, esposizioneEsistente] = await Promise.all([
    db.query.canali.findMany(),
    getBaseSku(),
    db.select().from(bloccoSkuCanale),
    db.select().from(esposizioneCanale),
  ]);
  const perCodice = new Map(base.map((b) => [b.skuCode, b]));
  const bloccoSet = new Set(bloccoEsistenti.map((b) => `${b.skuId}:${b.canaleId}`));
  const espostoSet = new Set(esposizioneEsistente.map((e) => `${e.skuId}:${e.canaleId}`));
  const nomiPortali = ["Shopify", "eBay", "Etsy", "Subito"];

  const piano: Piano = {
    anteprima: {
      skuNelFile: stato.length,
      skuTrovati: 0,
      skuNonTrovati: 0,
      esempiNonTrovati: [],
      portali: [],
    },
    blocchi: [],
    caricati: [],
  };
  const conteggi = new Map(
    nomiPortali.map((n) => [n, { blocchiNuovi: 0, caricatiNuovi: 0, giaPresenti: 0 }])
  );

  for (const st of stato) {
    const b = perCodice.get(st.skuCode);
    if (!b) {
      piano.anteprima.skuNonTrovati++;
      if (piano.anteprima.esempiNonTrovati.length < 8) piano.anteprima.esempiNonTrovati.push(st.skuCode);
      continue;
    }
    piano.anteprima.skuTrovati++;
    for (const nome of nomiPortali) {
      const canale = tuttiCanali.find((c) => c.nome === nome);
      if (!canale) continue;
      const cont = conteggi.get(nome)!;
      const chiave = `${b.id}:${canale.id}`;
      if (st.bloccato[nome]) {
        if (bloccoSet.has(chiave)) cont.giaPresenti++;
        else {
          cont.blocchiNuovi++;
          piano.blocchi.push({ skuId: b.id, canaleId: canale.id });
        }
      }
      if (st.caricato[nome]) {
        if (espostoSet.has(chiave)) cont.giaPresenti++;
        else {
          cont.caricatiNuovi++;
          // Il Master non ricorda quanti pezzi erano online: si parte dalla
          // fascia del disponibile di adesso (minimo 1: lo sku e' online).
          const libero = disponibileLibero(b.disponibile, b.impegnato);
          piano.caricati.push({
            skuId: b.id,
            canaleId: canale.id,
            quantita: Math.max(1, quantitaDaCaricare(libero, canale.impostazioni)),
          });
        }
      }
    }
  }
  piano.anteprima.portali = nomiPortali.map((nome) => ({
    nome,
    presenteNelSoftware: tuttiCanali.some((c) => c.nome === nome),
    ...conteggi.get(nome)!,
  }));
  return piano;
}

export async function anteprimaStatoPortali(stato: StatoSkuMaster[]): Promise<AnteprimaStatoPortali> {
  return (await costruisciPiano(stato)).anteprima;
}

function aBlocchi<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Importa SOLO cio' che non c'e' ancora (onConflictDoNothing): rilanciare
// l'import non sovrascrive mai quanto registrato dopo nel software.
export async function importaStatoPortali(
  stato: StatoSkuMaster[]
): Promise<{ blocchiCreati: number; caricatiRegistrati: number }> {
  const piano = await costruisciPiano(stato);
  await db.transaction(async (tx) => {
    for (const parte of aBlocchi(piano.blocchi, 500)) {
      await tx.insert(bloccoSkuCanale).values(parte).onConflictDoNothing();
    }
    for (const parte of aBlocchi(piano.caricati, 500)) {
      await tx
        .insert(esposizioneCanale)
        .values(parte.map((c) => ({ skuId: c.skuId, canaleId: c.canaleId, quantitaCaricata: c.quantita })))
        .onConflictDoNothing();
    }
  });
  return { blocchiCreati: piano.blocchi.length, caricatiRegistrati: piano.caricati.length };
}
