// Voci del menu "Impostazioni": un solo elenco, uguale in tutte le pagine
// (prima erano divise fra "Archivi" e "Sistema"). Gli indirizzi non cambiano.
export type VoceImpostazioni = { href: string; etichetta: string };
export type GruppoImpostazioni = { titolo: string; voci: VoceImpostazioni[] };

export const GRUPPI_IMPOSTAZIONI: GruppoImpostazioni[] = [
  {
    titolo: "Elenchi",
    voci: [
      { href: "/archivi/proprietari", etichetta: "Proprietari" },
      { href: "/archivi/depositi", etichetta: "Depositi" },
      { href: "/archivi/tag", etichetta: "Tag" },
      { href: "/archivi/portali", etichetta: "Portali" },
    ],
  },
  {
    titolo: "Prezzi",
    voci: [{ href: "/archivi/regole-prezzi", etichetta: "Regole prezzi" }],
  },
  {
    titolo: "Sistema",
    voci: [
      { href: "/sistema/collegamenti", etichetta: "Collegamenti e guida" },
      { href: "/sistema/dati", etichetta: "Dati e copie di sicurezza" },
      { href: "/sistema/pulizia", etichetta: "Pulizia dati" },
      { href: "/sistema/zona-pericolo", etichetta: "Zona pericolo" },
    ],
  },
];
