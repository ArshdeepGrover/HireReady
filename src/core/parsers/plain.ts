/**
 * The plain-text path.
 *
 * Kept free of any dependency so pasting text never pulls in pdf.js, and so the
 * engine can be exercised outside a browser.
 */

import { isBulletLine, normaliseText } from '../text';
import type { ParsedResume, ResumeLine, SourceKind } from '../types';

/** Rough line budget for one printed page, used to estimate length from text. */
const LINES_PER_PAGE = 46;

export function buildTextResume(
  raw: string,
  fileName: string | null,
  source: SourceKind = 'text',
): ParsedResume {
  const text = normaliseText(raw);
  const split = text.split('\n');
  const lines: ResumeLine[] = split.map((line) => ({
    text: line,
    page: 1,
    bullet: isBulletLine(line),
  }));

  return {
    text,
    lines,
    source,
    fileName,
    pageCount: Math.max(1, Math.ceil(split.filter((l) => l.trim()).length / LINES_PER_PAGE)),
    meta: {
      textDensity: text.replace(/\s/g, '').length,
      imageOnlyPages: [],
      multiColumn: false,
      rightColumnRatio: 0,
      brokenGlyphs: false,
      tabularRows: 0,
      textBoxChars: 0,
      imageCount: 0,
      contactInHeaderOnly: false,
      degraded: false,
    },
    hyperlinks: [...new Set(text.match(/https?:\/\/[^\s)<>"']+/gi) ?? [])],
    warnings: [],
  };
}

/** Wraps text the user pasted directly into the textarea. */
export function fromPastedText(raw: string): ParsedResume {
  return buildTextResume(raw, null, 'text');
}

/** RTF is plain enough to strip mechanically; it beats rejecting the file. */
export function stripRtf(raw: string): string {
  return raw
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '   ')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
