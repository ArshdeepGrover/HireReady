/**
 * Shared types for the HireReady analysis engine.
 *
 * The engine is deliberately pure: parsers turn a file into a `ParsedResume`,
 * checks turn a `ParsedResume` into `CheckResult`s, and the scorer turns those
 * into a `Report`. Nothing in `src/core` touches the DOM or the network, which
 * is what lets the whole thing run locally in the browser.
 */

/**
 * `info` marks a check that could not be judged for this input, such as a
 * layout check when the user pasted plain text. Info checks carry weight 0 so
 * they never move the score in either direction.
 */
export type CheckState = 'pass' | 'warn' | 'fail' | 'info';

export type CategoryId = 'parse' | 'contact' | 'structure' | 'impact' | 'skills' | 'hygiene';

export type SourceKind = 'pdf' | 'docx' | 'text';

/** A single line of a resume, with layout hints when the format provides them. */
export interface ResumeLine {
  text: string;
  /** Page number, 1-based. Always 1 for formats without pages. */
  page: number;
  /** Horizontal offset of the line start, in PDF user-space units. */
  x?: number;
  /** Vertical offset, in PDF user-space units. Larger is higher on the page. */
  y?: number;
  /** Dominant font size on the line, when known. */
  size?: number;
  /** True when the line looks like a list item. */
  bullet: boolean;
}

/** Layout and integrity signals gathered while parsing, used by parseability checks. */
export interface ParseMeta {
  /** Characters of real text recovered, whitespace excluded. */
  textDensity: number;
  /** Pages whose text yield was so low they are probably images. */
  imageOnlyPages: number[];
  /** Two or more text columns detected, which scramble reading order. */
  multiColumn: boolean;
  /** Fraction of lines that begin in the right half of the page. */
  rightColumnRatio: number;
  /** Glyph runs that decoded to junk, a sign of a broken font encoding. */
  brokenGlyphs: boolean;
  /** Tab-separated or grid-like rows, which many parsers flatten incorrectly. */
  tabularRows: number;
  /** Characters found inside text boxes or shapes, which parsers often skip. */
  textBoxChars: number;
  /** Embedded images, which carry no text a parser can read. */
  imageCount: number;
  /** Contact details appear in a page header or footer, where they get dropped. */
  contactInHeaderOnly: boolean;
  /** The parser had to fall back to a cruder strategy. */
  degraded: boolean;
}

export interface ParsedResume {
  /** Normalised plain text, newline separated. */
  text: string;
  lines: ResumeLine[];
  source: SourceKind;
  fileName: string | null;
  pageCount: number;
  meta: ParseMeta;
  /**
   * URLs recovered from link annotations and relationships. A resume can show
   * "LinkedIn" as anchor text with the real URL hidden in the file, so link
   * checks need to look here as well as in the visible text.
   */
  hyperlinks: string[];
  /** Non-fatal problems worth surfacing to the user. */
  warnings: string[];
}

/** Cheap derived facts computed once and shared by every check. */
export interface ResumeFacts {
  text: string;
  lower: string;
  lines: string[];
  words: string[];
  wordCount: number;
  charCount: number;
  bullets: string[];
  /** The first 6 non-empty lines, where contact details belong. */
  header: string;
  sections: DetectedSection[];
  /** Section keys that were found, for quick lookup. */
  sectionKeys: Set<SectionKey>;
}

export type SectionKey =
  | 'education'
  | 'skills'
  | 'projects'
  | 'experience'
  | 'summary'
  | 'certifications'
  | 'achievements'
  | 'personal'
  | 'declaration';

export interface DetectedSection {
  key: SectionKey;
  /** The heading exactly as written in the resume. */
  heading: string;
  lineIndex: number;
  /** Body lines belonging to this section. */
  body: string[];
}

export interface CheckResult {
  id: string;
  category: CategoryId;
  /** Short label, shown in the checklist. */
  label: string;
  state: CheckState;
  /** Points earned, 0..weight. */
  score: number;
  /** Points available. Doubles as the importance of the check. */
  weight: number;
  /** One line stating what was found. Always present. */
  summary: string;
  /** Concrete instruction. Present whenever state is not 'pass'. */
  fix?: string;
  /** Verbatim excerpts or matched terms that justify the verdict. */
  evidence?: string[];
}

export interface CategoryScore {
  id: CategoryId;
  name: string;
  blurb: string;
  score: number;
  weight: number;
  /** 0..100 */
  pct: number;
  checks: CheckResult[];
}

export type BandId = 'rework' | 'weak' | 'close' | 'ready';

export interface Band {
  id: BandId;
  label: string;
  message: string;
}

export interface Report {
  /** 0..100, weighted across every check. */
  score: number;
  band: Band;
  categories: CategoryScore[];
  checks: CheckResult[];
  /** Highest-impact failures first, capped for readability. */
  actions: CheckResult[];
  facts: Pick<ResumeFacts, 'wordCount' | 'charCount'> & {
    bulletCount: number;
    pageCount: number;
    sectionCount: number;
  };
  source: SourceKind;
  fileName: string | null;
  generatedAt: string;
}

/* ---------- job description matching ---------- */

export interface KeywordMatch {
  term: string;
  /** Times the term appears in the posting. */
  count: number;
  /** True when the resume already contains the term. */
  matched: boolean;
  /** Recognised as a concrete tool or technology rather than generic prose. */
  isSkill: boolean;
}

export interface JobMatch {
  /** 0..100 coverage of the posting's meaningful terms. */
  coverage: number;
  /** Coverage restricted to recognised tools and technologies. */
  skillCoverage: number;
  terms: KeywordMatch[];
  matched: KeywordMatch[];
  missing: KeywordMatch[];
}

export type CheckFn = (facts: ResumeFacts, doc: ParsedResume) => CheckResult[];
