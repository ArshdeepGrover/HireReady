/**
 * Builds minimal PDFs used to exercise the PDF parser in a real browser.
 *
 * Dependency-free on purpose: a PDF writer small enough to read is a better
 * test fixture than a binary blob, because the expected text and the exact
 * x/y placement of every line is visible right here.
 *
 * Usage: node scripts/make-test-pdfs.mjs <outputDir>
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** Escapes the three characters that are special inside a PDF string. */
function pdfString(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * @param {Array<Array<{x:number,y:number,size:number,text:string}>>} pages
 */
function buildPdf(pages) {
  const objects = [];
  const pageCount = pages.length;

  // Object numbering: 1 catalog, 2 pages, then per page a page object and a
  // content stream, then the font as the final object.
  const fontId = 3 + pageCount * 2;
  const pageIds = pages.map((_, index) => 3 + index * 2);

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] ` +
    `/Count ${pageCount} >>`;

  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;

    const stream = lines
      .map(
        (line) =>
          `BT /F1 ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${pdfString(line.text)}) Tj ET`,
      )
      .join('\n');

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;

    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  // Serialise, recording the byte offset of every object for the xref table.
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  const size = objects.length;

  pdf += `xref\n0 ${size}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id < size; id += 1) {
    pdf += offsets[id] === undefined
      ? '0000000000 65535 f \n'
      : `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** Lays out lines down the page from a starting y, in one column. */
function column(startY, x, lines, { size = 11, leading = 16 } = {}) {
  return lines.map((text, index) => ({
    x,
    y: startY - index * leading,
    size,
    text,
  }));
}

/* ---------------- fixture 1: a clean single-column resume ---------------- */

const singleColumn = buildPdf([
  [
    ...column(790, 60, ['Priya Nair'], { size: 20, leading: 0 }),
    ...column(766, 60, [
      'priya.nair@gmail.com | +91 98765 43210 | Pune, India',
      'https://linkedin.com/in/priyanair | https://github.com/priyanair',
    ]),
    ...column(716, 60, ['SKILLS'], { size: 13, leading: 0 }),
    ...column(696, 60, [
      'Languages: Python, JavaScript, SQL',
      'Frameworks: Django, React, Node.js',
      'Data: PostgreSQL, MongoDB, Redis',
      'Tools: Git, Docker, AWS, Linux, Postman',
    ]),
    ...column(610, 60, ['PROJECTS'], { size: 13, leading: 0 }),
    ...column(590, 60, [
      'Attendance Tracker - Django, PostgreSQL (Feb 2026 - Apr 2026)',
      '- Built a QR-based attendance system now recording 1,800 entries a week',
      '- Designed a PostgreSQL schema with 7 tables, cutting report time to 400ms',
      '- Automated weekly summary emails, saving staff roughly 5 hours a week',
      '',
      'Recipe Search API - Node.js, MongoDB (Oct 2025 - Dec 2025)',
      '- Developed a REST API serving 12,000 recipes with full-text search',
      '- Reduced median response time from 900ms to 120ms by adding Redis caching',
      '- Wrote 30 unit tests with Jest, reaching 88% coverage',
    ]),
    ...column(410, 60, ['EXPERIENCE'], { size: 13, leading: 0 }),
    ...column(390, 60, [
      'Backend Intern, Northwind Labs, Pune (Jun 2025 - Aug 2025)',
      '- Migrated 22 API endpoints from Flask to Django, cutting errors by 40%',
      '- Fixed 35 reported bugs and cleared the triage backlog two weeks early',
    ]),
    ...column(330, 60, ['EDUCATION'], { size: 13, leading: 0 }),
    ...column(310, 60, [
      'B.Tech Computer Science, Pune Institute of Technology (2022 - 2026)',
      'Coursework: Data Structures, Operating Systems, DBMS, Computer Networks',
    ]),
  ],
]);

/* ---------------- fixture 2: the same content in two columns ---------------- */
/*
 * A narrow left sidebar and a wide right main area, both carrying several words
 * on the same baselines. This is the layout the reading-order check must catch.
 */

const leftLines = [
  'CONTACT DETAILS HERE',
  'priya.nair@gmail.com',
  'Phone +91 98765 43210',
  'Pune, Maharashtra, India',
  'SKILLS AND TOOLING',
  'Python and Django stack',
  'JavaScript with React',
  'PostgreSQL and MongoDB',
  'Git, Docker and AWS',
  'EDUCATION HISTORY',
  'B.Tech Computer Science',
  'Pune Institute of Tech',
  'Graduating in June 2026',
];

const rightLines = [
  'PROFESSIONAL EXPERIENCE AND PROJECTS',
  'Attendance Tracker built with Django and PostgreSQL',
  'Built a QR based attendance system recording 1,800 entries',
  'Designed a schema with seven tables cutting report time',
  'Automated the weekly summary emails for all staff members',
  'Recipe Search API built with Node.js and MongoDB',
  'Developed a REST API serving twelve thousand recipes',
  'Reduced median response time from 900ms down to 120ms',
  'Wrote thirty unit tests with Jest reaching 88 percent',
  'Backend Intern at Northwind Labs in Pune during 2025',
  'Migrated twenty two API endpoints from Flask to Django',
  'Fixed thirty five reported bugs and cleared the backlog',
  'Collaborated with two designers in weekly sprint cycles',
];

const twoColumn = buildPdf([
  [
    ...column(790, 60, ['Priya Nair'], { size: 20, leading: 0 }),
    // Left sidebar: x 60, roughly 150pt wide.
    ...column(740, 60, leftLines, { size: 10, leading: 22 }),
    // Right main column: starts at x 250, well past the 14% gap threshold.
    ...column(740, 250, rightLines, { size: 10, leading: 22 }),
  ],
]);

/* ---------------- fixture 3: an image-only page (no text at all) ---------------- */

const noText = buildPdf([[{ x: 60, y: 780, size: 11, text: 'CV' }]]);

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node scripts/make-test-pdfs.mjs <outputDir>');
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  const files = [
    ['single-column.pdf', singleColumn],
    ['two-column.pdf', twoColumn],
    ['no-text.pdf', noText],
  ];

  for (const [name, buffer] of files) {
    await writeFile(join(outDir, name), buffer);
    console.log(`  ${name.padEnd(20)} ${(buffer.length / 1024).toFixed(1)}kB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
