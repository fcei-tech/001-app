import { proprietari } from "./schema";

// Proprietari di partenza. FP = FP SRL (l'azienda, conta nel valore
// aziendale), CV = i due soci a titolo privato (conto vendita, non conta).
// Altri proprietari (clienti terzi) si creano da Manutenzione o al volo dal
// form di nuovo articolo.
export const PROPRIETARI_INIZIALI: (typeof proprietari.$inferInsert)[] = [
  { nome: "FP", tipo: "azienda", contaValoreAziendale: true },
  { nome: "CV", tipo: "soci", contaValoreAziendale: false },
];

// Come per le ubicazioni: solo a tabella vuota, altrimenti un proprietario
// rinominato o eliminato verrebbe ricreato ad ogni avvio. Su un database
// esistente li ha gia' inseriti la migrazione.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedProprietariBase(db: any) {
  const esistente = await db.select({ id: proprietari.id }).from(proprietari).limit(1);
  if (esistente.length > 0) return;
  await db.insert(proprietari).values(PROPRIETARI_INIZIALI).onConflictDoNothing();
}
