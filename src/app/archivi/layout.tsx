import { Header } from "@/components/header";
import { SezioniLaterali } from "@/components/sezioni-laterali";
import { GRUPPI_IMPOSTAZIONI } from "@/lib/voci-impostazioni";

export default function ArchiviLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:flex-row">
        <SezioniLaterali titolo="Impostazioni" gruppi={GRUPPI_IMPOSTAZIONI} />
        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
