"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProprietarioOpzione = { id: number; nome: string; tipo: string };

const CLASSE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// Selettore del proprietario con voce "+ Nuovo proprietario..." che apre i
// campi per crearlo al volo (e, a richiesta, il deposito "Presso <nome>").
// Usa <select> nativo apposta: nelle form nuove evitiamo gli input "bolla"
// nascosti di Radix Select, fragili nella WebView dell'app desktop.
// Campi inviati: proprietarioId ("nuovo" oppure id), nuovoProprietarioNome,
// nuovoProprietarioTipo, creaDepositoPresso.
export function SelettoreProprietario({
  proprietari,
  idBase = "proprietario",
}: {
  proprietari: ProprietarioOpzione[];
  idBase?: string;
}) {
  const [valore, setValore] = React.useState<string>(String(proprietari[0]?.id ?? "nuovo"));
  const [nome, setNome] = React.useState("");
  const inputNome = React.useRef<HTMLInputElement>(null);
  const nuovo = valore === "nuovo";

  const duplicato = nuovo && proprietari.some((p) => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  React.useEffect(() => {
    inputNome.current?.setCustomValidity(duplicato ? "Esiste gia' un proprietario con questo nome" : "");
  }, [duplicato]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idBase}>Proprietario</Label>
        <select
          id={idBase}
          name="proprietarioId"
          value={valore}
          onChange={(e) => setValore(e.target.value)}
          className={CLASSE_SELECT}
        >
          {proprietari.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
          <option value="nuovo">+ Nuovo proprietario...</option>
        </select>
      </div>
      {nuovo && (
        <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idBase}-nome`}>Nome del nuovo proprietario</Label>
            <Input
              id={`${idBase}-nome`}
              ref={inputNome}
              name="nuovoProprietarioNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="es. Mario Rossi"
            />
            {duplicato && <p className="text-xs text-destructive">Esiste gia&apos; un proprietario con questo nome.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idBase}-tipo`}>Tipo</Label>
            <select id={`${idBase}-tipo`} name="nuovoProprietarioTipo" defaultValue="terzo" className={CLASSE_SELECT}>
              <option value="terzo">Terzo (cliente che ci affida i suoi pezzi)</option>
              <option value="soci">Soci / privati</option>
              <option value="azienda">Azienda</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="creaDepositoPresso" className="size-4" />
            Crea anche il deposito &quot;Presso {nome.trim() || "…"}&quot; e usalo come ubicazione
          </label>
        </div>
      )}
    </div>
  );
}
