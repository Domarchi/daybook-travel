import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";

import "@daybook/design/tokens.css";
import "@daybook/design/estados.css";
import "./globals.css";

// La fuente de la familia Daybook (ver @daybook/design). Sus variables van en
// <html>: el paquete arma --db-font-sans en :root y necesita verlas ahí.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Daybook Travel · Copiapó",
  description: "Planificación de personas y viajes de obra.",
  icons: { icon: "/brand/daybook-favicon.svg" },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
