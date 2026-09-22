import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Daybook Travel · Copiapó",
  description: "Planificación de personas y viajes de obra.",
  icons: { icon: "/brand/daybook-favicon.svg" },
};

const themeInitializer = `
  try {
    const savedTheme = window.localStorage.getItem("fcc-travel-theme");
    document.documentElement.dataset.theme =
      savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
  } catch {}
`;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
