/**
 * PDF extraction via pdf.js.
 *
 * Beyond pulling text out, this reconstructs enough layout to answer the
 * question that actually matters: would a parser read this in the right order?
 * Two-column resumes and image-only exports are the two failure modes that
 * silently destroy an application, so both are detected here.
 */

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isBulletLine, normaliseText } from '../text';
import type { ParseMeta, ParsedResume, ResumeLine } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Site root, so the helper asset paths survive being deployed under a subpath. */
const BASE_URL = import.meta.env.BASE_URL;

/** The shape of a pdf.js text item we rely on. */
interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
  fontName?: string;
}

interface Fragment {
  text: string;
  x: number;
  right: number;
  y: number;
  size: number;
}

interface LineGroup {
  page: number;
  y: number;
  x: number;
  right: number;
  size: number;
  text: string;
  /** Horizontal runs of text, used for column and table detection. */
  clusters: Array<{ x: number; right: number; words: number }>;
}

/** Text below this per page almost certainly means the page is a scan. */
const IMAGE_PAGE_CHAR_FLOOR = 120;

/** Two fragments on the same visual line if their baselines are this close. */
const BASELINE_TOLERANCE = 2.6;

/** A horizontal void this wide (as a share of page width) separates columns. */
const COLUMN_GAP_RATIO = 0.14;

function groupIntoLines(fragments: Fragment[], page: number, pageWidth: number): LineGroup[] {
  if (fragments.length === 0) return [];

  // Top to bottom, then left to right.
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Fragment[][] = [];
  let currentRow: Fragment[] = [];
  let rowY = sorted[0]!.y;

  for (const fragment of sorted) {
    if (Math.abs(fragment.y - rowY) <= BASELINE_TOLERANCE) {
      currentRow.push(fragment);
    } else {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [fragment];
      rowY = fragment.y;
    }
  }
  if (currentRow.length) rows.push(currentRow);

  const gapThreshold = pageWidth * COLUMN_GAP_RATIO;

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    const clusters: LineGroup['clusters'] = [];
    let text = '';
    let cluster = { x: ordered[0]!.x, right: ordered[0]!.right, words: 0 };

    ordered.forEach((fragment, index) => {
      const previous = index > 0 ? ordered[index - 1] : undefined;
      const gap = previous ? fragment.x - previous.right : 0;

      if (previous && gap > gapThreshold) {
        cluster.words += countWords(text.slice(text.lastIndexOf('\u0000') + 1));
        clusters.push(cluster);
        cluster = { x: fragment.x, right: fragment.right, words: 0 };
        text += '\u0000'; // cluster marker, stripped below
      } else if (previous && gap > 0.8) {
        text += ' ';
      }
      text += fragment.text;
      cluster.right = Math.max(cluster.right, fragment.right);
    });
    clusters.push(cluster);

    const segments = text.split('\u0000');
    segments.forEach((segment, index) => {
      const target = clusters[index];
      if (target) target.words = countWords(segment);
    });

    return {
      page,
      y: ordered[0]!.y,
      x: ordered[0]!.x,
      right: Math.max(...ordered.map((f) => f.right)),
      size: median(ordered.map((f) => f.size)),
      // Wide gaps become a run of spaces so the text still reads sensibly.
      text: text.split('\u0000').join('   ').replace(/\s+/g, ' ').trim(),
      clusters,
    };
  });
}

function countWords(value: string): number {
  return value.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * A row is "split" when it holds two substantial blocks of text separated by a
 * wide gap. Right-aligned dates also produce a gap, so both sides must carry
 * real content before the row counts.
 */
function isSplitRow(line: LineGroup): boolean {
  if (line.clusters.length < 2) return false;
  const substantial = line.clusters.filter((c) => c.words >= 3);
  return substantial.length >= 2;
}

/**
 * Mojibake detection. Broken font encodings yield text that is mostly
 * non-alphabetic or riddled with replacement characters.
 */
function looksLikeBrokenGlyphs(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length < 200) return false;
  if (/\uFFFD/.test(stripped)) return true;
  const letters = (stripped.match(/[a-z]/gi) ?? []).length;
  return letters / stripped.length < 0.45;
}

export async function parsePdf(data: ArrayBuffer, fileName: string): Promise<ParsedResume> {
  // Keep the loading task: destroying it is what tears down the worker, and
  // without that a few uploads in a row leak a worker each.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    // Nothing is rendered, so there is no reason to build font faces.
    disableFontFace: true,
    // Character maps, needed to turn CID-keyed font glyphs into real text.
    // Served from our own origin by the pdfjsAssets plugin in vite.config.ts.
    cMapUrl: `${BASE_URL}pdf/cmaps/`,
    cMapPacked: true,
    // Same idea for PDFs that reference a base-14 font without embedding it.
    standardFontDataUrl: `${BASE_URL}pdf/standard_fonts/`,
    // The WASM decoders only matter for images, which are never decoded here.
    useWasm: false,
  });
  const pdf = await loadingTask.promise;

  const lines: ResumeLine[] = [];
  const imageOnlyPages: number[] = [];
  const warnings: string[] = [];
  const hyperlinks = new Set<string>();
  let splitRows = 0;
  let totalRows = 0;
  let tabularRows = 0;
  let rightStarts = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      // Anchor text can hide the real destination, so read link annotations too.
      try {
        const annotations = (await page.getAnnotations()) as Array<{ url?: string }>;
        for (const annotation of annotations) {
          if (annotation.url) hyperlinks.add(annotation.url);
        }
      } catch {
        // Annotations are a bonus signal; a failure here must not stop parsing.
      }

      const fragments: Fragment[] = [];
      for (const raw of content.items as unknown as TextItemLike[]) {
        if (typeof raw.str !== 'string' || raw.str.length === 0) continue;
        const x = raw.transform[4] ?? 0;
        const y = raw.transform[5] ?? 0;
        const size = Math.abs(raw.transform[3] ?? raw.height ?? 0);
        fragments.push({ text: raw.str, x, right: x + (raw.width ?? 0), y, size });
      }

      const grouped = groupIntoLines(fragments, pageNumber, viewport.width);
      const pageChars = grouped.reduce((sum, line) => sum + line.text.replace(/\s/g, '').length, 0);
      if (pageChars < IMAGE_PAGE_CHAR_FLOOR) imageOnlyPages.push(pageNumber);

      for (const line of grouped) {
        totalRows += 1;
        if (isSplitRow(line)) splitRows += 1;
        if (line.clusters.filter((c) => c.words >= 1).length >= 3) tabularRows += 1;
        if (line.x > viewport.width * 0.55) rightStarts += 1;

        lines.push({
          text: line.text,
          page: pageNumber,
          x: line.x,
          y: line.y,
          size: line.size,
          bullet: isBulletLine(line.text),
        });
      }

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = normaliseText(lines.map((l) => l.text).join('\n'));
  const rightColumnRatio = totalRows > 0 ? rightStarts / totalRows : 0;
  const splitRatio = totalRows > 0 ? splitRows / totalRows : 0;

  if (imageOnlyPages.length > 0) {
    warnings.push(
      imageOnlyPages.length === pdf.numPages
        ? 'No selectable text found. This looks like a scan or an exported image.'
        : `Page ${imageOnlyPages.join(', ')} had almost no selectable text.`,
    );
  }

  const meta: ParseMeta = {
    textDensity: text.replace(/\s/g, '').length,
    imageOnlyPages,
    multiColumn: splitRatio >= 0.2 && splitRows >= 4,
    rightColumnRatio,
    brokenGlyphs: looksLikeBrokenGlyphs(text),
    tabularRows,
    // PDF flattens shapes into plain positioned text, so there is nothing
    // extra to recover and nothing extra at risk.
    textBoxChars: 0,
    imageCount: imageOnlyPages.length,
    contactInHeaderOnly: false,
    degraded: false,
  };

  return {
    text,
    lines,
    source: 'pdf',
    fileName,
    pageCount: pdf.numPages,
    meta,
    hyperlinks: [...hyperlinks],
    warnings,
  };
}
