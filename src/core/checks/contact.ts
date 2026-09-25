/** Can a recruiter reach you, and can they see your work? */

import { excerpt, listPhrase } from '../text';
import type { CheckFn, CheckResult } from '../types';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d[\d\s-]{7,13}\d/g;

/** Local-part patterns that read as a school-era address. */
const UNPROFESSIONAL_EMAIL = [
  'cool', 'rocks', 'rockstar', 'killer', 'king', 'queen', 'prince', 'princess', 'angel',
  'devil', 'babu', 'sweet', 'cutie', 'cute', 'sexy', 'hot', 'luv', 'lover', 'xoxo',
  'gamer', 'gaming', 'noob', 'pro', 'ninja', 'legend', 'boss', 'don', 'bro', 'dude',
  'crazy', 'mad', 'smart', 'genius', 'lucky', 'shy', 'alone', 'sad', 'heart', 'star',
];

interface LinkKind {
  key: string;
  label: string;
  patterns: RegExp;
}

const LINK_KINDS: readonly LinkKind[] = [
  { key: 'linkedin', label: 'LinkedIn', patterns: /linkedin\.com\/in\/|linkedin\.com\/pub\/|linkedin\.com/i },
  { key: 'code', label: 'GitHub or GitLab', patterns: /github\.com|gitlab\.com|bitbucket\.org|codeberg\.org/i },
  { key: 'portfolio', label: 'a portfolio site', patterns: /(?:https?:\/\/|www\.)[\w-]+\.(?:dev|me|io|com|net|in|xyz|site|tech|design|co)\b/i },
  { key: 'writing', label: 'writing or design work', patterns: /medium\.com|dev\.to|hashnode|substack|behance\.net|dribbble\.com|notion\.site|kaggle\.com|leetcode\.com|codeforces\.com/i },
];

/** Domains that are not a personal link even though they match the portfolio pattern. */
const LINK_NOISE = /(?:gmail|yahoo|outlook|hotmail|rediffmail|protonmail|icloud)\.(?:com|co\.in)/i;

export const contactChecks: CheckFn = (facts, doc) => {
  const checks: CheckResult[] = [];

  // Link destinations may be hidden behind anchor text, so search both.
  const searchable = `${facts.text}\n${doc.hyperlinks.join('\n')}`;

  const emails = [...new Set(facts.text.match(EMAIL_RE) ?? [])];
  const phones = (facts.text.match(PHONE_RE) ?? []).filter((raw) => {
    const digits = raw.replace(/\D/g, '');
    // Reject year ranges, PIN codes and other numeric noise.
    return digits.length >= 10 && digits.length <= 14;
  });

  const hasEmail = emails.length > 0;
  const hasPhone = phones.length > 0;

  checks.push({
    id: 'contact.reachable',
    category: 'contact',
    label: 'Email and phone',
    weight: 8,
    ...(hasEmail && hasPhone
      ? {
          state: 'pass' as const,
          score: 8,
          summary: 'Both an email address and a phone number are present.',
          evidence: [emails[0] ?? '', phones[0]?.trim() ?? ''].filter(Boolean),
        }
      : hasEmail || hasPhone
        ? {
            state: 'warn' as const,
            score: 4,
            summary: `Found ${hasEmail ? 'an email address' : 'a phone number'} but not ${hasEmail ? 'a phone number' : 'an email address'}.`,
            fix: 'List both, on the same line, directly under your name. Recruiters switch between the two constantly.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: 'No email address or phone number was found.',
            fix: 'This is the one mistake that guarantees no reply. Put your email and phone in the first three lines of the document.',
          }),
  });

  /* ---- is the contact block where it should be ---- */
  if (hasEmail || hasPhone) {
    const inHeader = EMAIL_RE.test(facts.header) || PHONE_RE.test(facts.header);
    // Regex objects with /g keep state, so reset before reuse.
    EMAIL_RE.lastIndex = 0;
    PHONE_RE.lastIndex = 0;
    checks.push({
      id: 'contact.position',
      category: 'contact',
      label: 'Details near the top',
      weight: 3,
      ...(inHeader
        ? {
            state: 'pass' as const,
            score: 3,
            summary: 'Contact details sit in the first few lines.',
          }
        : {
            state: 'warn' as const,
            score: 1,
            summary: 'Contact details appear further down the page.',
            fix: 'Move them directly under your name. Some parsers only scan the top block for contact information.',
          }),
    });
  }

  /* ---- professional email address ---- */
  if (hasEmail) {
    const primary = emails[0] ?? '';
    const local = primary.split('@')[0]?.toLowerCase() ?? '';
    const nickname = UNPROFESSIONAL_EMAIL.filter((word) => local.includes(word));
    const digitRun = /\d{4,}/.exec(local);
    const looksSchool = nickname.length > 0 || (digitRun && digitRun[0].length >= 5);

    checks.push({
      id: 'contact.email-tone',
      category: 'contact',
      label: 'Professional address',
      weight: 3,
      ...(looksSchool
        ? {
            state: 'warn' as const,
            score: 1,
            summary: `"${excerpt(primary, 44)}" reads like a personal account.`,
            fix: 'Use firstname.lastname@gmail.com, or your university address. It is a free credibility win.',
          }
        : {
            state: 'pass' as const,
            score: 3,
            summary: 'The address looks name-based.',
            evidence: [primary],
          }),
    });
  }

  /* ---- links to your work ---- */
  const found = LINK_KINDS.filter((kind) => {
    const matches = searchable.match(kind.patterns);
    if (!matches) return false;
    if (kind.key === 'portfolio' && LINK_NOISE.test(matches[0])) return false;
    return true;
  });
  const foundLabels = found.map((k) => k.label);
  const hasLinkedIn = found.some((k) => k.key === 'linkedin');
  const hasCode = found.some((k) => k.key === 'code' || k.key === 'portfolio');

  checks.push({
    id: 'contact.links',
    category: 'contact',
    label: 'Links to your work',
    weight: 7,
    ...(hasLinkedIn && hasCode
      ? {
          state: 'pass' as const,
          score: 7,
          summary: `Links to ${listPhrase(foundLabels)}.`,
          evidence: foundLabels,
        }
      : found.length > 0
        ? {
            state: 'warn' as const,
            score: 4,
            summary: `Only ${listPhrase(foundLabels)} linked.`,
            fix: hasLinkedIn
              ? 'Add a GitHub profile or a live project link. With no work history, something a recruiter can open is your strongest evidence.'
              : 'Add your LinkedIn profile. It is the first thing most recruiters check after the resume.',
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary: 'No LinkedIn, GitHub or portfolio link found.',
            fix: 'Add both LinkedIn and GitHub as full URLs on their own line. For a first job these matter more than any objective statement.',
          }),
  });

  /* ---- clickable, complete URLs ---- */
  const bareDomains = (facts.text.match(/(?:^|\s)(?:www\.)?(?:linkedin\.com|github\.com)\/\S+/gi) ?? []).length;
  const fullUrls = (facts.text.match(/https?:\/\/\S+/gi) ?? []).length;
  if (found.length > 0) {
    checks.push({
      id: 'contact.url-form',
      category: 'contact',
      label: 'Full URLs',
      weight: 2,
      ...(fullUrls > 0 || doc.hyperlinks.length > 0
        ? {
            state: 'pass' as const,
            score: 2,
            summary: 'Links are complete and clickable.',
          }
        : {
            state: 'warn' as const,
            score: 1,
            summary: bareDomains > 0 ? 'Links are written without https://.' : 'Links are not clickable.',
            fix: 'Write the whole address, https:// included, so it stays clickable after the file is converted.',
          }),
    });
  }

  /* ---- location ---- */
  const hasLocation =
    /\b(?:bengaluru|bangalore|mumbai|delhi|new delhi|noida|gurugram|gurgaon|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|indore|chandigarh|kochi|coimbatore|lucknow|bhopal|nagpur|remote)\b/i.test(
      facts.header,
    ) || /\b[A-Z][a-z]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+)\b/.test(facts.header);

  checks.push({
    id: 'contact.location',
    category: 'contact',
    label: 'City',
    weight: 2,
    ...(hasLocation
      ? { state: 'pass' as const, score: 2, summary: 'A location is listed in the header.' }
      : {
          state: 'warn' as const,
          score: 0,
          summary: 'No city found near your name.',
          fix: 'Add your city, or "Open to relocate". Recruiters filter on location constantly, and a blank is read as a no.',
        }),
  });

  return checks;
};
