/**
 * Job-description matching.
 *
 * Deliberately kept out of the score. Keyword overlap measures how closely you
 * mirrored one posting's vocabulary, which is a tailoring task, not a quality
 * signal. Presenting it as a grade would push people toward keyword stuffing.
 */

import { ALL_SKILLS, KEYWORD_BIGRAM_ALLOWLIST, STOPWORDS } from './dictionaries';
import { findTerms, tokenise } from './text';
import type { JobMatch, KeywordMatch } from './types';

const MAX_TERMS = 28;
const SKILL_SET = new Set(ALL_SKILLS);

/** Shortest posting worth mining. Below this the keyword list is noise. */
export const MIN_POSTING_CHARS = 120;

function isUsefulToken(token: string): boolean {
  if (token.length < 3) return false;
  if (STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  // Drop ordinals and bare units.
  if (/^\d/.test(token) && !SKILL_SET.has(token)) return false;
  return true;
}

export function matchJobDescription(resumeText: string, postingText: string): JobMatch {
  const resumeLower = resumeText.toLowerCase();
  const postingLower = postingText.toLowerCase();
  const tokens = tokenise(postingText);

  const counts = new Map<string, number>();
  const bump = (term: string, by = 1): void => {
    counts.set(term, (counts.get(term) ?? 0) + by);
  };

  for (const token of tokens) {
    if (isUsefulToken(token)) bump(token);
  }

  // Phrases carry more meaning than their parts. Keep the ones on the allowlist
  // plus any repeated two-word pair made of two meaningful tokens.
  const bigramCounts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (!first || !second) continue;
    if (STOPWORDS.has(first) || STOPWORDS.has(second)) continue;
    if (first.length < 3 || second.length < 3) continue;
    const phrase = `${first} ${second}`;
    bigramCounts.set(phrase, (bigramCounts.get(phrase) ?? 0) + 1);
  }
  for (const [phrase, count] of bigramCounts) {
    if (KEYWORD_BIGRAM_ALLOWLIST.has(phrase) || count >= 2) {
      bump(phrase, count);
      // Avoid showing "machine" and "learning" alongside "machine learning".
      for (const part of phrase.split(' ')) {
        if (!SKILL_SET.has(part)) counts.delete(part);
      }
    }
  }

  // Multi-word technologies are the terms a recruiter searches on, so make sure
  // they survive tokenisation even when they appear only once.
  for (const skill of ALL_SKILLS) {
    if (skill.includes(' ') && postingLower.includes(skill)) {
      bump(skill, counts.get(skill) ? 0 : 1);
    }
  }

  const ranked = [...counts.entries()]
    .map<KeywordMatch>(([term, count]) => ({
      term,
      count,
      isSkill: SKILL_SET.has(term),
      matched: findTerms(resumeLower, [term]).length > 0,
    }))
    // Recognised technologies first, then by how often the posting repeats it.
    .sort((a, b) => {
      if (a.isSkill !== b.isSkill) return a.isSkill ? -1 : 1;
      return b.count - a.count || a.term.localeCompare(b.term);
    })
    .slice(0, MAX_TERMS);

  const matched = ranked.filter((term) => term.matched);
  const skills = ranked.filter((term) => term.isSkill);
  const matchedSkills = skills.filter((term) => term.matched);

  return {
    coverage: ranked.length > 0 ? Math.round((matched.length / ranked.length) * 100) : 0,
    skillCoverage:
      skills.length > 0 ? Math.round((matchedSkills.length / skills.length) * 100) : 0,
    terms: ranked,
    matched,
    missing: ranked.filter((term) => !term.matched),
  };
}
