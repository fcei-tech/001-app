"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { movimentiMagazzino, proprietari, ubicazioni } from "@/db/schema";

// Esito restituito (mai eccezioni): in produzione Next maschera il testo
// degli errori lanciati da una server action, quindi i messaggi per
// l'operatore viaggiano nel risultato.
export type EsitoManutenzione = { ok: boolean; errore?: string; avviso?: string };

const TIPI_PROPRIETARIO = ["azienda", "soci", "terzo"] as const;
const TIPI_DEPOSITO = ["deposito", "presso_proprietario", "esposizione"] as const;

function aggiornaViste() {
  revalidatePath("/archivi", "layout");
  revalidatePath("/");
  revalidatePath("/magazzino/nuovo");
  revalidatePath("/pubblicazione");
}

function pulisci(v: FormDataEntryValue | null | undefined): string {
  return (v ?? "").toString().trim();
}

// --- Proprietari ---------------------------------------------------------

export type DatiProprietario = {
  nome: string;
  tipo: string;
  contaValoreAziendale: boolean;
  attivo?: boolean;
};

export async function creaProprietario(dati: DatiProprietario): Promise<EsitoManutenzione> {
  try {
    const nome = pulisci(dati.nome);
    if (!nome) return { ok: false, errore: "Il nome e' obbligatorio" };
    if (!TIPI_PROPRIETARIO.includes(dati.tipo as (typeof TIPI_PROPRIETARIO)[number])) {
      return { ok: false, errore: "Tipo non valido" };
    }
    const esistente = await db.query.proprietari.findFirst({ where: eq(proprietari.nome, nome) });
    if (esistente) return { ok: false, errore: `Esiste gia' un proprietario "${nome}"` };
    await db.insert(proprietari).values({
      nome,
      tipo: dati.tipo,
      contaValoreAziendale: dati.contaValoreAziendale,
    });
    aggiornaViste();
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function aggiornaProprietario(id: number, dati: DatiProprietario): Promise<EsitoManutenzione> {
  try {
    const attuale = await db.query.proprietari.findFirst({ where: eq(proprietari.id, id) });
    if (!attuale) return { ok: false, errore: "Proprietario non trovato" };
    const nome = pulisci(dati.nome);
    if (!nome) return { ok: false, errore: "Il nome non puo' essere vuoto" };
    if (!TIPI_PROPRIETARIO.includes(dati.tipo as (typeof TIPI_PROPRIETARIO)[number])) {
      return { ok: false, errore: "Tipo non valido" };
    }
    if (nome !== attuale.nome) {
      const doppio = await db.query.proprietari.findFirst({ where: eq(proprietari.nome, nome) });
      if (doppio) return { ok: false, errore: `Esiste gia' un proprietario "${nome}"` };
    }
    let avviso: string | undefined;
    const attivo = dati.attivo ?? attuale.attivo;
    if (attuale.attivo && !attivo) {
      const [{ pezzi }] = await db
        .select({ pezzi: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number) })
        .from(movimentiMagazzino)
        .where(eq(movimentiMagazzino.proprietarioId, id));
      if (pezzi > 0) {
        avviso = `Disattivato, ma ha ancora ${pezzi} pezzi a magazzino (restano visibili). Non comparira' piu' tra le scelte per i nuovi movimenti.`;
      }
    }
    await db
      .update(proprietari)
      .set({ nome, tipo: dati.tipo, contaValoreAziendale: dati.contaValoreAziendale, attivo })
      .where(eq(proprietari.id, id));
    aggiornaViste();
    return { ok: true, avviso };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function eliminaProprietario(id: number): Promise<EsitoManutenzione> {
  try {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(movimentiMagazzino)
      .where(eq(movimentiMagazzino.proprietarioId, id));
    if (n > 0) {
      return { ok: false, errore: "Ha gia' dei movimenti: non si puo' eliminare, solo disattivare." };
    }
    await db.delete(proprietari).where(eq(proprietari.id, id));
    aggiornaViste();
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Eliminazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}

// --- Depositi ------------------------------------------------------------

export type DatiDeposito = {
  nome: string;
  tipo: string;
  vendibile: boolean;
  fiscale: boolean;
  referente: string;
  attivo?: boolean;
};

export async function creaDeposito(dati: DatiDeposito): Promise<EsitoManutenzione> {
  try {
    const nome = pulisci(dati.nome);
    if (!nome) return { ok: false, errore: "Il nome e' obbligatorio" };
    if (!TIPI_DEPOSITO.includes(dati.tipo as (typeof TIPI_DEPOSITO)[number])) {
      return { ok: false, errore: "Tipo non valido (le case d'asta nascono creando il canale)" };
    }
    const esistente = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.nome, nome) });
    if (esistente) return { ok: false, errore: `Esiste gia' un deposito "${nome}"` };
    await db.insert(ubicazioni).values({
      nome,
      tipo: dati.tipo,
      vendibile: dati.vendibile,
      fiscale: dati.fiscale,
      referente: pulisci(dati.referente) || null,
    });
    aggiornaViste();
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function aggiornaDeposito(id: number, dati: DatiDeposito): Promise<EsitoManutenzione> {
  try {
    const attuale = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, id) });
    if (!attuale) return { ok: false, errore: "Deposito non trovato" };
    const bloccato = attuale.tipo === "asta_fisica";
    // Casa d'asta: nome e tipo restano quelli (legame con il canale).
    const nome = bloccato ? attuale.nome : pulisci(dati.nome);
    const tipo = bloccato ? attuale.tipo : dati.tipo;
    if (!nome) return { ok: false, errore: "Il nome non puo' essere vuoto" };
    if (!bloccato && !TIPI_DEPOSITO.includes(tipo as (typeof TIPI_DEPOSITO)[number])) {
      return { ok: false, errore: "Tipo non valido" };
    }
    if (nome !== attuale.nome) {
      const doppio = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.nome, nome) });
      if (doppio) return { ok: false, errore: `Esiste gia' un deposito "${nome}"` };
    }
    let avviso: string | undefined;
    const attivo = dati.attivo ?? attuale.attivo;
    if (attuale.attivo && !attivo) {
      const [{ pezzi }] = await db
        .select({ pezzi: sql<number>`coalesce(sum(${movimentiMagazzino.quantitaDelta}), 0)`.mapWith(Number) })
        .from(movimentiMagazzino)
        .where(eq(movimentiMagazzino.ubicazioneId, id));
      if (pezzi > 0) {
        avviso = `Disattivato, ma dentro ci sono ancora ${pezzi} pezzi (restano visibili). Non comparira' piu' tra le scelte per i nuovi movimenti.`;
      }
    }
    await db
      .update(ubicazioni)
      .set({
        nome,
        tipo,
        vendibile: dati.vendibile,
        fiscale: dati.fiscale,
        referente: pulisci(dati.referente) || null,
        attivo,
      })
      .where(eq(ubicazioni.id, id));
    aggiornaViste();
    return { ok: true, avviso };
  } catch (e) {
    return { ok: false, errore: `Salvataggio non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}

export async function eliminaDeposito(id: number): Promise<EsitoManutenzione> {
  try {
    const attuale = await db.query.ubicazioni.findFirst({ where: eq(ubicazioni.id, id) });
    if (!attuale) return { ok: false, errore: "Deposito non trovato" };
    if (attuale.tipo === "asta_fisica") {
      return { ok: false, errore: "I depositi delle case d'asta nascono con il canale e non si eliminano da qui." };
    }
    // Regola (2026-10-08): si elimina solo se e' VUOTO (nessun pezzo, per
    // nessuno sku/proprietario). Lo storico dei suoi movimenti viene
    // cancellato con lui: sommati danno zero per ogni sku, quindi nessuna
    // quantita' cambia.
    const nonVuoti = await db
      .select({ skuId: movimentiMagazzino.skuId })
      .from(movimentiMagazzino)
      .where(eq(movimentiMagazzino.ubicazioneId, id))
      .groupBy(movimentiMagazzino.skuId, movimentiMagazzino.proprietarioId)
      .having(sql`sum(${movimentiMagazzino.quantitaDelta}) <> 0`);
    if (nonVuoti.length > 0) {
      return { ok: false, errore: "Contiene ancora dei pezzi: spostali altrove, poi potrai eliminarlo (oppure disattivalo)." };
    }
    if (attuale.attivo && attuale.tipo === "deposito") {
      const altri = await db
        .select({ id: ubicazioni.id })
        .from(ubicazioni)
        .where(and(eq(ubicazioni.tipo, "deposito"), eq(ubicazioni.attivo, true), ne(ubicazioni.id, id)));
      if (altri.length === 0) {
        return { ok: false, errore: "E' l'unico deposito aziendale attivo: serve per i nuovi carichi, non si puo' eliminare." };
      }
    }
    await db.transaction(async (tx) => {
      await tx.delete(movimentiMagazzino).where(eq(movimentiMagazzino.ubicazioneId, id));
      await tx.delete(ubicazioni).where(eq(ubicazioni.id, id));
    });
    aggiornaViste();
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Eliminazione non riuscita: ${e instanceof Error ? e.message : "errore"}` };
  }
}
