import type { CategoryId, CheckFn } from '../types';
import { contactChecks } from './contact';
import { hygieneChecks } from './hygiene';
import { impactChecks } from './impact';
import { parseabilityChecks } from './parseability';
import { skillsChecks } from './skills';
import { structureChecks } from './structure';

export const CATEGORIES: ReadonlyArray<{ id: CategoryId; name: string; blurb: string }> = [
  {
    id: 'parse',
    name: 'Machine readable',
    blurb: 'Whether screening software can extract your resume at all.',
  },
  {
    id: 'contact',
    name: 'Contact and links',
    blurb: 'Whether a recruiter can reach you and see your work.',
  },
  {
    id: 'structure',
    name: 'Structure',
    blurb: 'Whether the expected sections exist and are labelled plainly.',
  },
  {
    id: 'impact',
    name: 'Writing',
    blurb: 'Whether the words show what you did and what came of it.',
  },
  {
    id: 'skills',
    name: 'Skills',
    blurb: 'Whether your skills are specific, searchable and demonstrated.',
  },
  {
    id: 'hygiene',
    name: 'Presentation',
    blurb: 'Length, naming, spelling and dated conventions.',
  },
];

export const CHECK_MODULES: readonly CheckFn[] = [
  parseabilityChecks,
  contactChecks,
  structureChecks,
  impactChecks,
  skillsChecks,
  hygieneChecks,
];
