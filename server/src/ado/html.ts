import sanitizeHtml from 'sanitize-html';

/**
 * Azure DevOps stores rich-text fields and comments as HTML, and embeds images
 * as `<img src=".../_apis/wit/attachments/{guid}?fileName=x.png">`.
 *
 * Those URLs need the PAT. A browser loading one gets a sign-in page back, so
 * every image in every ticket renders broken. Rewriting each attachment URL
 * onto our own proxy is what makes a ticket look the way it does in ADO.
 */

/** `_apis/wit/attachments/{guid}` in absolute, relative, and on-prem URLs alike. */
const ATTACHMENT_PATTERN = /_apis\/wit\/attachments\/([0-9a-fA-F-]{36})/;
/** The legacy TFS form, still emitted by older on-prem collections. */
const LEGACY_ATTACHMENT_PATTERN = /FileAttachment(?:\.aspx)?\?.*?FileID=([0-9a-fA-F-]+)/i;

export interface AttachmentRef {
  id: string;
  fileName: string | null;
}

/** Pulls the attachment id and filename out of an ADO attachment URL. */
export function parseAttachmentUrl(rawUrl: string): AttachmentRef | null {
  const match = ATTACHMENT_PATTERN.exec(rawUrl) ?? LEGACY_ATTACHMENT_PATTERN.exec(rawUrl);
  if (!match?.[1]) return null;

  let fileName: string | null = null;
  const queryStart = rawUrl.indexOf('?');
  if (queryStart !== -1) {
    // Parse against a dummy base so relative URLs work too.
    const params = new URLSearchParams(rawUrl.slice(queryStart + 1));
    fileName = params.get('fileName') ?? params.get('filename');
  }
  return { id: match[1].toLowerCase(), fileName };
}

/** The URL the browser should load instead. */
export function proxyAttachmentUrl({ id, fileName }: AttachmentRef): string {
  const query = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
  return `/api/attachments/${encodeURIComponent(id)}${query}`;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export function looksLikeImage(fileName: string | null): boolean {
  return fileName !== null && IMAGE_EXTENSIONS.test(fileName);
}

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strike', 'strong', 'sub', 'sup',
    'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'data-attachment-id'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    // ADO renders @mentions as a span carrying the identity; keep the marker so
    // the client can style it as a pill the way ADO does.
    span: ['data-vss-mention', 'class'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/],
      'font-weight': [/^\d+$/, /^bold(er)?$/],
      'font-style': [/^italic$/],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [/^(underline|line-through|none)$/],
      width: [/^\d+(\.\d+)?(px|%|em|rem)$/],
      height: [/^\d+(\.\d+)?(px|%|em|rem)$/],
    },
  },
  // data: is allowed on <img> only, for the inline base64 images ADO sometimes
  // stores. Allowing it anywhere else would reopen a scripting vector.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    img: (tagName, attribs) => {
      const src = attribs['src'] ?? '';
      const ref = parseAttachmentUrl(src);
      if (!ref) return { tagName, attribs };
      return {
        tagName,
        attribs: {
          ...attribs,
          src: proxyAttachmentUrl(ref),
          'data-attachment-id': ref.id,
          // Let the browser lay the page out before images arrive, and skip
          // loading the ones below the fold on a phone.
          loading: 'lazy',
        },
      };
    },
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
  },
};

// `loading` is set by the transform above, so it has to be permitted too.
(options.allowedAttributes as Record<string, string[]>)['img']?.push('loading');

/**
 * Sanitizes an ADO rich-text field and points every attachment at our proxy.
 * Returns null for fields that are absent or contain nothing but markup, so the
 * UI can skip the section entirely rather than render an empty heading.
 */
export function renderAdoHtml(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = sanitizeHtml(raw, options);
  const hasText = clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
  const hasMedia = /<img\b/i.test(clean);
  return hasText || hasMedia ? clean : null;
}

/** Every attachment referenced inline, so the detail view can list them. */
export function collectInlineAttachments(raw: string | null | undefined): AttachmentRef[] {
  if (!raw) return [];
  const found = new Map<string, AttachmentRef>();
  for (const match of raw.matchAll(/src\s*=\s*["']([^"']+)["']/gi)) {
    const ref = parseAttachmentUrl(match[1] ?? '');
    if (ref && !found.has(ref.id)) found.set(ref.id, ref);
  }
  return [...found.values()];
}
