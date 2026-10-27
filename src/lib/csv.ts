// Lettura CSV minima (RFC 4180): campi tra virgolette, virgolette doppie
// "", righe CRLF/LF, BOM iniziale. Nessuna dipendenza, usabile anche dal browser.
export function leggiCsv(testo: string, delimitatore: "," | ";"): string[][] {
  const t = testo.replace(/^﻿/, "");
  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = "";
  let tra = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (tra) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else tra = false;
      } else campo += c;
    } else if (c === '"') tra = true;
    else if (c === delimitatore) {
      riga.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      riga.push(campo);
      campo = "";
      if (riga.length > 1 || riga[0] !== "") righe.push(riga);
      riga = [];
    } else campo += c;
  }
  if (campo !== "" || riga.length > 0) {
    riga.push(campo);
    righe.push(riga);
  }
  return righe;
}
