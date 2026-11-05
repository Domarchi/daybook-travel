import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { runCommand } from "./travel-agent-postgres-runner.ts";

type TestContext = {
  skip(reason: string): void;
  after(fn: () => Promise<void>): void;
};

export type PostgresFixture = { sql(body: string): Promise<string> };

async function command(executable: string, args: string[], input?: string, signal?: AbortSignal): Promise<string> {
  const result = await runCommand(executable, args, { input, timeoutMs: 30_000, signal });
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/**
 * Default: disposable Docker cluster. Opt-in: a private local Unix socket and
 * binaries supplied by the test operator. Local mode always creates and drops
 * its own database and refuses hostnames/TCP; it never uses DATABASE_URL.
 */
export async function createPostgresFixture(t: TestContext, signal: AbortSignal): Promise<PostgresFixture | null> {
  const binaryDirectory = process.env.TRAVEL_TEST_PG_BIN;
  const socket = process.env.TRAVEL_TEST_PG_SOCKET;
  const hasLocalConfiguration = Boolean(binaryDirectory || socket);
  let sql: (body: string) => Promise<string>;
  let rolesSql: (body: string) => Promise<string>;

  if (hasLocalConfiguration) {
    assert.ok(binaryDirectory && isAbsolute(binaryDirectory), "TRAVEL_TEST_PG_BIN debe ser una ruta absoluta");
    assert.ok(socket && isAbsolute(socket), "TRAVEL_TEST_PG_SOCKET debe ser una ruta Unix absoluta");
    const port = process.env.TRAVEL_TEST_PG_PORT ?? "5432";
    assert.match(port, /^\d{1,5}$/, "Puerto local inválido");
    assert.ok((await stat(join(socket, `.s.PGSQL.${port}`))).isSocket(), "El destino debe ser un socket local PostgreSQL");
    const user = process.env.TRAVEL_TEST_PG_USER ?? process.env.USER ?? "postgres";
    const database = `travel_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const connection = ["-h", socket, "-p", port, "-U", user];
    const psql = join(binaryDirectory, "psql");
    await command(join(binaryDirectory, "createdb"), [...connection, database], undefined, signal);
    t.after(async () => {
      await command(join(binaryDirectory, "dropdb"), [...connection, "--force", "--if-exists", database]);
    });
    sql = (body) => command(psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", ...connection, "-d", database], body, signal);
    rolesSql = (body) => command(psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", ...connection, "-d", "postgres"], body, signal);
  } else {
    try {
      await command("docker", ["info"], undefined, signal);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        t.skip("Docker no está instalado y no hay un PostgreSQL local de pruebas configurado");
        return null;
      }
      throw error;
    }
    const container = `travel-postgres-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    t.after(async () => {
      await command("docker", ["rm", "-f", container]);
    });
    await command("docker", ["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "postgres:16-alpine"], undefined, signal);
    // The image starts a temporary socket-only server during initdb, then
    // stops it. Probe the final TCP listener inside the container so readiness
    // cannot succeed against that temporary server. Writes use the same
    // connection; no container port is published on the host.
    const postgresArgs = ["exec", "-i", "-e", "PGPASSWORD=postgres", container,
      "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres"];
    let ready = false;
    let lastFailure = "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await runCommand("docker", [...postgresArgs, "-c", "select 1"], { timeoutMs: 5_000, signal });
      if (result.status === 0) { ready = true; break; }
      lastFailure = result.stderr.trim();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, `PostgreSQL aislado no inició: ${lastFailure}`);
    sql = (body) => command("docker", postgresArgs, body, signal);
    rolesSql = sql;
  }

  // Roles are cluster-wide. Serialize their initialization so concurrent test
  // databases in local mode do not race CREATE ROLE.
  await rolesSql(`
    begin;
    select pg_advisory_xact_lock(1730242026);
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    commit;
  `);
  return { sql };
}
