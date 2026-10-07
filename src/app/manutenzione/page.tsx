import { redirect } from "next/navigation";

// Vecchio indirizzo: ora Proprietari e Depositi stanno in Archivi.
export default function ManutenzionePage() {
  redirect("/archivi/proprietari");
}
