// Tiny helpers used in more than one source file. Keep this thin —
// anything that needs more than a few lines should live in its own
// module.

/** Narrow `unknown` to a Node.js errno exception so `.code` is accessible safely. */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as { code?: unknown }).code === 'string';
}

/** Best-effort extraction of a human-readable message from an unknown error. */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Read a required runner-provided environment variable. Throws with a
 * clear message if missing, so unset-env bugs surface at the call site
 * instead of as a downstream `path.join(undefined, …)` crash.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable '${name}' is not set; is the action running outside a runner?`);
  }
  return value;
}
