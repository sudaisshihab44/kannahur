/**
 * api/config/supabase.ts
 *
 * Server-side Supabase client with transparent query-timing instrumentation.
 *
 * The raw client is exported as `supabaseRaw` for cases where the proxy is
 * unwanted. The default export `supabase` wraps the `.from()` builder so that
 * every terminal method (select, insert, update, delete, upsert) records:
 *   - Prometheus DB duration histogram
 *   - Pino structured db log (slow queries surfaced at warn level)
 *   - Slow query counter
 */
import { createClient } from '@supabase/supabase-js';
import { timeDbQuery } from '../monitoring/metrics.js';
import { dbLog } from '../config/logger.js';

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS ?? '200', 10);

// ── Raw client ────────────────────────────────────────────────────────────────

export const supabaseRaw = createClient(
  // Accept either SUPABASE_URL (server-only) or VITE_SUPABASE_URL (shared)
  // so the same .env works without duplication.
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Instrumented wrapper ──────────────────────────────────────────────────────

function wrapQueryBuilder(table: string, builder: any): any {
  const terminalMethods = ['select', 'insert', 'update', 'delete', 'upsert', 'rpc'] as const;

  return new Proxy(builder, {
    get(target: any, prop: string) {
      const original = target[prop];

      // Instrument terminal methods that return a thenable
      if (terminalMethods.includes(prop as any) && typeof original === 'function') {
        return (...args: any[]) => {
          const builtQuery = original.apply(target, args);
          const operation  = prop;
          const stopTimer  = timeDbQuery(table, operation);
          const startMs    = Date.now();

          // Return a Proxy over the query result so .then() is instrumented
          return new Proxy(builtQuery, {
            get(qTarget: any, qProp: string) {
              if (qProp === 'then' || qProp === 'catch' || qProp === 'finally') {
                return (...thenArgs: any[]) => {
                  const promise = qTarget[qProp](...thenArgs);

                  // Attach timing after the promise settles
                  return promise.then
                    ? promise
                        .then((result: any) => {
                          const ms    = Date.now() - startMs;
                          const isErr = !!result?.error;
                          stopTimer(isErr);

                          const logLevel = ms >= SLOW_QUERY_MS ? 'warn' : 'debug';
                          dbLog[logLevel]({
                            table, operation, durationMs: ms,
                            slow: ms >= SLOW_QUERY_MS,
                            error: result?.error?.message ?? null,
                          }, `DB ${operation} ${table} (${ms}ms)${ms >= SLOW_QUERY_MS ? ' [SLOW]' : ''}`);

                          return result;
                        })
                        .catch((err: any) => {
                          stopTimer(true);
                          dbLog.error({ table, operation, err }, `DB ${operation} ${table} failed`);
                          throw err;
                        })
                    : promise;
                };
              }
              return typeof qTarget[qProp] === 'function'
                ? qTarget[qProp].bind(qTarget)
                : qTarget[qProp];
            },
          });
        };
      }

      return typeof original === 'function' ? original.bind(target) : original;
    },
  });
}

// ── Instrumented `supabase` export ────────────────────────────────────────────

export const supabase = new Proxy(supabaseRaw, {
  get(target: any, prop: string) {
    if (prop === 'from') {
      return (table: string) => wrapQueryBuilder(table, target.from(table));
    }
    if (prop === 'rpc') {
      return (fn: string, ...args: any[]) => {
        const stopTimer = timeDbQuery('rpc', fn);
        const startMs   = Date.now();
        const result    = target.rpc(fn, ...args);

        return new Proxy(result, {
          get(rTarget: any, rProp: string) {
            if (rProp === 'then') {
              return (...thenArgs: any[]) =>
                rTarget.then(...thenArgs).then((r: any) => {
                  const ms = Date.now() - startMs;
                  stopTimer(!!r?.error);
                  const lvl = ms >= SLOW_QUERY_MS ? 'warn' : 'debug';
                  dbLog[lvl]({ table: 'rpc', operation: fn, durationMs: ms }, `DB rpc ${fn} (${ms}ms)`);
                  return r;
                });
            }
            return typeof rTarget[rProp] === 'function' ? rTarget[rProp].bind(rTarget) : rTarget[rProp];
          },
        });
      };
    }
    const val = target[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  },
});
