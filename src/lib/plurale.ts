// Singolare/plurale giusto nei testi: pl(1, "selezionato", "selezionati") -> "selezionato".
export function pl(n: number, uno: string, molti: string): string {
  return n === 1 ? uno : molti;
}
