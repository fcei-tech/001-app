// Calcolo "questo batch tiene una prenotazione reale" - usato per il
// messaggio di avviso non bloccante su eliminazione/cambio stato batch
// (2026-09-25, punto 2 del backlog UX - vedi
// backlog_ux_FINALIZZATO_2026_09_25_sessione_3 in
// claude/09c_python_pubblicazione.yaml).
//
// DEVE restare identico, condizione per condizione, a impegnatoSql() in
// src/db/pubblicazione-queries.ts - altrimenti l'avviso mostrato in UI
// direbbe una cosa diversa da quello che il calcolo "impegnato" fa
// davvero. Replicato qui come funzione pura (non query SQL) perche' la
// pagina elenco batch di un canale ha gia' in mano batch+lotti+canale
// dalla stessa query che serve per la tabella - non vale una query
// aggiuntiva per sku per ricalcolare un dato che si puo' derivare al volo.
//
// FIX 2026-09-28: questa funzione contava la prenotazione SOLO se
// batch.stato === 'confermato', disallineata dalla query reale
// impegnatoSql() (src/db/queries.ts), che conta 'confermato' E 'pubblicato'
// fin dal fix del 25/9 (commento su batchStatoEnum in schema.ts lo dice
// esplicitamente). Risultato del disallineamento: l'avviso non bloccante
// mostrato su un batch "pubblicato" (Elimina/Cambia stato) diceva "nessuna
// prenotazione" anche quando il batch teneva ancora disponibilita' bloccata
// altrove - trovato mentre si costruiva la generazione output Catawiki
// (che porta normalmente i batch a "pubblicato"), segnalato esplicitamente
// e corretto qui per restare coerente con impegnatoSql().
export function tipoLottoContaPrenotazione(
  tipoCanale: "statico" | "asta_online" | "asta_fisica",
  statoRiga: "attivo" | "candidato" | "accettato"
): boolean {
  if (tipoCanale === "asta_fisica") return statoRiga === "accettato";
  if (tipoCanale === "asta_online") return statoRiga === "attivo";
  return false; // statico: mai esclusivo, non consuma mai (vedi canali.esclusivo)
}

export function contaLottiConPrenotazione(
  batch: { stato: string; lotti: { statoRiga: "attivo" | "candidato" | "accettato" }[] },
  canale: { esclusivo: boolean; tipo: "statico" | "asta_online" | "asta_fisica" }
): number {
  if ((batch.stato !== "confermato" && batch.stato !== "pubblicato") || !canale.esclusivo) return 0;
  return batch.lotti.filter((l) => tipoLottoContaPrenotazione(canale.tipo, l.statoRiga)).length;
}
