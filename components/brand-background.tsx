// Formas estáticas de la identidad Daybook. Permanecen fuera de las superficies
// de datos y no capturan el ratón ni forman parte del árbol accesible.
export default function BrandBackground() {
  return (
    <div className="brand-background" aria-hidden="true">
      <svg className="brand-background-top" viewBox="0 0 620 360">
        <circle className="brand-shape-ink" cx="310" cy="180" r="180" />
        <circle className="brand-shape-gold" cx="405" cy="120" r="92" />
      </svg>
      <svg className="brand-background-bottom" viewBox="0 0 620 360">
        <circle className="brand-line-ink" cx="220" cy="220" r="180" />
        <circle className="brand-line-gold" cx="345" cy="132" r="82" />
      </svg>
    </div>
  );
}
