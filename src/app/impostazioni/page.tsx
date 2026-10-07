import { redirect } from "next/navigation";

// Vecchio indirizzo: ora Database e Shopify stanno in Sistema > Collegamenti.
export default function ImpostazioniPage() {
  redirect("/sistema/collegamenti");
}
