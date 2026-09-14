import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "FCC TRAVEL · Copiapó",
  description: "Planificación de personas y viajes de obra.",
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
        {/* Transparencia de presentación: conserva el PNG original para las
            exportaciones y elimina su blanco al dibujarlo en la interfaz. */}
        <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute pointer-events-none">
          <defs>
            <filter id="fcc-logo-alpha" colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 0 3" />
            </filter>
            <filter id="fcc-logo-dark" colorInterpolationFilters="sRGB">
              {/* Separar los dos colores evita que los bordes blancos del PNG
                  se vuelvan un contorno luminoso en el tema oscuro. */}
              <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -5 5 0 0" result="blue-mask" />
              <feFlood floodColor="#e5edf5" result="blue-color" />
              <feComposite in="blue-color" in2="blue-mask" operator="in" result="blue-logo" />
              <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 4.2 -4.2 0 0" result="green-mask" />
              <feFlood floodColor="#e5edf5" result="green-color" />
              <feComposite in="green-color" in2="green-mask" operator="in" result="green-logo" />
              <feMerge>
                <feMergeNode in="blue-logo" />
                <feMergeNode in="green-logo" />
              </feMerge>
            </filter>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
