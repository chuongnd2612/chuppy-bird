import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown escaping', () => {
  // This output goes through dangerouslySetInnerHTML, so escaping is the whole
  // safety argument for the component.
  it('neutralises a script tag in the model output', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises an img onerror payload', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes inside code fences too', () => {
    const html = renderMarkdown('```\n<script>x</script>\n```');
    expect(html).toContain('<pre><code>');
    expect(html).not.toContain('<script>');
  });

  it('escapes inside inline code', () => {
    expect(renderMarkdown('`<b>hi</b>`')).toContain('<code>&lt;b&gt;hi&lt;/b&gt;</code>');
  });
});

describe('renderMarkdown formatting', () => {
  it('renders headings, shifted down so they sit under the section title', () => {
    expect(renderMarkdown('## Findings')).toBe('<h4>Findings</h4>');
  });

  it('renders bullet lists as a single list', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('closes a list when prose follows', () => {
    expect(renderMarkdown('- one\n\ntext')).toBe('<ul><li>one</li></ul><p>text</p>');
  });

  it('renders bold and inline code', () => {
    expect(renderMarkdown('**bold** and `code`')).toBe(
      '<p><strong>bold</strong> and <code>code</code></p>',
    );
  });

  it('does not turn a bare asterisk into emphasis', () => {
    expect(renderMarkdown('2 * 3 = 6')).toBe('<p>2 * 3 = 6</p>');
  });

  it('closes an unterminated code fence, which a cancelled stream leaves behind', () => {
    const html = renderMarkdown('```\nhalf a block');
    expect(html).toContain('<pre><code>');
    expect(html.endsWith('</code></pre>')).toBe(true);
  });

  it('renders partial output mid-stream without producing live markup', () => {
    // Every prefix of a document must be safe, since the panel re-renders on
    // each delta.
    const document = '# Title\n\n- point **one**\n\n```\ncode <b>\n```\n';
    for (let i = 1; i <= document.length; i++) {
      const html = renderMarkdown(document.slice(0, i));
      expect(html).not.toMatch(/<b>/);
    }
  });
});
