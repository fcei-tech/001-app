// Filtro per tag nell'URL: ?tag=1,4 (id dei tag, lo sku deve averli TUTTI).
export function leggiTagParam(v: string | undefined): number[] {
  if (!v) return [];
  return [...new Set(v.split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
}

export function scriviTagParam(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}
