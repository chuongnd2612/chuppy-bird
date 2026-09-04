import { adoBaseUrl, type Config } from '../config.ts';
import { AdoAuthError, AdoError, PAT_HINT } from './errors.ts';

export interface AdoRequestOptions {
  /** Path under the collection root, e.g. `_apis/projects` or `Payments/_apis/wit/wiql`. */
  path: string;
  query?: Record<string, string | number | undefined>;
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Overrides the configured version; some endpoints are preview-only. */
  apiVersion?: string;
  signal?: AbortSignal;
}

export interface AdoClientOptions {
  config: Config;
  fetchImpl?: typeof fetch;
  /** Injected so tests do not actually wait out the backoff. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Thin wrapper over the ADO REST API.
 *
 * The one thing worth knowing: when a PAT is expired, revoked, or missing a
 * scope, Azure DevOps does not answer 401. It answers **203 with an HTML
 * sign-in page**, which parses as neither JSON nor an error unless you look for
 * it. `assertNotSignInPage` below is what turns that into a real auth failure
 * instead of a confusing "Unexpected token '<'".
 */
export class AdoClient {
  readonly #config: Config;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #authHeader: string;

  constructor({
    config,
    fetchImpl = fetch,
    sleep = defaultSleep,
    maxRetries = 3,
    timeoutMs = 20_000,
  }: AdoClientOptions) {
    this.#config = config;
    this.#fetch = fetchImpl;
    this.#sleep = sleep;
    this.#maxRetries = maxRetries;
    this.#timeoutMs = timeoutMs;
    // ADO wants the PAT as the password with an empty username.
    this.#authHeader = `Basic ${Buffer.from(`:${config.ADO_PAT ?? ''}`).toString('base64')}`;
  }

  buildUrl({ path, query, apiVersion }: Pick<AdoRequestOptions, 'path' | 'query' | 'apiVersion'>): string {
    const url = new URL(`${adoBaseUrl(this.#config)}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    url.searchParams.set('api-version', apiVersion ?? this.#config.ADO_API_VERSION);
    return url.toString();
  }

  /** Issues the request and returns the raw Response, retries already applied. */
  async requestRaw(options: AdoRequestOptions): Promise<Response> {
    const url = this.buildUrl(options);
    const headers: Record<string, string> = {
      Authorization: this.#authHeader,
      Accept: 'application/json',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      if (attempt > 0) await this.#sleep(backoffMs(attempt));

      const timeout = AbortSignal.timeout(this.#timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
          redirect: 'manual',
        });
      } catch (error) {
        // The caller gave up, or the whole request timed out — do not retry a
        // deliberate abort.
        if (options.signal?.aborted) throw error;
        lastError = error;
        if (attempt === this.#maxRetries) break;
        continue;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.#maxRetries) {
        lastError = new AdoError(`Azure DevOps returned ${response.status}`, 502);
        continue;
      }
      return response;
    }

    throw new AdoError(
      `Could not reach Azure DevOps: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      504,
      'The server needs network access to Azure DevOps — check the VPN on the machine running it.',
    );
  }

  async requestJson<T>(options: AdoRequestOptions): Promise<T> {
    const response = await this.requestRaw(options);
    assertNotSignInPage(response);

    if (!response.ok) {
      throw await toAdoError(response);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AdoError('Azure DevOps returned a response that was not JSON.', 502);
    }
  }
}

function backoffMs(attempt: number): number {
  // 200ms, 400ms, 800ms — plus jitter so parallel board fetches do not sync up.
  return 2 ** (attempt - 1) * 200 + Math.floor(Math.random() * 100);
}

/**
 * Azure DevOps answers a bad PAT with 203 + an HTML sign-in page, and a 302 to
 * the login host when the collection is behind an interactive auth flow.
 */
export function assertNotSignInPage(response: Response): void {
  const contentType = response.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('text/html');

  if (response.status === 203 || (isHtml && response.status < 400)) {
    throw new AdoAuthError('Azure DevOps rejected the PAT and returned its sign-in page.', PAT_HINT);
  }
  if (response.status === 302 || response.status === 301) {
    throw new AdoAuthError(
      'Azure DevOps redirected to an interactive sign-in instead of answering the API.',
      PAT_HINT,
    );
  }
}

async function toAdoError(response: Response): Promise<AdoError> {
  const body = await response.text().catch(() => '');
  let message = `Azure DevOps returned ${response.status}`;
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) message = parsed.message;
  } catch {
    // Non-JSON error bodies are common on on-prem; the status carries the signal.
  }

  switch (response.status) {
    case 401:
    case 403:
      return new AdoAuthError(message, PAT_HINT);
    case 404:
      return new AdoError(message, 404, 'Check the project, team, or work item exists and the PAT can see it.');
    case 429:
      return new AdoError(message, 429, 'Azure DevOps is rate limiting this PAT; try again shortly.');
    default:
      return new AdoError(message, response.status >= 500 ? 502 : response.status);
  }
}
