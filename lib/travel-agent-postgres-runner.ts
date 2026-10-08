import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type CommandResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  input?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export class CommandDeadlineError extends Error {
  constructor(command: string, timeoutMs: number) {
    super(`${command} exceeded deadline ${timeoutMs}ms`);
    this.name = "CommandDeadlineError";
  }
}

export class GlobalDeadlineError extends Error {
  constructor(timeoutMs: number) {
    super(`PostgreSQL integration exceeded global deadline ${timeoutMs}ms`);
    this.name = "GlobalDeadlineError";
  }
}

function kill(child: ChildProcessWithoutNullStreams): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The process may have already exited; fall through to the direct kill.
    }
  }
  child.kill("SIGKILL");
}

function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("command aborted");
}

export function runCommand(command: string, args: string[], { input, timeoutMs, signal }: CommandOptions): Promise<CommandResult> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new TypeError("timeoutMs must be a positive finite number"));
  }
  if (signal?.aborted) return Promise.reject(aborted(signal));

  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, { detached: process.platform !== "win32", stdio: "pipe" });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      kill(child);
      settle(() => reject(aborted(signal!)));
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };

    timer = setTimeout(() => {
      kill(child);
      settle(() => reject(new CommandDeadlineError(command, timeoutMs)));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => settle(() => reject(error)));
    child.once("close", (status, exitSignal) => settle(() => resolve({ status, signal: exitSignal, stdout, stderr })));
    child.stdin.end(input);
  });
}

export function runWithinDeadline<T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new TypeError("timeoutMs must be a positive finite number"));
  }

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const deadline = new GlobalDeadlineError(timeoutMs);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      controller.abort(deadline);
      settle(() => reject(deadline));
    }, timeoutMs);

    Promise.resolve()
      .then(() => work(controller.signal))
      .then(
        (result) => settle(() => resolve(result)),
        (error) => settle(() => reject(error)),
      );
  });
}
