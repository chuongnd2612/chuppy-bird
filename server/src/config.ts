import { z } from 'zod';

/**
 * Everything the server needs, read once at boot so a misconfigured instance
 * fails immediately instead of at the first request from a phone.
 */
const schema = z
  .object({
    /**
     * Collection root, no trailing slash:
     *   cloud   → https://dev.azure.com/my-org
     *   on-prem → https://tfs.internal/tfs/DefaultCollection
     */
    ADO_BASE_URL: z.string().url().optional(),
    ADO_PAT: z.string().min(1).optional(),
    /** Overridable because Azure DevOps Server trails the cloud by a version or two. */
    ADO_API_VERSION: z.string().default('7.1'),

    /** Gate in front of the whole app. Empty disables it — see the boot warning. */
    APP_PASSWORD: z.string().default(''),
    SESSION_SECRET: z.string().default(''),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 14),

    PORT: z.coerce.number().int().positive().default(8787),
    HOST: z.string().default('127.0.0.1'),

    /** Serve bundled fixtures instead of calling ADO, so the UI runs with no PAT. */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /** Seconds to keep ADO responses in the in-memory cache. */
    CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),

    /* ---- Claude analysis ---- */

    AI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** Resolved on PATH unless an absolute path is given. */
    CLAUDE_BIN: z.string().default('claude'),
    /** Invoked as `/<skill>`; must be installed where this server runs. */
    AI_SKILL: z.string().default('ado-ticket-analyze'),
    /** Model alias or id; empty leaves the CLI default in place. */
    AI_MODEL: z.string().default(''),
    /**
     * Working directory for the CLI. The ticket JSON is written here and
     * nothing else, so the analysis cannot wander into the repo.
     */
    AI_WORKSPACE_DIR: z.string().default(''),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    /** This runs on a personal machine; more than a couple at once is unkind. */
    AI_MAX_CONCURRENT: z.coerce.number().int().positive().default(1),
    AI_PERMISSION_MODE: z
      .enum(['dontAsk', 'acceptEdits', 'plan', 'default', 'auto'])
      .default('dontAsk'),
    /** Comma-separated. Kept narrow by default: the skill only needs to read. */
    AI_ALLOWED_TOOLS: z.string().default('Read,Grep,Glob'),
    /**
     * How the skill is invoked. {skill} and {file} are substituted. Configurable
     * because only the skill's author knows what arguments it expects.
     */
    AI_PROMPT_TEMPLATE: z.string().default('/{skill} {file}'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.DEMO_MODE) return;
    for (const key of ['ADO_BASE_URL', 'ADO_PAT'] as const) {
      if (!cfg[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required unless DEMO_MODE=true`,
        });
      }
    }
  });

export type Config = z.infer<typeof schema>;

export interface LoadedConfig {
  config: Config;
  /** Non-fatal problems worth shouting about at boot. */
  warnings: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoadedConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${details}`);
  }

  const config = parsed.data;
  const warnings: string[] = [];

  if (!config.APP_PASSWORD) {
    warnings.push(
      'APP_PASSWORD is empty: the app is UNAUTHENTICATED. Anyone who reaches this ' +
        'server can read your work items. Only acceptable behind your own access proxy.',
    );
  } else if (!config.SESSION_SECRET) {
    warnings.push(
      'SESSION_SECRET is empty: a random secret was generated, so every restart ' +
        'signs everyone out. Set one to keep sessions across restarts.',
    );
  }

  if (config.ADO_BASE_URL?.endsWith('/')) {
    warnings.push('ADO_BASE_URL has a trailing slash; it will be trimmed.');
  }

  return { config, warnings };
}

/** Collection root with any trailing slash removed. */
export function adoBaseUrl(config: Config): string {
  if (!config.ADO_BASE_URL) throw new Error('ADO_BASE_URL is not configured');
  return config.ADO_BASE_URL.replace(/\/+$/, '');
}
