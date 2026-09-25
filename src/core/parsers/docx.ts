/**
 * DOCX extraction.
 *
 * A .docx is a zip of XML. Walking the document tree in order preserves the
 * things that matter for scoring and that a naive tag-strip destroys:
 * list structure, table layout, text boxes, and hyperlink destinations.
 */

import JSZip from 'jszip';
import { isBulletLine, normaliseText } from '../text';
import type { ParseMeta, ParsedResume, ResumeLine } from '../types';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const CONTACT_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s\-()]{8,}/;

interface Block {
  text: string;
  bullet: boolean;
  fromTextBox: boolean;
}

function children(node: Element, localName: string): Element[] {
  return Array.from(node.children).filter(
    (child) => child.namespaceURI === W_NS && child.localName === localName,
  );
}

function firstChild(node: Element, localName: string): Element | null {
  return children(node, localName)[0] ?? null;
}

/** Concatenates the visible text of a paragraph, honouring tabs and breaks. */
function paragraphText(paragraph: Element): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI !== W_NS) {
        walk(child);
        continue;
      }
      switch (child.localName) {
        case 't':
          out += child.textContent ?? '';
          break;
        case 'tab':
          out += '   ';
          break;
        case 'br':
        case 'cr':
          out += '\n';
          break;
        case 'noBreakHyphen':
          out += '-';
          break;
        case 'sym':
          out += ' ';
          break;
        case 'pPr':
        case 'rPr':
          break;
        default:
          walk(child);
      }
    }
  };
  walk(paragraph);
  return out;
}

/** True when Word marks the paragraph as a numbered or bulleted list item. */
function isListParagraph(paragraph: Element): boolean {
  const properties = firstChild(paragraph, 'pPr');
  if (!properties) return false;
  if (firstChild(properties, 'numPr')) return true;
  const style = firstChild(properties, 'pStyle')?.getAttributeNS(W_NS, 'val') ?? '';
  return /listparagraph|listbullet|listnumber/i.test(style);
}

function isInsideTextBox(node: Element): boolean {
  let current: Element | null = node;
  while (current) {
    if (current.localName === 'txbxContent' || current.localName === 'textbox') return true;
    current = current.parentElement;
  }
  return false;
}

function collectBlocks(root: Element): { blocks: Block[]; tableRows: number } {
  const blocks: Block[] = [];
  let tableRows = 0;

  const visit = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI === W_NS && child.localName === 'p') {
        const text = paragraphText(child);
        if (text.trim()) {
          blocks.push({
            text,
            bullet: isListParagraph(child),
            fromTextBox: isInsideTextBox(child),
          });
        }
        // Paragraphs can still contain text boxes with their own paragraphs.
        for (const nested of Array.from(child.getElementsByTagNameNS(W_NS, 'txbxContent'))) {
          visit(nested);
        }
        continue;
      }

      if (child.namespaceURI === W_NS && child.localName === 'tbl') {
        for (const row of children(child, 'tr')) {
          tableRows += 1;
          const cells = children(row, 'tc').map((cell) =>
            children(cell, 'p').map(paragraphText).join(' ').trim(),
          );
          const joined = cells.filter(Boolean).join('   ');
          if (joined) blocks.push({ text: joined, bullet: false, fromTextBox: false });
        }
        continue;
      }

      visit(child);
    }
  };

  visit(root);
  return { blocks, tableRows };
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The DOCX contains malformed XML and could not be read.');
  }
  return doc;
}

async function readHyperlinks(zip: JSZip): Promise<string[]> {
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!relsFile) return [];
  try {
    const doc = parseXml(await relsFile.async('string'));
    const urls: string[] = [];
    for (const rel of Array.from(doc.getElementsByTagNameNS(REL_NS, 'Relationship'))) {
      const target = rel.getAttribute('Target') ?? '';
      if (/^https?:\/\//i.test(target) || target.startsWith('mailto:')) urls.push(target);
    }
    return urls;
  } catch {
    return [];
  }
}

/** Headers and footers are the classic place for contact details to vanish. */
async function readHeaderFooterText(zip: JSZip): Promise<string> {
  const names = Object.keys(zip.files).filter((name) =>
    /^word\/(header|footer)\d*\.xml$/i.test(name),
  );
  const parts: string[] = [];
  for (const name of names) {
    const file = zip.file(name);
    if (!file) continue;
    try {
      const doc = parseXml(await file.async('string'));
      const root = doc.documentElement;
      if (root) parts.push(collectBlocks(root).blocks.map((b) => b.text).join('\n'));
    } catch {
      // A broken header should not fail the whole parse.
    }
  }
  return parts.join('\n').trim();
}

export async function parseDocx(data: ArrayBuffer, fileName: string): Promise<ParsedResume> {
  const zip = await JSZip.loadAsync(data);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('That file is not a readable Word document. Export it again as .docx.');
  }

  const doc = parseXml(await documentFile.async('string'));
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] ?? doc.documentElement;
  if (!body) throw new Error('The Word document appears to be empty.');

  const { blocks, tableRows } = collectBlocks(body);
  const hyperlinks = await readHyperlinks(zip);
  const headerFooterText = await readHeaderFooterText(zip);
  const imageCount = Object.keys(zip.files).filter((name) =>
    /^word\/media\//i.test(name),
  ).length;

  const warnings: string[] = [];
  const lines: ResumeLine[] = [];

  for (const block of blocks) {
    // Word stores soft line breaks inside one paragraph; split them so bullet
    // and length heuristics see individual lines.
    for (const piece of block.text.split('\n')) {
      const text = piece.trim();
      if (!text) continue;
      const bullet = block.bullet || isBulletLine(text);
      lines.push({
        // Restore a visible marker so downstream bullet checks work on text alone.
        text: block.bullet && !isBulletLine(text) ? `• ${text}` : text,
        page: 1,
        bullet,
      });
    }
  }

  const textBoxChars = blocks
    .filter((b) => b.fromTextBox)
    .reduce((sum, b) => sum + b.text.replace(/\s/g, '').length, 0);

  const text = normaliseText(lines.map((l) => l.text).join('\n'));
  const bodyHasContact = CONTACT_PATTERN.test(text);
  const headerHasContact = CONTACT_PATTERN.test(headerFooterText);
  const contactInHeaderOnly = headerHasContact && !bodyHasContact;

  if (textBoxChars > 60) {
    warnings.push('Some text sits inside a text box or shape. Many parsers skip those.');
  }
  if (contactInHeaderOnly) {
    warnings.push('Your contact details are in the page header, where parsers often miss them.');
  }

  // Word's estimate is the only page count available without rendering.
  const pageCount = await readPageCount(zip);

  const meta: ParseMeta = {
    textDensity: text.replace(/\s/g, '').length,
    imageOnlyPages: [],
    multiColumn: tableRows > 0 && tableRows >= lines.length * 0.25,
    rightColumnRatio: 0,
    brokenGlyphs: false,
    tabularRows: tableRows,
    textBoxChars,
    imageCount,
    contactInHeaderOnly,
    degraded: false,
  };

  return {
    text,
    lines,
    source: 'docx',
    fileName,
    pageCount,
    meta,
    hyperlinks,
    warnings,
  };
}

/** Reads the page count Word caches in docProps/app.xml, if present. */
async function readPageCount(zip: JSZip): Promise<number> {
  const file = zip.file('docProps/app.xml');
  if (!file) return 1;
  try {
    const xml = await file.async('string');
    const match = /<Pages>(\d+)<\/Pages>/i.exec(xml);
    const pages = match?.[1] ? Number.parseInt(match[1], 10) : 1;
    return Number.isFinite(pages) && pages > 0 ? pages : 1;
  } catch {
    return 1;
  }
}
