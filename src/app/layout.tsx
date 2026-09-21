import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { UpdateChecker } from "@/components/update-checker";

export const metadata: Metadata = {
  title: "BATCH_",
  description: "BATCH_ — From archive to market. Gestionale magazzino e pubblicazione multi-portale.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <UpdateChecker />
        </ThemeProvider>
      </body>
    </html>
  );
}
