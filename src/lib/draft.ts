/**
 * Draft persistence.
 *
 * Deliberately sessionStorage, not localStorage: a refresh or an accidental
 * back-navigation should not lose what you typed, but closing the tab should
 * leave nothing behind. Resume text is sensitive, and the privacy page states
 * exactly this behaviour.
 */

const RESUME_KEY = 'hireready:draft:resume';
const POSTING_KEY = 'hireready:draft:posting';

/** Guards against quota errors and storage being blocked entirely. */
function read(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Storage unavailable or full. The app works fine without it.
  }
}

export interface Draft {
  resume: string;
  posting: string;
}

export function loadDraft(): Draft {
  return { resume: read(RESUME_KEY), posting: read(POSTING_KEY) };
}

export function saveDraft(draft: Partial<Draft>): void {
  if (draft.resume !== undefined) write(RESUME_KEY, draft.resume);
  if (draft.posting !== undefined) write(POSTING_KEY, draft.posting);
}

export function clearDraft(): void {
  write(RESUME_KEY, '');
  write(POSTING_KEY, '');
}
