import { apiUrl, authHeader, handleUnauthorized } from '@/web/session';

// One network call standing in for one of the app's async service functions.
// The server runs the real function (see server/src/routes/rpc.ts), so the
// screens get back exactly what they would have got from SQLite.

/**
 * JSON has no `undefined`: inside an array it becomes null, and a function
 * with a default parameter treats null as a real value. The positions that
 * were undefined travel alongside, so the server can put them back.
 */
function encodeArgs(args: unknown[]) {
  const undef: number[] = [];
  args.forEach((a, i) => a === undefined && undef.push(i));
  return { args, undef };
}

export function rpc<F extends (...args: any[]) => Promise<any>>(module: string, fn: string): F {
  const call = async (...args: unknown[]) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/rpc/${module}/${fn}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(encodeArgs(args)),
      });
    } catch {
      throw new Error('Cannot reach the server. Check that it is running.');
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error('Please sign in again.');
    }
    const data = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Server error (${res.status}).`);
    return data.result;
  };
  return call as F;
}
