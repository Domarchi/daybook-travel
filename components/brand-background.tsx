// Flechas estáticas inspiradas en la marca. Permanecen fuera de las superficies
// de datos y no capturan el ratón ni forman parte del árbol accesible.
export default function BrandBackground() {
  return (
    <div className="brand-background" aria-hidden="true">
      <svg className="brand-background-top" viewBox="0 0 620 360">
        <path className="brand-shape-blue" d="M0 0H180L360 180 180 360H0L180 180Z" />
        <path className="brand-shape-green" d="M220 0H400L580 180 400 360H220L400 180Z" />
      </svg>
      <svg className="brand-background-bottom" viewBox="0 0 620 360">
        <path className="brand-line-blue" d="M0 0H180L360 180 180 360H0L180 180Z" />
        <path className="brand-line-green" d="M220 0H400L580 180 400 360H220L400 180Z" />
      </svg>
    </div>
  );
}
