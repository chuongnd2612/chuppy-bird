import { useCallback } from 'react';

interface AdoHtmlProps {
  html: string;
  /** Called when an inline image is tapped, so it can open full-screen. */
  onImageTap?: (src: string, alt: string) => void;
}

/**
 * Renders a rich-text field from Azure DevOps.
 *
 * The HTML is inserted directly, which is safe *because the server sanitized
 * it*: sanitize-html runs over an allowlist in server/src/ado/html.ts, and the
 * same pass rewrites attachment URLs onto our proxy. Never point this at HTML
 * that has not been through renderAdoHtml.
 */
export function AdoHtml({ html, onImageTap }: AdoHtmlProps) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.tagName !== 'IMG' || !onImageTap) return;
      const image = target as HTMLImageElement;
      event.preventDefault();
      onImageTap(image.src, image.alt || 'Attachment');
    },
    [onImageTap],
  );

  return (
    <div
      className="ado-html"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
