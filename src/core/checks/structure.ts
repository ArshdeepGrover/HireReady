/** Are the expected sections present, labelled plainly, and in a sane order? */

import { SECTION_PATTERNS } from '../dictionaries';
import { listPhrase, pluralise } from '../text';
import type { CheckFn, CheckResult, SectionKey } from '../types';

/** Four-digit years, and the ranges resumes use around them. */
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const RANGE_RE =
  /\b(?:(?:19|20)\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2})\s*(?:-|\u2013|\u2014|to|until|till)\s*(?:(?:19|20)\d{2}|present|current|ongoing|now|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2})/gi;

const LABELS: Record<SectionKey, string> = {
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  experience: 'Experience',
  summary: 'Summary',
  certifications: 'Certifications',
  achievements: 'Achievements',
  personal: 'Personal details',
  declaration: 'Declaration',
};

export const structureChecks: CheckFn = (facts) => {
  const checks: CheckResult[] = [];
  const keys = facts.sectionKeys;

  /* ---- the sections a screener expects to find ---- */
  const hasEducation = keys.has('education');
  const hasSkills = keys.has('skills');
  const hasEvidence = keys.has('projects') || keys.has('experience');

  let sectionScore = 0;
  if (hasEducation) sectionScore += 3;
  if (hasSkills) sectionScore += 3;
  if (hasEvidence) sectionScore += 4;

  const missing: string[] = [];
  if (!hasEducation) missing.push('Education');
  if (!hasSkills) missing.push('Skills');
  if (!hasEvidence) missing.push('Projects or Experience');

  checks.push({
    id: 'structure.sections',
    category: 'structure',
    label: 'Standard headings',
    weight: 10,
    score: sectionScore,
    ...(missing.length === 0
      ? {
          state: 'pass' as const,
          summary: 'Education, Skills and Projects or Experience are all labelled.',
          evidence: facts.sections
            .filter((s) => SECTION_PATTERNS.find((p) => p.key === s.key)?.expected)
            .map((s) => s.heading),
        }
      : {
          state: missing.length >= 2 ? ('fail' as const) : ('warn' as const),
          summary: `Missing ${listPhrase(missing)}.`,
          fix: 'Parsers look for these exact words to decide what each block of text is. Use plain headings: Education, Skills, Projects, Experience. Creative labels like "My Journey" get filed as nothing.',
        }),
  });

  /* ---- depth behind the headings ---- */
  const evidenceSections = facts.sections.filter(
    (s) => s.key === 'projects' || s.key === 'experience',
  );
  const evidenceBullets = evidenceSections.reduce(
    (sum, section) => sum + section.body.filter((line) => /^\s*(?:[•▪●◦*-]|\d+[.)])\s+/.test(line)).length,
    0,
  );

  if (hasEvidence) {
    checks.push({
      id: 'structure.depth',
      category: 'structure',
      label: 'Detail under each entry',
      weight: 5,
      ...(evidenceBullets >= 6
        ? {
            state: 'pass' as const,
            score: 5,
            summary: `${pluralise(evidenceBullets, 'bullet point')} across your projects and experience.`,
          }
        : evidenceBullets >= 2
          ? {
              state: 'warn' as const,
              score: 3,
              summary: `Only ${pluralise(evidenceBullets, 'bullet point')} backing up your projects.`,
              fix: 'Give each project two or three bullets: what you built, what you used, what it produced.',
            }
          : {
              state: 'fail' as const,
              score: 0,
              summary: 'Your projects are listed as titles with no detail.',
              fix: 'A title tells a recruiter nothing. Under each project, write two or three bullets covering what it does, the stack, and the result.',
            }),
    });
  }

  /* ---- dates ---- */
  const ranges = facts.text.match(RANGE_RE) ?? [];
  const years = facts.text.match(YEAR_RE) ?? [];
  checks.push({
    id: 'structure.dates',
    category: 'structure',
    label: 'Dates on entries',
    weight: 4,
    ...(ranges.length >= 2
      ? {
          state: 'pass' as const,
          score: 4,
          summary: `${pluralise(ranges.length, 'dated entry', 'dated entries')} found.`,
          evidence: ranges.slice(0, 3),
        }
      : ranges.length === 1 || years.length >= 2
        ? {
            state: 'warn' as const,
            score: 2,
            summary: 'Some entries have dates, others do not.',
            fix: 'Date everything: education, internships, projects. Use a consistent format such as "Jun 2025 – Aug 2025". Gaps in dating look like something is being hidden.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: 'No date ranges found.',
            fix: 'Add month and year ranges to your education and any experience. Screeners sort candidates by recency, and undated entries sort last.',
          }),
  });

  /* ---- order: evidence before filler ---- */
  const order = facts.sections.map((s) => s.key);
  const firstEvidence = order.findIndex((k) => k === 'projects' || k === 'experience');
  const personalIndex = order.findIndex((k) => k === 'personal' || k === 'declaration');
  const misordered = personalIndex !== -1 && firstEvidence !== -1 && personalIndex < firstEvidence;

  if (facts.sections.length >= 3) {
    checks.push({
      id: 'structure.order',
      category: 'structure',
      label: 'Section order',
      weight: 3,
      ...(misordered
        ? {
            state: 'fail' as const,
            score: 0,
            summary: `${LABELS[order[personalIndex] as SectionKey]} appears before your projects.`,
            fix: 'Nobody reads past the top third. Lead with Skills, then Projects or Experience, then Education. Anything personal goes last, or better, gets deleted.',
          }
        : {
            state: 'pass' as const,
            score: 3,
            summary: 'Your strongest sections come first.',
          }),
    });
  }

  /* ---- name at the top ---- */
  const firstLine = facts.lines.find((line) => line.trim().length > 0)?.trim() ?? '';
  const looksLikeName =
    firstLine.length > 0 &&
    firstLine.length <= 48 &&
    !/@|\d{4}/.test(firstLine) &&
    firstLine.split(/\s+/).length <= 5 &&
    /^[A-Za-z][A-Za-z.'\-\s]+$/.test(firstLine);

  checks.push({
    id: 'structure.name',
    category: 'structure',
    label: 'Name on the first line',
    weight: 3,
    ...(looksLikeName
      ? { state: 'pass' as const, score: 3, summary: `Reads as "${firstLine}".`, evidence: [firstLine] }
      : {
          state: 'warn' as const,
          score: 1,
          summary: 'The first line does not look like your name.',
          fix: 'Start with your name alone on line one, in the largest text on the page. Do not title the document "Resume" or "Curriculum Vitae"; everyone knows what it is.',
        }),
  });

  return checks;
};
