import { z } from 'zod';
import type { ServiceType } from '../../shared/types';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const seconds = z.coerce.number().int().min(1).max(86_400);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/hms.sqlite'),
  HOTEL_CONFIG_PATH: z.string().default('./config/hotel.json'),
  CLIENT_DIR: z.string().default('./dist/client'),
  RESET_DB_ON_START: bool.default('false'),

  // Auto-progress ("option B"): service requests move to their next status on a timer.
  AUTO_ADVANCE_ENABLED: bool.default('true'),
  AUTO_ADVANCE_TICK_SECONDS: seconds.default(5),
  AUTO_ADVANCE_SECONDS: seconds.default(60),
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
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
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
  };
}
