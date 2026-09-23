import "dotenv/config";
import { db } from "./index";
import { tipiOggetto, ubicazioni, sku, movimentiMagazzino } from "./schema";
import { seedCanaliBase } from "./canali-base";

async function main() {
  console.log("Seed: vocabolari iniziali...");

  const [poster] = await db
    .insert(tipiOggetto)
    .values({ nome: "Poster" })
    .onConflictDoNothing()
    .returning();

  const ubicazioniIniziali = [
    { nome: "Deposito", tipo: "deposito" },
    { nome: "Cambi", tipo: "asta_fisica" },
    { nome: "Bolaffi", tipo: "asta_fisica" },
    { nome: "Wannenes", tipo: "asta_fisica" },
  ];
  await db.insert(ubicazioni).values(ubicazioniIniziali).onConflictDoNothing();

  // Canali (modulo Pubblicazione): lista condivisa con src/db/canali-base.ts,
  // richiamata anche automaticamente ad ogni avvio da src/db/index.ts - qui
  // resta solo per completezza dello script demo, non e' piu' l'unica via.
  await seedCanaliBase(db);

  const tipoPoster =
    poster ?? (await db.query.tipiOggetto.findFirst({ where: (t, { eq }) => eq(t.nome, "Poster") }));
  const deposito = await db.query.ubicazioni.findFirst({
    where: (u, { eq }) => eq(u.nome, "Deposito"),
  });
  const cambi = await db.query.ubicazioni.findFirst({
    where: (u, { eq }) => eq(u.nome, "Cambi"),
  });

  if (!tipoPoster || !deposito) throw new Error("Seed vocabolari fallito");

  const campioni = [
    { skuCode: "Z-00001", artista: "Anonymous", opera: "Manifesto di prova", larghezza: "70.0", altezza: "100.0", supporto: "CARTA", anno: "circa 1965", condizione: "A-" as const, prezzoEbay: "120.00", qty: 3, bloccato: false },
    { skuCode: "Z-00002", artista: "Herbert Leupin", opera: "Cinzano", larghezza: "90.5", altezza: "128.0", supporto: "TELATO", anno: "circa 1958", condizione: "A" as const, prezzoEbay: "480.00", qty: 1, bloccato: false },
    { skuCode: "Z-00003", artista: "Armando Testa", opera: "Punt e Mes", larghezza: "70.0", altezza: "100.0", supporto: "CARTA", anno: "circa 1970", condizione: "B+" as const, prezzoEbay: "210.00", qty: 2, bloccato: false },
    { skuCode: "Z-00004", artista: "Anonymous", opera: "Ferrovie dello Stato", larghezza: "62.0", altezza: "98.0", supporto: "CARTA", anno: "circa 1955", condizione: "B" as const, prezzoEbay: "95.00", qty: 0, bloccato: false },
    { skuCode: "Z-00005", artista: "Franz Lenhart", opera: "Merano", larghezza: "68.0", altezza: "104.0", supporto: "CARTA", anno: "circa 1948", condizione: "A-" as const, prezzoEbay: "310.00", qty: 1, bloccato: true },
  ];

  for (const c of campioni) {
    const existing = await db.query.sku.findFirst({ where: (s, { eq }) => eq(s.skuCode, c.skuCode) });
    if (existing) continue;

    const [nuovo] = await db
      .insert(sku)
      .values({
        skuCode: c.skuCode,
        artista: c.artista,
        opera: c.opera,
        larghezza: c.larghezza,
        altezza: c.altezza,
        supporto: c.supporto,
        anno: c.anno,
        condizione: c.condizione,
        tipoId: tipoPoster.id,
        prezzoEbay: c.prezzoEbay,
        bloccatoVendita: c.bloccato,
      })
      .returning();

    if (c.qty > 0) {
      await db.insert(movimentiMagazzino).values({
        skuId: nuovo.id,
        proprieta: "FP",
        ubicazioneId: deposito.id,
        causale: "carico",
        quantitaDelta: c.qty,
        note: "Carico iniziale di prova",
      });
    }
  }

  if (cambi) {
    const z2 = await db.query.sku.findFirst({ where: (s, { eq }) => eq(s.skuCode, "Z-00002") });
    if (z2) {
      await db.insert(movimentiMagazzino).values([
        { skuId: z2.id, proprieta: "CV", ubicazioneId: cambi.id, causale: "carico", quantitaDelta: 1, note: "Candidato asta Cambi" },
      ]);
    }
  }

  console.log("Seed completato: sku di esempio verificati/creati.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
