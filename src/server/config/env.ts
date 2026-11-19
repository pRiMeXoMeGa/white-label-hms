import { z } from 'zod';
import type { ServiceType } from '../../shared/types';

// Booleans are case-insensitive (TRUE, Yes, 1).
const bool = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const seconds = z.coerce.number().int().min(1).max(86_400);

const EnvSchema = z.object({
  // Any other value (e.g. "staging") runs with production behaviour.
  NODE_ENV: z
    .string()
    .default('development')
    .transform((v) => (v === 'development' || v === 'test' ? v : 'production') as 'development' | 'production' | 'test'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/hms.sqlite'),
  HOTEL_CONFIG_PATH: z.string().default('./config/hotel.json'),
  CLIENT_DIR: z.string().default('./dist/client'),
  RESET_DB_ON_START: bool.default('false'),

  // Auto-progress ("option B"): service requests move to their next status on a timer.
  AUTO_ADVANCE_ENABLED: bool.default('true'),
  AUTO_ADVANCE_TICK_SECONDS: seconds.default(2),
  AUTO_ADVANCE_SECONDS: seconds.default(10),
  AUTO_ADVANCE_SECONDS_FOOD: seconds.optional(),
  AUTO_ADVANCE_SECONDS_LAUNDRY: seconds.optional(),
  AUTO_ADVANCE_SECONDS_HOUSEKEEPING: seconds.optional(),
  AUTO_ADVANCE_SECONDS_AMENITY: seconds.optional(),
  AUTO_ADVANCE_SECONDS_MAINTENANCE: seconds.optional(),
  AUTO_ADVANCE_SECONDS_SPA: seconds.optional(),
  AUTO_ADVANCE_SECONDS_TRANSFER: seconds.optional(),
  HOUSEKEEPING_TURNAROUND_SECONDS: seconds.default(300),

  // Allow online check-in N days before the arrival date (0 = arrival day only).
  EARLY_CHECKIN_DAYS: z.coerce.number().int().min(0).max(30).default(0),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  // Number of proxies in front of the app that append to X-Forwarded-For (Render: 1). 0 = use the socket address.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),

  // Keep-awake: free hosts (Render) stop an idle service after 15 minutes, which wipes an
  // on-container SQLite file. The app requests its own public URL on an interval so it never idles.
  KEEP_ALIVE_URL: z.string().url().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(), // set automatically by Render
  KEEP_ALIVE_MINUTES: z.coerce.number().int().min(0).max(60).default(10), // 0 disables
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  databasePath: string;
  hotelConfigPath: string;
  clientDir: string;
  resetDbOnStart: boolean;
  autoAdvance: {
    enabled: boolean;
    tickSeconds: number;
    secondsByService: Record<ServiceType, number>;
  };
  housekeepingTurnaroundSeconds: number;
  earlyCheckinDays: number;
  rateLimitPerMinute: number;
  trustProxyHops: number;
  keepAlive: { url: string | null; minutes: number };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // Empty values (e.g. `KEEP_ALIVE_URL=`) count as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  const d = e.AUTO_ADVANCE_SECONDS;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databasePath: e.DATABASE_PATH,
    hotelConfigPath: e.HOTEL_CONFIG_PATH,
    clientDir: e.CLIENT_DIR,
    resetDbOnStart: e.RESET_DB_ON_START,
    autoAdvance: {
      enabled: e.AUTO_ADVANCE_ENABLED,
      tickSeconds: e.AUTO_ADVANCE_TICK_SECONDS,
      secondsByService: {
        food: e.AUTO_ADVANCE_SECONDS_FOOD ?? d,
        laundry: e.AUTO_ADVANCE_SECONDS_LAUNDRY ?? d,
        housekeeping: e.AUTO_ADVANCE_SECONDS_HOUSEKEEPING ?? d,
        amenity: e.AUTO_ADVANCE_SECONDS_AMENITY ?? d,
        maintenance: e.AUTO_ADVANCE_SECONDS_MAINTENANCE ?? d,
        spa: e.AUTO_ADVANCE_SECONDS_SPA ?? d,
        transfer: e.AUTO_ADVANCE_SECONDS_TRANSFER ?? d,
      },
    },
    housekeepingTurnaroundSeconds: e.HOUSEKEEPING_TURNAROUND_SECONDS,
    earlyCheckinDays: e.EARLY_CHECKIN_DAYS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    // Render puts Cloudflare in front of its own proxy, so X-Forwarded-For ends "client, cloudflare":
    // two trusted hops there (Render sets RENDER=true), one behind a single proxy elsewhere.
    trustProxyHops: e.TRUST_PROXY_HOPS ?? (source.RENDER === 'true' ? 2 : 1),
    keepAlive: { url: e.KEEP_ALIVE_URL ?? e.RENDER_EXTERNAL_URL ?? null, minutes: e.KEEP_ALIVE_MINUTES },
  };
}
