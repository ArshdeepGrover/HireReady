/** Length, file naming, dated conventions, and spelling. */

import { PERSONAL_DETAILS, SLOPPY_FILENAME_PATTERN } from '../dictionaries';
import { findPhrases, listPhrase, pluralise } from '../text';
import type { CheckFn, CheckResult } from '../types';

/**
 * Misspellings that show up constantly and are easy to miss because a spell
 * checker in the wrong locale lets several of them through. Keys are the
 * mistake, values the correction.
 */
const COMMON_TYPOS: Readonly<Record<string, string>> = {
  experiance: 'experience',
  experince: 'experience',
  expirience: 'experience',
  acheived: 'achieved',
  achived: 'achieved',
  acheivement: 'achievement',
  reponsible: 'responsible',
  responsable: 'responsible',
  resposible: 'responsible',
  managment: 'management',
  enviroment: 'environment',
  environement: 'environment',
  sucessful: 'successful',
  succesful: 'successful',
  sucessfully: 'successfully',
  comunication: 'communication',
  communcation: 'communication',
  techinical: 'technical',
  tecnical: 'technical',
  knowlege: 'knowledge',
  knowledgable: 'knowledgeable',
  colledge: 'college',
  univercity: 'university',
  universty: 'university',
  engeneering: 'engineering',
  enginering: 'engineering',
  engineeering: 'engineering',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperately: 'separately',
  occured: 'occurred',
  definately: 'definitely',
  liason: 'liaison',
  buisness: 'business',
  bussiness: 'business',
  persuing: 'pursuing',
  pursueing: 'pursuing',
  intrested: 'interested',
  proffesional: 'professional',
  profesional: 'professional',
  profficient: 'proficient',
  proficent: 'proficient',
  databse: 'database',
  algoritm: 'algorithm',
  algorithim: 'algorithm',
  framwork: 'framework',
  libary: 'library',
  libraray: 'library',
  developement: 'development',
  devlopment: 'development',
  developor: 'developer',
  devloper: 'developer',
  pyhton: 'Python',
  javasript: 'JavaScript',
  javscript: 'JavaScript',
  postgress: 'PostgreSQL',
  gratuated: 'graduated',
  garduation: 'graduation',
  acedemic: 'academic',
  cirriculum: 'curriculum',
  curriculam: 'curriculum',
  additionaly: 'additionally',
  particpated: 'participated',
  reccomend: 'recommend',
  reponsibilities: 'responsibilities',
  prefered: 'preferred',
  writting: 'writing',
  begining: 'beginning',
  independant: 'independent',
  maintainance: 'maintenance',
  maintenence: 'maintenance',
  perfomance: 'performance',
  peformance: 'performance',
  optimzation: 'optimisation',
  optimisaton: 'optimisation',
  fuctionality: 'functionality',
  funtionality: 'functionality',
  intergration: 'integration',
  authetication: 'authentication',
  authencation: 'authentication',
  deployement: 'deployment',
  responsibilty: 'responsibility',
  acomplished: 'accomplished',
  succesfully: 'successfully',
};

/** Brand names that are routinely miscapitalised in a way recruiters notice. */
const CASING_SLIPS: ReadonlyArray<{ wrong: RegExp; right: string }> = [
  { wrong: /\bjava\s+script\b/i, right: 'JavaScript' },
  { wrong: /\bnode\s+js\b/i, right: 'Node.js' },
  { wrong: /\bmy\s+sql\b/i, right: 'MySQL' },
  { wrong: /\bgit\s+hub\b/i, right: 'GitHub' },
  { wrong: /\bmongo\s+db\b/i, right: 'MongoDB' },
  { wrong: /\bpost\s+gres\b/i, right: 'PostgreSQL' },
];

export const hygieneChecks: CheckFn = (facts, doc) => {
  const checks: CheckResult[] = [];

  /* ---- personal details that should never be on a resume ---- */
  const personal = findPhrases(facts.lower, PERSONAL_DETAILS);
  checks.push({
    id: 'hygiene.personal',
    category: 'hygiene',
    label: 'No dated personal details',
    weight: 6,
    ...(personal.length === 0
      ? { state: 'pass' as const, score: 6, summary: 'None of the old bio-data fields are present.' }
      : personal.length <= 2
        ? {
            state: 'warn' as const,
            score: 3,
            summary: `Found ${listPhrase(personal)}.`,
            fix: 'Delete them. They are never used in a hiring decision, and in most markets asking for them is unlawful.',
            evidence: personal,
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `${pluralise(personal.length, 'bio-data field')}, including ${listPhrase(personal, 3)}.`,
            fix: 'This is the college template, and it signals inexperience immediately. Cut the whole block: father\'s name, date of birth, marital status, nationality and the declaration. That is often half a page returned to your projects.',
            evidence: personal.slice(0, 8),
          }),
  });

  /* ---- length ---- */
  const words = facts.wordCount;
  const ideal = words >= 300 && words <= 700;
  const acceptable = words >= 200 && words <= 900;
  checks.push({
    id: 'hygiene.length',
    category: 'hygiene',
    label: `Length - ${words} words`,
    weight: 5,
    ...(ideal
      ? { state: 'pass' as const, score: 5, summary: 'About right for a single page.' }
      : acceptable
        ? {
            state: 'warn' as const,
            score: 3,
            summary: words < 300 ? 'On the thin side.' : 'Slightly long for a first resume.',
            fix:
              words < 300
                ? 'Add a project, or add bullets to the ones you have. Aim for 300 to 700 words.'
                : 'Trim toward 700 words. Cut anything that is not a project, a skill, or education.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: words < 200 ? `Only ${words} words.` : `${words} words is too long.`,
            fix:
              words < 200
                ? 'There is not enough here to assess you. Two or three projects, each with three bullets and a number, fills a page honestly.'
                : 'Cut it back to one page. Remove the personal details, the declaration, and any bullet without a concrete outcome.',
          }),
  });

  /* ---- page count ---- */
  if (doc.source !== 'text') {
    checks.push({
      id: 'hygiene.pages',
      category: 'hygiene',
      label: `Pages - ${doc.pageCount}`,
      weight: 4,
      ...(doc.pageCount === 1
        ? { state: 'pass' as const, score: 4, summary: 'One page, which is the expectation for a first job.' }
        : doc.pageCount === 2
          ? {
              state: 'warn' as const,
              score: 2,
              summary: 'Two pages.',
              fix: 'With no full-time history, two pages reads as padding. Get it onto one.',
            }
          : {
              state: 'fail' as const,
              score: 0,
              summary: `${doc.pageCount} pages.`,
              fix: 'Nobody reads past page one for an entry-level role. Cut to a single page and keep only your strongest work.',
            }),
    });
  }

  /* ---- file name ---- */
  if (doc.fileName) {
    const base = doc.fileName.replace(/\.[^.]+$/, '');
    const sloppy = SLOPPY_FILENAME_PATTERN.test(base);
    const hasName = /^[a-z]+[\s_-][a-z]+/i.test(base) && base.length >= 6;
    checks.push({
      id: 'hygiene.filename',
      category: 'hygiene',
      label: 'File name',
      weight: 2,
      ...(!sloppy && hasName
        ? { state: 'pass' as const, score: 2, summary: `"${doc.fileName}" is clear.` }
        : {
            state: 'warn' as const,
            score: 0,
            summary: `"${doc.fileName}" is what the recruiter will see in their inbox.`,
            fix: 'Rename it to Firstname-Lastname-Resume.pdf. "resume_final_v2.pdf" gets lost among forty identical files.',
          }),
    });
  }

  /* ---- spelling ---- */
  const seen = new Set<string>();
  const typos: string[] = [];
  for (const word of facts.lower.match(/[a-z']{4,}/g) ?? []) {
    const correction = COMMON_TYPOS[word];
    if (correction && !seen.has(word)) {
      seen.add(word);
      typos.push(`${word} → ${correction}`);
    }
  }
  for (const slip of CASING_SLIPS) {
    const match = slip.wrong.exec(facts.text);
    if (match) typos.push(`${match[0]} → ${slip.right}`);
  }

  checks.push({
    id: 'hygiene.spelling',
    category: 'hygiene',
    label: 'Spelling',
    weight: 4,
    ...(typos.length === 0
      ? { state: 'pass' as const, score: 4, summary: 'No commonly misspelled words found.' }
      : typos.length <= 2
        ? {
            state: 'warn' as const,
            score: 2,
            summary: `${pluralise(typos.length, 'likely misspelling')}.`,
            fix: 'Fix these, then read the whole thing backwards one line at a time. Spelling errors on a one-page document are read as carelessness.',
            evidence: typos,
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `${pluralise(typos.length, 'likely misspelling')}.`,
            fix: 'Run it through a spell checker set to your locale, then have one other person read it. This many errors ends most applications on its own.',
            evidence: typos.slice(0, 8),
          }),
  });

  /* ---- ALL CAPS shouting ---- */
  const shoutingLines = facts.lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length < 25) return false;
    const letters = trimmed.replace(/[^a-z]/gi, '');
    if (letters.length < 15) return false;
    return letters === letters.toUpperCase();
  });

  if (shoutingLines.length > 0) {
    checks.push({
      id: 'hygiene.caps',
      category: 'hygiene',
      label: 'Sentence case',
      weight: 2,
      ...(shoutingLines.length <= 1
        ? {
            state: 'warn' as const,
            score: 1,
            summary: 'One long line is in capitals.',
            fix: 'Capitals are fine for short headings, hard to read for anything longer.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: `${pluralise(shoutingLines.length, 'long line')} set entirely in capitals.`,
            fix: 'Use sentence case for body text. Some parsers also lowercase everything, which loses the emphasis you were going for.',
          }),
    });
  }

  return checks;
};
