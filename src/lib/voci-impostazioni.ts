// Voci del menu "Impostazioni": un solo elenco, uguale in tutte le pagine.
// Raggruppate per SCOPO (2026-11-25): chi e dove, catalogo, sicurezza dei dati,
// aiuto. Gli indirizzi non cambiano. "icona" e' il nome di un'icona lucide
// (vedi sezioni-laterali.tsx); "pericolo" colora la voce di rosso.
export type VoceImpostazioni = { href: string; etichetta: string; icona: string; pericolo?: boolean };
export type GruppoImpostazioni = { titolo: string; voci: VoceImpostazioni[] };

export const GRUPPI_IMPOSTAZIONI: GruppoImpostazioni[] = [
  {
    titolo: "Chi e dove",
    voci: [
      { href: "/archivi/proprietari", etichetta: "Proprietari", icona: "users" },
      { href: "/archivi/depositi", etichetta: "Depositi", icona: "warehouse" },
      { href: "/archivi/portali", etichetta: "Portali", icona: "store" },
    ],
  },
  {
    titolo: "Catalogo",
    voci: [
      { href: "/archivi/tag", etichetta: "Tag", icona: "tags" },
      { href: "/archivi/campi-sku", etichetta: "Campi personalizzati", icona: "list-plus" },
      { href: "/archivi/regole-prezzi", etichetta: "Regole prezzi", icona: "euro" },
    ],
  },
  {
    titolo: "Sicurezza dei dati",
    voci: [
      { href: "/sistema/dati", etichetta: "Copie di sicurezza", icona: "database-backup" },
      { href: "/sistema/controllo-dati", etichetta: "Controllo dati", icona: "shield-check" },
      { href: "/sistema/pulizia", etichetta: "Pulizia dati", icona: "eraser" },
      { href: "/sistema/zona-pericolo", etichetta: "Zona pericolo", icona: "triangle-alert", pericolo: true },
    ],
  },
  {
    titolo: "Aiuto",
    voci: [{ href: "/sistema/collegamenti", etichetta: "Collegamenti e guida", icona: "life-buoy" }],
  },
];
