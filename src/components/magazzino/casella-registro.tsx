// Casella "Scrivi nel registro" usata in tutte le finestre dove si cambia una
// quantita', un deposito o un proprietario. Spuntata = l'operazione compare
// nella lista Movimenti; tolta = conta nei totali ma non si vede da nessuna
// parte. Funziona sia dentro un <form> (name="inRegistro", valore "on") sia
// controllata da uno stato (checked + onCheckedChange).
export function CasellaRegistro({
  id,
  name,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (valore: boolean) => void;
  disabled?: boolean;
}) {
  const controllata = checked !== undefined;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <input
        id={id}
        type="checkbox"
        name={name}
        {...(controllata ? { checked, onChange: (e) => onCheckedChange?.(e.target.checked) } : { defaultChecked: defaultChecked ?? true })}
        disabled={disabled}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium">Scrivi nel registro</span>
        <span className="text-xs text-muted-foreground">Togli la spunta se è solo una correzione: i totali restano giusti.</span>
      </span>
    </label>
  );
}
