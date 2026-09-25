/**
 * File-type dispatch.
 *
 * The PDF and DOCX readers are imported dynamically. pdf.js alone is around a
 * megabyte, and most visitors either paste text or never get that far, so it
 * should not be part of the initial download.
 */

import type { ParsedResume } from '../types';
import { buildTextResume, stripRtf } from './plain';

export { fromPastedText } from './plain';

/** Resumes are small. Anything larger is a mistake. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.rtf'] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

/** Thrown for problems the user can fix by choosing a different file. */
export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  if (file.size === 0) throw new UnsupportedFileError('That file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    throw new UnsupportedFileError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. A resume should be well under 12MB.`,
    );
  }

  const name = file.name || 'resume';
  const lower = name.toLowerCase();

  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return buildTextResume(await file.text(), name);
  }

  if (lower.endsWith('.rtf')) {
    return buildTextResume(stripRtf(await file.text()), name);
  }

  if (lower.endsWith('.doc')) {
    throw new UnsupportedFileError(
      'Old .doc files cannot be read in the browser. Open it, then save as .docx or PDF.',
    );
  }

  if (lower.endsWith('.pages')) {
    throw new UnsupportedFileError('Pages files need exporting to PDF or Word first.');
  }

  const buffer = await file.arrayBuffer();

  if (lower.endsWith('.pdf') || hasPdfSignature(buffer)) {
    const { parsePdf } = await import('./pdf');
    return parsePdf(buffer, name);
  }

  if (lower.endsWith('.docx') || hasZipSignature(buffer)) {
    const { parseDocx } = await import('./docx');
    return parseDocx(buffer, name);
  }

  throw new UnsupportedFileError(
    'Use a PDF, Word (.docx) or text file. Anything else needs converting first.',
  );
}

function hasPdfSignature(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer.slice(0, 5));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

function hasZipSignature(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer.slice(0, 2));
  return head[0] === 0x50 && head[1] === 0x4b;
}
