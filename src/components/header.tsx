import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/logo.png"
            alt="BATCH_"
            width={410}
            height={100}
            priority
            className="block h-8 w-auto dark:hidden"
          />
          <Image
            src="/brand/logo-white.png"
            alt="BATCH_"
            width={410}
            height={100}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/" className="text-foreground">
            Magazzino
          </Link>
          <span className="opacity-50">Pubblicazione</span>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
