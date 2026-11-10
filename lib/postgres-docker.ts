// Ayudantes para las pruebas que levantan un PostgreSQL real en Docker.
//
// Las comparten las pruebas de la aplicación de propuestas (B2) y la de
// accesos. Todo pasa por el runner cancelable: ningún proceso síncrono, para
// que el límite de tiempo pueda cortar de verdad una orden colgada.
import assert from "node:assert/strict";
import { runCommand } from "./travel-agent-postgres-runner.ts";

export async function docker(args: string[], input?: string, timeoutMs = 30_000, signal?: AbortSignal): Promise<string> {
  const result = await runCommand("docker", args, { input, timeoutMs, signal });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

export async function psql(container: string, sql: string, signal: AbortSignal): Promise<string> {
  return docker(["exec", "-i", container, "psql", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], sql, 30_000, signal);
}

function isMissingCommand(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

export async function requireDocker(t: { skip(reason: string): void }): Promise<boolean> {
  try {
    await docker(["info"], undefined, 15_000);
    return true;
  } catch (error) {
    if (isMissingCommand(error)) {
      t.skip("Docker no está instalado para la prueba PostgreSQL aislada");
      return false;
    }
    throw error;
  }
}

export function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      done(signal.reason);
    };
    function done(error?: unknown) {
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// La imagen oficial arranca primero un servidor temporal que solo escucha por
// el socket Unix (para correr initdb y los scripts de inicio), lo apaga y
// recién entonces levanta el definitivo. Si se da por listo al primer éxito por
// socket, el siguiente `psql` puede caer justo en el corte entre ambos y fallar
// con "No such file or directory" sobre el socket.
//
// Solo el servidor definitivo escucha por TCP. Por eso se exige primero una
// consulta por TCP y, en el mismo intento y después de ella, otra por el socket,
// que es la vía que usan las consultas de la prueba.
export async function waitForPostgres(container: string, signal: AbortSignal): Promise<void> {
  const select = (...host: string[]) =>
    ["exec", container, "psql", "-qAt", ...host, "-U", "postgres", "-d", "postgres", "-c", "select 1"];
  let lastFailure = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tcp = await runCommand("docker", select("-h", "127.0.0.1"), { timeoutMs: 5_000, signal });
    const socket = tcp.status === 0
      ? await runCommand("docker", select(), { timeoutMs: 5_000, signal })
      : null;
    if (socket?.status === 0) return;
    lastFailure = `${tcp.stderr} ${socket?.stderr ?? ""}`;
    if (attempt === 59) assert.fail(`PostgreSQL aislado no inició: ${lastFailure}`);
    await wait(250, signal);
  }
}
