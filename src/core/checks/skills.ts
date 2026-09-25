/** Are the skills concrete, searchable, and backed up by the projects? */

import { SKILL_GROUPS, SOFT_SKILL_FLUFF } from '../dictionaries';
import { findPhrases, findTerms, listPhrase, pluralise } from '../text';
import type { CheckFn, CheckResult } from '../types';

const GROUP_LABELS: Record<string, string> = {
  languages: 'languages',
  frontend: 'frontend',
  backend: 'backend',
  data: 'data',
  infra: 'cloud and tooling',
  tools: 'workflow tools',
};

export const skillsChecks: CheckFn = (facts) => {
  const checks: CheckResult[] = [];

  const byGroup = new Map<string, string[]>();
  for (const [group, terms] of Object.entries(SKILL_GROUPS)) {
    const found = findTerms(facts.lower, terms);
    if (found.length) byGroup.set(group, found);
  }
  const allFound = [...new Set([...byGroup.values()].flat())];

  /* ---- named technologies ---- */
  checks.push({
    id: 'skills.named',
    category: 'skills',
    label: 'Named technologies',
    weight: 8,
    ...(allFound.length >= 8
      ? {
          state: 'pass' as const,
          score: 8,
          summary: `${pluralise(allFound.length, 'recognised technology', 'recognised technologies')}.`,
          evidence: allFound.slice(0, 8),
        }
      : allFound.length >= 4
        ? {
            state: 'warn' as const,
            score: 5,
            summary: `${pluralise(allFound.length, 'recognised technology', 'recognised technologies')}: ${listPhrase(allFound, 4)}.`,
            fix: 'List everything you have genuinely used, including the database, the version control tool and the deployment target. These are the exact words recruiters search on.',
            evidence: allFound,
          }
        : {
            state: 'fail' as const,
            score: 0,
            summary:
              allFound.length === 0
                ? 'No recognisable technologies found.'
                : `Only ${listPhrase(allFound)}.`,
            fix: 'A skills section needs specific, searchable names: Python, React, PostgreSQL, Git, Docker, AWS. Without them a keyword search never surfaces you.',
          }),
  });

  /* ---- breadth across the stack ---- */
  if (allFound.length >= 3) {
    const groups = [...byGroup.keys()];
    checks.push({
      id: 'skills.breadth',
      category: 'skills',
      label: 'Breadth of stack',
      weight: 3,
      ...(groups.length >= 3
        ? {
            state: 'pass' as const,
            score: 3,
            summary: `Covers ${listPhrase(groups.map((g) => GROUP_LABELS[g] ?? g))}.`,
          }
        : {
            state: 'warn' as const,
            score: 1,
            summary: `Skills cluster in ${listPhrase(groups.map((g) => GROUP_LABELS[g] ?? g))} only.`,
            fix: 'Round it out with the parts you must already have touched: a database, Git, and wherever you deployed the project.',
          }),
    });
  }

  /* ---- fluff crowding out the real thing ---- */
  const fluff = findPhrases(facts.lower, SOFT_SKILL_FLUFF);
  if (fluff.length > 0 || allFound.length > 0) {
    const ratio = allFound.length > 0 ? fluff.length / allFound.length : fluff.length;
    checks.push({
      id: 'skills.fluff',
      category: 'skills',
      label: 'No padded skills',
      weight: 3,
      ...(fluff.length === 0
        ? { state: 'pass' as const, score: 3, summary: 'Every listed skill is a real, checkable tool.' }
        : ratio <= 0.35
          ? {
              state: 'warn' as const,
              score: 2,
              summary: `Includes ${listPhrase(fluff)}.`,
              fix: 'Nobody screens for MS Office or punctuality. Delete them and give the space to a project.',
              evidence: fluff,
            }
          : {
              state: 'fail' as const,
              score: 0,
              summary: `${pluralise(fluff.length, 'padded entry', 'padded entries')} against ${allFound.length} real ones.`,
              fix: 'Your skills section is mostly personality claims. Cut all of them. Keep languages, frameworks, databases and tools you could be questioned on.',
              evidence: fluff.slice(0, 6),
            }),
    });
  }

  /* ---- skills backed up by projects ---- */
  if (allFound.length >= 3) {
    const skillsSection = facts.sections.find((s) => s.key === 'skills');
    const evidenceText = facts.sections
      .filter((s) => s.key === 'projects' || s.key === 'experience')
      .flatMap((s) => s.body)
      .join('\n')
      .toLowerCase();

    if (skillsSection && evidenceText.length > 80) {
      const listed = findTerms(skillsSection.body.join('\n').toLowerCase(), allFound);
      const demonstrated = listed.filter((skill) => findTerms(evidenceText, [skill]).length > 0);
      const unbacked = listed.filter((skill) => !demonstrated.includes(skill));
      const coverage = listed.length > 0 ? demonstrated.length / listed.length : 1;

      checks.push({
        id: 'skills.evidence',
        category: 'skills',
        label: 'Skills shown in projects',
        weight: 4,
        // Listing more than you demonstrate is normal and fine. This only fires
        // when the skills section and the projects describe different people.
        ...(coverage >= 0.4
          ? {
              state: 'pass' as const,
              score: 4,
              summary: `${demonstrated.length} of ${listed.length} listed skills appear in your project descriptions.`,
            }
          : coverage >= 0.2
            ? {
                state: 'warn' as const,
                score: 2,
                summary: `Only ${demonstrated.length} of ${listed.length} listed skills show up in a project.`,
                fix: `Name the tool inside the bullet where you used it. Currently unbacked: ${listPhrase(unbacked, 4)}.`,
                evidence: unbacked.slice(0, 6),
              }
            : {
                state: 'fail' as const,
                score: 0,
                summary: 'Your skills list and your projects describe different people.',
                fix: 'A list of technologies with no project using them reads as a list of things you have heard of. Work each one into the bullet where you actually used it.',
                evidence: unbacked.slice(0, 6),
              }),
      });
    }
  }

  return checks;
};
