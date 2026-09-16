/** An error whose message is safe, and meant, to be shown to the person. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, message);

/** Postgres unique_violation, seen through drizzle's error wrapper if present. */
export function uniqueViolation(err: unknown): string | undefined {
  const pg = (err as { cause?: unknown })?.cause ?? err;
  const e = pg as { code?: string; constraint?: string };
  return e?.code === '23505' ? e.constraint ?? '' : undefined;
}
