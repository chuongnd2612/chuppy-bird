import { useMemo } from 'react';

import { renderMarkdown } from './markdown.ts';

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  // Safe: renderMarkdown escapes every character of the source before adding
  // any markup of its own. See markdown.test.ts.
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
