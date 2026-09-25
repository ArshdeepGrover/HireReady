/** Text normalisation and structural parsing shared by every check. */

import { SECTION_PATTERNS } from './dictionaries';
import type { DetectedSection, ParsedResume, ResumeFacts, SectionKey } from './types';

/** Characters used as list markers across Word, Google Docs and LaTeX exports. */
const BULLET_CHARS = '\\u2022\\u2023\\u25AA\\u25CF\\u25E6\\u2043\\u2219\\u00B7\\u2212\\u002D\\u2013\\u2014\\u00BB\\u203A\\u2751\\u27A4\\u2714\\u2717\\uF0A7\\uF0B7\\u25A0\\u25AB\\u2756';

export const BULLET_PREFIX = new RegExp(`^\\s*(?:[${BULLET_CHARS}*o]|\\d{1,2}[.)])\\s+`);

/** True when a line reads as a list item rather than prose. */
export function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line);
}

/** Removes a leading bullet marker, leaving the sentence. */
export function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX, '').trim();
}

/**
 * Collapses the assorted Unicode that PDF and Word exports emit into plain
 * ASCII equivalents, so the dictionaries only ever need one spelling.
 */
export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0|\u2007|\u202F/g, ' ')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\t/g, '    ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

/** Splits into words, ignoring punctuation-only tokens. */
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((w) => w.length > 0);
}

/** Counts occurrences of each needle that appears in the haystack. */
export function findPhrases(lower: string, phrases: readonly string[]): string[] {
  const found: string[] = [];
  for (const phrase of phrases) {
    if (lower.includes(phrase)) found.push(phrase);
  }
  return found;
}

/**
 * Whole-word variant of {@link findPhrases}. Prevents "r" matching "react" or
 * "go" matching "going".
 */
export function findTerms(lower: string, terms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Tech terms often end in punctuation (c++, .net, node.js), so the trailing
    // boundary has to allow for that rather than relying on \b.
    const re = new RegExp(`(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#])`, 'i');
    if (re.test(lower)) found.push(term);
  }
  return found;
}

/**
 * A heading is a short line that is not a sentence: title case or all caps,
 * no trailing full stop, and matching one of the known section patterns.
 */
function headingKey(line: string): SectionKey | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return null;
  if (isBulletLine(trimmed)) return null;

  // Strip decoration some templates add around headings.
  const cleaned = trimmed
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[\s:_\-–—=|]+$/, '')
    .toLowerCase();
  if (!cleaned) return null;

  // A heading rarely carries sentence punctuation or more than four words.
  if (/[.!?,;]$/.test(trimmed)) return null;
  if (cleaned.split(/\s+/).length > 5) return null;

  for (const pattern of SECTION_PATTERNS) {
    if (pattern.re.test(cleaned)) return pattern.key;
  }
  return null;
}

/** Splits the resume into sections keyed by recognised headings. */
export function detectSections(lines: string[]): DetectedSection[] {
  const sections: DetectedSection[] = [];
  let current: DetectedSection | null = null;

  lines.forEach((line, index) => {
    const key = headingKey(line);
    if (key) {
      current = { key, heading: line.trim(), lineIndex: index, body: [] };
      sections.push(current);
      return;
    }
    if (current && line.trim()) current.body.push(line.trim());
  });

  return sections;
}

/** Computes the derived facts every check reads from. */
export function buildFacts(doc: ParsedResume): ResumeFacts {
  const text = doc.text;
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const bullets = lines
    .map((l) => l.trim())
    .filter((l) => isBulletLine(l) && stripBullet(l).length > 10)
    .map(stripBullet);
  const sections = detectSections(lines);

  return {
    text,
    lower: text.toLowerCase(),
    lines,
    words,
    wordCount: words.length,
    charCount: text.replace(/\s/g, '').length,
    bullets,
    header: nonEmpty.slice(0, 6).join('\n'),
    sections,
    sectionKeys: new Set(sections.map((s) => s.key)),
  };
}

/** Truncates an excerpt for display without cutting mid-word. */
export function excerpt(value: string, max = 90): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max)}…`;
}

/**
 * Joins a list into readable prose: "a, b and c", or "a, b, c and 4 more" when
 * the list is longer than `max`. Only one "and" ever appears.
 */
export function listPhrase(items: readonly string[], max = 3): string {
  const shown = items.slice(0, max);
  if (shown.length === 0) return '';

  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0] ?? '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
