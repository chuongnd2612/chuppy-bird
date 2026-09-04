import { describe, expect, it } from 'vitest';
import {
  collectInlineAttachments,
  looksLikeImage,
  parseAttachmentUrl,
  renderAdoHtml,
} from './html.ts';

const GUID = 'a1b2c3d4-1111-2222-3333-444455556666';

describe('parseAttachmentUrl', () => {
  it('parses a cloud attachment URL', () => {
    const url = `https://dev.azure.com/acme/Payments/_apis/wit/attachments/${GUID}?fileName=shot.png`;
    expect(parseAttachmentUrl(url)).toEqual({ id: GUID, fileName: 'shot.png' });
  });

  it('parses an on-prem collection URL', () => {
    const url = `https://tfs.internal/tfs/DefaultCollection/_apis/wit/attachments/${GUID}?fileName=a.png`;
    expect(parseAttachmentUrl(url)?.id).toBe(GUID);
  });

  it('parses a relative URL', () => {
    expect(parseAttachmentUrl(`../../_apis/wit/attachments/${GUID}?fileName=b.png`)?.id).toBe(GUID);
  });

  it('parses the legacy TFS FileAttachment form', () => {
    expect(parseAttachmentUrl('/tfs/FileAttachment.aspx?FileID=12345&FileName=old.png')?.id).toBe(
      '12345',
    );
  });

  it('lowercases the guid so the cache key is stable', () => {
    expect(parseAttachmentUrl(`_apis/wit/attachments/${GUID.toUpperCase()}`)?.id).toBe(GUID);
  });

  it('returns null for an unrelated URL', () => {
    expect(parseAttachmentUrl('https://example.com/cat.png')).toBeNull();
  });

  it('handles a missing fileName', () => {
    expect(parseAttachmentUrl(`_apis/wit/attachments/${GUID}`)?.fileName).toBeNull();
  });
});

describe('looksLikeImage', () => {
  it('recognises image extensions and rejects the rest', () => {
    expect(looksLikeImage('a.PNG')).toBe(true);
    expect(looksLikeImage('a.webp')).toBe(true);
    expect(looksLikeImage('spec.docx')).toBe(false);
    expect(looksLikeImage(null)).toBe(false);
  });
});

describe('renderAdoHtml', () => {
  it('rewrites an attachment image onto the proxy', () => {
    const html = `<div><img src="https://dev.azure.com/acme/P/_apis/wit/attachments/${GUID}?fileName=shot.png"></div>`;
    const out = renderAdoHtml(html) ?? '';
    expect(out).toContain(`/api/attachments/${GUID}?fileName=shot.png`);
    expect(out).not.toContain('dev.azure.com');
    expect(out).toContain('loading="lazy"');
  });

  it('leaves an inline data image alone', () => {
    const out = renderAdoHtml('<img src="data:image/png;base64,iVBORw0KGgo=">') ?? '';
    expect(out).toContain('data:image/png;base64');
  });

  it('strips scripts and event handlers', () => {
    const out = renderAdoHtml('<div onclick="steal()">hi<script>bad()</script></div>') ?? '';
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).toContain('hi');
  });

  it('strips a javascript: link but keeps the text', () => {
    const out = renderAdoHtml('<a href="javascript:bad()">click</a>') ?? '';
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });

  it('keeps the table and list markup ADO uses', () => {
    const html = '<table><tr><th colspan="2">H</th></tr><tr><td>a</td><td>b</td></tr></table><ol><li>x</li></ol>';
    const out = renderAdoHtml(html) ?? '';
    expect(out).toContain('<table>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('<ol><li>x</li></ol>');
  });

  it('keeps mention pills so they can be styled like ADO', () => {
    const out = renderAdoHtml('<span data-vss-mention="version:2.0">@Mai Tran</span>') ?? '';
    expect(out).toContain('data-vss-mention');
  });

  it('keeps safe inline styles and drops dangerous ones', () => {
    const out = renderAdoHtml('<span style="color:#ff0000;position:fixed">red</span>') ?? '';
    expect(out).toContain('color:#ff0000');
    expect(out).not.toContain('position');
  });

  it('opens links in a new tab without leaking the referrer', () => {
    const out = renderAdoHtml('<a href="https://example.com">x</a>') ?? '';
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('returns null for empty or markup-only fields', () => {
    expect(renderAdoHtml(null)).toBeNull();
    expect(renderAdoHtml('')).toBeNull();
    expect(renderAdoHtml('<div><p>&nbsp;</p></div>')).toBeNull();
  });

  it('keeps a field whose only content is an image', () => {
    expect(renderAdoHtml(`<div><img src="_apis/wit/attachments/${GUID}?fileName=a.png"></div>`)).not.toBeNull();
  });
});

describe('collectInlineAttachments', () => {
  it('lists each inline attachment once', () => {
    const html = `<img src="_apis/wit/attachments/${GUID}?fileName=a.png"><img src="_apis/wit/attachments/${GUID}?fileName=a.png">`;
    expect(collectInlineAttachments(html)).toEqual([{ id: GUID, fileName: 'a.png' }]);
  });

  it('ignores non-attachment sources', () => {
    expect(collectInlineAttachments('<img src="https://example.com/a.png">')).toEqual([]);
  });
});
