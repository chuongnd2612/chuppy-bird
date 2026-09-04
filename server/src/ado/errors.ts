/** Everything the routes need to turn an ADO failure into an honest HTTP reply. */
export class AdoError extends Error {
  readonly status: number;
  /** What the user can actually do about it, when we know. */
  readonly hint?: string;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = 'AdoError';
    this.status = status;
    this.hint = hint;
  }
}

export class AdoAuthError extends AdoError {
  constructor(message: string, hint?: string) {
    super(message, 401, hint);
    this.name = 'AdoAuthError';
  }
}

export const PAT_HINT =
  'Check that the PAT has not expired and carries the Work Items (Read) and ' +
  'Project and Team (Read) scopes for this organization.';
