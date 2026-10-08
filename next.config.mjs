// Valor de PHASE_DEVELOPMENT_SERVER en next/constants instalado.
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server';

export default function nextConfig(phase) {
  // El harness marca sólo su Next hijo; dev/build habituales conservan defaults.
  if (phase === PHASE_DEVELOPMENT_SERVER
    && process.env.TRAVEL_BROWSER_FIXTURE === 'document-boundaries-v1') {
    return { devIndicators: false };
  }
  return {};
}
