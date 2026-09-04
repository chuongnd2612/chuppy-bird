import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import type { AdoClient, AdoRequestOptions } from './client.ts';
import { AdoService, MAX_COMMENT_LENGTH, textToAdoHtml } from './service.ts';

const { config } = loadConfig({
  ADO_BASE_URL: 'https://dev.azure.com/acme',
  ADO_PAT: 'pat',
  APP_PASSWORD: 'pw',
  SESSION_SECRET: 's'.repeat(32),
});

describe('textToAdoHtml', () => {
  // ADO comments are an HTML field, and the real ADO web UI renders whatever we
  // store. Posting raw input would inject markup into every client.
  it('escapes markup rather than storing it', () => {
    expect(textToAdoHtml('<script>alert(1)</script>')).toBe(
      '<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>',
    );
  });

  it('escapes ampersands and quotes', () => {
    expect(textToAdoHtml('a & b "c"')).toBe('<div>a &amp; b &quot;c&quot;</div>');
  });

  it('keeps line breaks as separate blocks', () => {
    expect(textToAdoHtml('one\ntwo')).toBe('<div>one</div><div>two</div>');
  });

  it('preserves a blank line between paragraphs', () => {
    expect(textToAdoHtml('one\n\ntwo')).toBe('<div>one</div><div><br></div><div>two</div>');
  });

  it('handles CRLF from a desktop browser', () => {
    expect(textToAdoHtml('one\r\ntwo')).toBe('<div>one</div><div>two</div>');
  });
});

function serviceWith(handler: (options: AdoRequestOptions) => unknown) {
  const requestJson = vi.fn(async (options: AdoRequestOptions) => handler(options));
  const client = { requestJson } as unknown as AdoClient;
  return { service: new AdoService(client, config), requestJson };
}

describe('addComment', () => {
  const created = {
    id: 9,
    text: '<div>Looks right to me</div>',
    createdBy: { displayName: 'Hao Nguyen' },
    createdDate: '2026-09-04T10:00:00Z',
  };

  it('posts to the comments endpoint on the preview api version', async () => {
    const { service, requestJson } = serviceWith(() => created);
    const comment = await service.addComment('Payments', 1042, 'Looks right to me');

    const call = requestJson.mock.calls[0]?.[0];
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe('Payments/_apis/wit/workItems/1042/comments');
    expect(call?.apiVersion).toBe('7.1-preview.4');
    expect(call?.body).toEqual({ text: '<div>Looks right to me</div>' });
    expect(comment).toMatchObject({ id: 9, createdBy: { displayName: 'Hao Nguyen' } });
  });

  it('sanitizes what comes back, same as any other comment', async () => {
    const { service } = serviceWith(() => ({
      ...created,
      text: '<div>hi<script>bad()</script></div>',
    }));
    const comment = await service.addComment('P', 1, 'hi');
    expect(comment.html).not.toContain('script');
  });

  it('rejects an empty comment without calling ADO', async () => {
    const { service, requestJson } = serviceWith(() => created);
    await expect(service.addComment('P', 1, '   ')).rejects.toMatchObject({ status: 400 });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('rejects a comment past the ADO length limit', async () => {
    const { service } = serviceWith(() => created);
    await expect(service.addComment('P', 1, 'x'.repeat(MAX_COMMENT_LENGTH + 1))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('drops the cached thread so the new comment is not hidden by the cache', async () => {
    const { service, requestJson } = serviceWith((options) =>
      options.method === 'POST' ? created : { comments: [] },
    );

    await service.listComments('P', 1);
    await service.listComments('P', 1);
    expect(requestJson).toHaveBeenCalledTimes(1); // second read was cached

    await service.addComment('P', 1, 'new');
    await service.listComments('P', 1);
    expect(requestJson).toHaveBeenCalledTimes(3); // post, then a fresh read
  });
});
