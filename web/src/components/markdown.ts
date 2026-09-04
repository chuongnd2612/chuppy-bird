/**
 * A deliberately small Markdown renderer for the streamed analysis.
 *
 * Only the constructs the skill actually emits are handled — headings, lists,
 * bold, inline code, fenced code. Everything is escaped first, so partial
 * markup arriving mid-stream can never become live HTML. Pulling in a full
 * Markdown library for this would be a lot of bytes on a phone.
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

export function renderMarkdown(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1]?.length ?? 1, 4) + 2;
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(bullet[1] ?? '')}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}
