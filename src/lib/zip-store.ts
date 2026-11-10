// Lettura di uno zip nel browser (Release 11, schede da telefono). Lo zip lo
// scrive la pagina del telefono senza compressione ("store"), ma si leggono
// anche file compressi (deflate) se il sistema li ha ricompressi. Nessuna
// dipendenza esterna.

export type VoceZip = { nome: string; leggi: () => Promise<Uint8Array> };

function u16(d: DataView, o: number) {
  return d.getUint16(o, true);
}
function u32(d: DataView, o: number) {
  return d.getUint32(o, true);
}

async function inflateRaw(dati: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const scrittore = ds.writable.getWriter();
  const blob = new Uint8Array(dati);
  void scrittore.write(blob);
  void scrittore.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export function apriZip(buffer: ArrayBuffer): VoceZip[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Fine della directory centrale: ultima firma 0x06054b50 negli ultimi 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Il file non e' uno zip valido.");
  const totale = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const voci: VoceZip[] = [];
  const decoder = new TextDecoder("utf-8");
  for (let n = 0; n < totale; n++) {
    if (u32(view, p) !== 0x02014b50) throw new Error("Zip danneggiato (directory centrale).");
    const metodo = u16(view, p + 10);
    const dimComp = u32(view, p + 20);
    const lenNome = u16(view, p + 28);
    const lenExtra = u16(view, p + 30);
    const lenCommento = u16(view, p + 32);
    const offLocale = u32(view, p + 42);
    const nome = decoder.decode(bytes.subarray(p + 46, p + 46 + lenNome));
    p += 46 + lenNome + lenExtra + lenCommento;
    if (nome.endsWith("/")) continue;
    voci.push({
      nome,
      leggi: async () => {
        if (u32(view, offLocale) !== 0x04034b50) throw new Error(`Zip danneggiato (${nome}).`);
        const inizio = offLocale + 30 + u16(view, offLocale + 26) + u16(view, offLocale + 28);
        const dati = bytes.subarray(inizio, inizio + dimComp);
        if (metodo === 0) return dati;
        if (metodo === 8) return inflateRaw(dati);
        throw new Error(`Compressione non supportata nel file ${nome}.`);
      },
    });
  }
  return voci;
}
