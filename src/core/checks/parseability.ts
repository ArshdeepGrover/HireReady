/**
 * Can the software read the file at all?
 *
 * These are the highest-stakes checks in the product. A resume that fails here
 * is often scored as if it were blank, no matter how good the content is.
 */

import { pluralise } from '../text';
import type { CheckFn, CheckResult } from '../types';

export const parseabilityChecks: CheckFn = (facts, doc) => {
  const checks: CheckResult[] = [];
  const { meta } = doc;
  const pasted = doc.source === 'text';

  /* ---- text actually came out ---- */
  const density = meta.textDensity;
  checks.push({
    id: 'parse.text',
    category: 'parse',
    label: 'Selectable text',
    weight: 10,
    ...(density >= 1200
      ? {
          state: 'pass' as const,
          score: 10,
          summary: `${density.toLocaleString()} characters read cleanly.`,
        }
      : density >= 400
        ? {
            state: 'warn' as const,
            score: 5,
            summary: `Only ${density.toLocaleString()} characters came out.`,
            fix: 'That is thin for a resume. Check that nothing is trapped in an image, and add detail to your projects.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: meta.imageOnlyPages.length
              ? `${pluralise(meta.imageOnlyPages.length, 'page')} contained no readable text.`
              : 'Almost no text could be extracted.',
            fix: 'Scans, screenshots and exported images read as completely blank. Export a text-based PDF straight from Word, Docs or your editor.',
          }),
  });

  /* ---- reading order ---- */
  if (pasted) {
    checks.push({
      id: 'parse.order',
      category: 'parse',
      label: 'Reading order',
      state: 'info',
      score: 0,
      weight: 0,
      summary: 'Not checked, because pasted text has no layout.',
      fix: 'Upload the actual PDF or Word file to have the layout checked too.',
    });
  } else if (meta.multiColumn) {
    checks.push({
      id: 'parse.order',
      category: 'parse',
      label: 'Reading order',
      state: 'fail',
      score: 0,
      weight: 6,
      summary: 'A two-column layout was detected.',
      fix: 'Parsers read straight across the page, so columns interleave into nonsense. Rebuild it as one single column, top to bottom.',
    });
  } else if (meta.rightColumnRatio > 0.35) {
    checks.push({
      id: 'parse.order',
      category: 'parse',
      label: 'Reading order',
      state: 'warn',
      score: 3,
      weight: 6,
      summary: 'A lot of text starts on the right half of the page.',
      fix: 'Sidebars and floating blocks can be read out of order. Keep the main content in one column.',
    });
  } else {
    checks.push({
      id: 'parse.order',
      category: 'parse',
      label: 'Reading order',
      state: 'pass',
      score: 6,
      weight: 6,
      summary: 'Single column, read top to bottom.',
    });
  }

  /* ---- font integrity ---- */
  checks.push(
    pasted
      ? {
          id: 'parse.fonts',
          category: 'parse',
          label: 'Font encoding',
          state: 'info',
          score: 0,
          weight: 0,
          summary: 'Not checked for pasted text.',
        }
      : meta.brokenGlyphs
        ? {
            id: 'parse.fonts',
            category: 'parse',
            label: 'Font encoding',
            state: 'fail',
            score: 0,
            weight: 3,
            summary: 'The extracted text is mostly unreadable characters.',
            fix: 'The embedded font has a broken character map, common in LaTeX and Canva exports. Re-export with a standard font such as Calibri, Arial or Lato.',
          }
        : {
            id: 'parse.fonts',
            category: 'parse',
            label: 'Font encoding',
            state: 'pass',
            score: 3,
            weight: 3,
            summary: 'Characters decoded correctly.',
          },
  );

  /* ---- text boxes, shapes and tables used for layout ---- */
  if (pasted) {
    checks.push({
      id: 'parse.containers',
      category: 'parse',
      label: 'Text boxes and tables',
      state: 'info',
      score: 0,
      weight: 0,
      summary: 'Not checked for pasted text.',
    });
  } else {
    const heavyTables = meta.tabularRows >= 6;
    const hasTextBoxes = meta.textBoxChars > 60;
    const bad = hasTextBoxes || meta.multiColumn;
    checks.push({
      id: 'parse.containers',
      category: 'parse',
      label: 'Text boxes and tables',
      weight: 4,
      ...(bad
        ? {
            state: 'fail' as const,
            score: 0,
            summary: hasTextBoxes
              ? `${meta.textBoxChars} characters sit inside text boxes or shapes.`
              : 'Layout is built out of table cells.',
            fix: 'Text boxes and shapes are frequently skipped entirely. Move everything into ordinary paragraphs.',
          }
        : heavyTables
          ? {
              state: 'warn' as const,
              score: 2,
              summary: `${pluralise(meta.tabularRows, 'table-like row')} detected.`,
              fix: 'Tables usually survive, but cells can be merged in the wrong order. Plain paragraphs are safer.',
            }
          : {
              state: 'pass' as const,
              score: 4,
              summary: 'No risky containers found.',
            }),
    });
  }

  /* ---- images ---- */
  if (!pasted && (meta.imageCount > 0 || doc.source === 'docx')) {
    const risky = meta.imageCount > 0;
    checks.push({
      id: 'parse.images',
      category: 'parse',
      label: 'Images and photos',
      weight: 2,
      ...(risky
        ? {
            state: 'warn' as const,
            score: 1,
            summary: `${pluralise(meta.imageCount, 'embedded image')} found.`,
            fix: 'Logos, icons and photos contribute nothing a parser can read, and a photo invites bias. Remove them unless the role expects one.',
          }
        : {
            state: 'pass' as const,
            score: 2,
            summary: 'No embedded images.',
          }),
    });
  }

  /* ---- contact details stranded in the page header ---- */
  if (meta.contactInHeaderOnly) {
    checks.push({
      id: 'parse.header',
      category: 'parse',
      label: 'Header and footer',
      state: 'fail',
      score: 0,
      weight: 4,
      summary: 'Your contact details only appear in the page header.',
      fix: 'Page headers and footers are routinely stripped before parsing. Put your name, email and phone in the body of the first page.',
    });
  }

  /* ---- file format ---- */
  checks.push({
    id: 'parse.format',
    category: 'parse',
    label: 'File format',
    weight: pasted ? 0 : 3,
    ...(pasted
      ? {
          state: 'info' as const,
          score: 0,
          summary: 'You pasted text, so format was not judged.',
          fix: 'Send applications as a PDF exported from your editor unless the posting asks for Word.',
        }
      : doc.source === 'pdf'
        ? {
            state: 'pass' as const,
            score: 3,
            summary: 'PDF, which is the safe default.',
          }
        : {
            state: 'pass' as const,
            score: 3,
            summary: 'Word .docx, which parses reliably.',
          }),
  });

  /* ---- a sanity check that the file has a resume's shape ---- */
  if (facts.wordCount > 0 && facts.lines.filter((l) => l.trim()).length < 8) {
    checks.push({
      id: 'parse.shape',
      category: 'parse',
      label: 'Document structure',
      state: 'fail',
      score: 0,
      weight: 3,
      summary: 'Everything collapsed into a handful of lines.',
      fix: 'Line breaks were lost, which makes sections and bullets impossible to identify. Re-export the file rather than copying from a preview pane.',
    });
  }

  return checks;
};
