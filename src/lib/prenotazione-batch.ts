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
// NOTA (trovata durante questa sessione, non ancora segnalata al cliente):
// impegnatoSql() conta SOLO bp.stato = 'confermato', non 'generato' - un
// batch "generato" (output gia' prodotto) smette di consumare disponibilita'
// appena passa da confermato a generato, anche se nessun lotto e' stato
// toccato. Sembra un disallineamento con la definizione di "generato" nel
// commento di batchStatoEnum (schema.ts: "generazione e' un evento
// ripetibile su un batch confermato, non un nuovo stato terminale") - ma
// qui viene SOLO replicato lo stesso comportamento realmente in vigore nel
// codice, non corretto, per non introdurre in silenzio un cambio di
// comportamento non richiesto. Da confermare col cliente.
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
  if (batch.stato !== "confermato" || !canale.esclusivo) return 0;
  return batch.lotti.filter((l) => tipoLottoContaPrenotazione(canale.tipo, l.statoRiga)).length;
}
