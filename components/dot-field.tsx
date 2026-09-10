"use client";

// El fondo de la pantalla de entrada: una retícula de puntos que se encienden
// desde el centro hacia afuera y después respiran despacio.
//
// Está escrito con canvas normal, sin librerías. La versión que lo inspiró usa
// three.js y un shader; para dibujar cuadraditos eso es traer una librería 3D
// completa a un proyecto que tiene siete dependencias, y no vale la pena.
//
// Tres cosas que no son adorno y conviene no quitar:
//
//   El color sale de la variable --dot, así que el fondo funciona en el tema
//   claro y en el oscuro sin tocar este archivo.
//
//   Si la persona pidió menos animación en su sistema, se dibuja el estado
//   final una sola vez y no hay animación. Es una preferencia de accesibilidad,
//   no un gusto.
//
//   Con la pestaña en segundo plano se detiene. Esta pantalla puede quedar
//   abierta toda la mañana en el computador de la obra.

import { useEffect, useRef } from "react";

/** Separación entre puntos y tamaño del punto, en píxeles de pantalla. */
const CELDA = 22;
const PUNTO = 3;

/** Niveles de opacidad. Dibujar por niveles permite pintar miles de puntos
 *  cambiando el alpha diez veces por cuadro en vez de una vez por punto. */
const NIVELES = [0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88, 1];

/** Cuánto tarda la aparición y cuánto se demora cada anillo en encenderse. */
const ENTRADA_SEGUNDOS = 0.55;
const RETRASO_POR_PIXEL = 0.0016;
const RETRASO_AL_AZAR = 0.35;

/** El respiro posterior: un vaivén lento y de poca amplitud. */
const RESPIRO_SEGUNDOS = 7;
const RESPIRO_PROFUNDIDAD = 0.38;

/** 30 cuadros por segundo alcanzan de sobra y gastan la mitad. */
const MS_POR_CUADRO = 1000 / 30;

/** Un instante ya pasada toda la entrada, para dibujar el campo asentado. */
const ASENTADO_SEGUNDOS = 6;

type Celda = { x: number; y: number; nivel: number; retraso: number; fase: number };

export default function DotField({
  theme,
  estatico = false,
}: {
  theme: string;
  /** Dibuja una sola vez y no anima nunca. Es lo que usa la aplicación: una
   *  herramienta que queda abierta ocho horas no debe estar animando de fondo. */
  estatico?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dos motivos para no animar: que lo pida esta pantalla, o que la persona
    // haya pedido menos animación en su sistema.
    const sinMovimiento =
      estatico ||
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let celdas: Celda[] = [];
    let ancho = 0;
    let alto = 0;
    let color = "255, 255, 255";
    let alfa = 1;
    let cuadro = 0;
    let ultimo = 0;
    let inicio = 0;

    // Los niveles se pintan juntos: un array de coordenadas por nivel.
    const cubos: number[][] = NIVELES.map(() => []);

    // El color y la fuerza salen del CSS, así que cada tema y cada pantalla
    // eligen los suyos sin tocar este archivo. En la entrada los puntos van a
    // plena luz; detrás del trabajo van apagados, porque ahí hay texto encima.
    function leerColor() {
      const estilo = getComputedStyle(canvas);
      color = estilo.getPropertyValue("--dot").trim() || "255, 255, 255";
      const crudo = parseFloat(estilo.getPropertyValue("--dot-alpha"));
      alfa = Number.isFinite(crudo) ? crudo : 1;
    }

    function armar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = canvas.clientWidth;
      alto = canvas.clientHeight;
      if (!ancho || !alto) return;
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = ancho / 2;
      const cy = alto / 2;
      const nuevas: Celda[] = [];
      // Se centra la retícula para que no quede una franja coja en un borde.
      const sobraX = (ancho % CELDA) / 2;
      const sobraY = (alto % CELDA) / 2;
      for (let y = sobraY; y < alto; y += CELDA) {
        for (let x = sobraX; x < ancho; x += CELDA) {
          const dx = x - cx;
          const dy = y - cy;
          nuevas.push({
            x,
            y,
            nivel: Math.floor(Math.random() * NIVELES.length),
            retraso:
              Math.sqrt(dx * dx + dy * dy) * RETRASO_POR_PIXEL +
              Math.random() * RETRASO_AL_AZAR,
            fase: Math.random() * Math.PI * 2,
          });
        }
      }
      celdas = nuevas;
      inicio = 0;
    }

    function pintar(segundos: number) {
      ctx.clearRect(0, 0, ancho, alto);
      for (const cubo of cubos) cubo.length = 0;

      for (const celda of celdas) {
        // Aparición: de 0 a 1 desde que le toca a esta celda.
        const avance = sinMovimiento
          ? 1
          : Math.min(
              1,
              Math.max(0, (segundos - celda.retraso) / ENTRADA_SEGUNDOS),
            );
        if (avance <= 0) continue;

        let factor = avance;
        if (!sinMovimiento) {
          // Respiro: solo después de haber aparecido del todo.
          const vaiven =
            (Math.sin(
              (segundos / RESPIRO_SEGUNDOS) * Math.PI * 2 + celda.fase,
            ) +
              1) /
            2;
          factor *= 1 - RESPIRO_PROFUNDIDAD + RESPIRO_PROFUNDIDAD * vaiven;
        }

        const indice = Math.min(
          NIVELES.length - 1,
          Math.max(0, Math.round(celda.nivel * factor)),
        );
        const cubo = cubos[indice];
        cubo.push(celda.x, celda.y);
      }

      for (let i = 0; i < cubos.length; i++) {
        const cubo = cubos[i];
        if (!cubo.length) continue;
        ctx.fillStyle = `rgba(${color}, ${NIVELES[i] * alfa})`;
        for (let j = 0; j < cubo.length; j += 2) {
          ctx.fillRect(cubo[j], cubo[j + 1], PUNTO, PUNTO);
        }
      }
    }

    function paso(ahora: number) {
      cuadro = requestAnimationFrame(paso);
      if (document.hidden) return;
      if (ahora - ultimo < MS_POR_CUADRO) return;
      ultimo = ahora;
      // Si se saltó la entrada, el reloj arranca ya pasado ese tramo para que
      // el respiro siga desde donde quedó el dibujo asentado.
      if (!inicio) {
        inicio = ahora - (saltarEntrada ? ASENTADO_SEGUNDOS * 1000 : 0);
      }
      pintar((ahora - inicio) / 1000);
    }

    leerColor();
    armar();

    // Con la pestaña en segundo plano el navegador congela requestAnimationFrame:
    // si no se dibujara nada, el fondo quedaría vacío hasta que alguien vuelva.
    // Se pinta el campo ya asentado y se salta la entrada, que de todos modos
    // nadie estaría mirando.
    const saltarEntrada = document.hidden;

    if (sinMovimiento) {
      pintar(ASENTADO_SEGUNDOS);
    } else {
      if (saltarEntrada) pintar(ASENTADO_SEGUNDOS);
      cuadro = requestAnimationFrame(paso);
    }

    const observador = new ResizeObserver(() => {
      armar();
      if (sinMovimiento || document.hidden) pintar(ASENTADO_SEGUNDOS);
    });
    observador.observe(canvas);

    return () => {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
    };
    // El tema cambia el color: se rearma con la variable nueva.
  }, [theme, estatico]);

  return <canvas ref={canvasRef} className="dot-field" aria-hidden="true" />;
}
