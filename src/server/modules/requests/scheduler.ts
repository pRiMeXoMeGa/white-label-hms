import type { AppContext } from '../../context';
import { advanceDueRequests, finishHousekeepingTurnarounds } from './requests';

/**
 * Simulated operations team. Every AUTO_ADVANCE_TICK_SECONDS it moves due requests to their
 * next status. Single-instance by design; with several instances this would move to a job
 * queue or a row-locking worker (SELECT ... FOR UPDATE SKIP LOCKED on Postgres).
 */
export function startScheduler(ctx: AppContext, log: (msg: string, extra?: object) => void): () => void {
  const { enabled, tickSeconds } = ctx.config.autoAdvance;
  const tick = () => {
    try {
      const advanced = ctx.config.autoAdvance.enabled ? advanceDueRequests(ctx) : 0;
      const cleaned = finishHousekeepingTurnarounds(ctx);
      if (advanced || cleaned) log('scheduler tick', { advanced, cleaned });
    } catch (err) {
      log('scheduler error', { error: err instanceof Error ? err.message : String(err) });
    }
  };
  log('scheduler started', { autoAdvance: enabled, tickSeconds, secondsByService: ctx.config.autoAdvance.secondsByService });
  const handle = setInterval(tick, tickSeconds * 1000);
  handle.unref();
  tick();
  return () => clearInterval(handle);
}
