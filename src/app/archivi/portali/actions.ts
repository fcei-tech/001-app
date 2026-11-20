"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canali } from "@/db/schema";

export async function setCanaleAttivoAction(canaleId: number, attivo: boolean): Promise<{ ok: boolean; errore?: string }> {
  try {
    await db.update(canali).set({ attivo, updatedAt: new Date() }).where(eq(canali.id, canaleId));
    revalidatePath("/archivi/portali");
    revalidatePath("/pubblicazione");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Non riuscito: ${e instanceof Error ? e.message : "errore"}` };
  }
}
