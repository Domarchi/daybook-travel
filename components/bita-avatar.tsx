// La cara de Bita: el mismo casco dorado que en Daybook Parte Diario y Daybook
// Ticket, para que sea la misma asistente en toda la familia Daybook.
//
// SVG en línea: no pide otro archivo. Los colores de la marca no cambian entre
// tema claro y oscuro (el anillo dorado la separa de un fondo oscuro), por eso
// van fijos aquí y no como tokens. Decorativo para lectores de pantalla: el
// nombre siempre va escrito al lado. «Pensando», el casco se mece, salvo con
// movimiento reducido.
export function BitaAvatar({ size = 32, thinking = false }: { size?: number; thinking?: boolean }) {
  return (
    <svg
      className="block shrink-0"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-bita-avatar
    >
      <circle cx="32" cy="32" r="31" fill="#1c1d1a" stroke="#d99b27" strokeOpacity=".45" strokeWidth="2" />
      <g className={thinking ? "motion-safe:animate-bounce [animation-duration:900ms]" : undefined}>
        <path d="M16 38a16 16 0 0 1 32 0z" fill="#d99b27" />
        <rect x="29" y="19" width="6" height="10" rx="2" fill="#f6d16f" />
        <rect x="11" y="37" width="42" height="5" rx="2.5" fill="#f6d16f" />
      </g>
      <g fill="#f3efe4">
        <circle cx="26" cy="49" r="2.3" />
        <circle cx="38" cy="49" r="2.3" />
      </g>
      <path d="M27 54.5q5 4 10 0" fill="none" stroke="#f3efe4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
