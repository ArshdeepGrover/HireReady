/**
 * Report rendering.
 *
 * Every function here writes into the skeleton already present in resume-score.html.
 * All text goes through `h`, which assigns textContent, so resume content is
 * never interpreted as markup.
 */

import { h, replaceChildren, setText } from '@lib/dom';
import { icon, stateIcon } from '@lib/icons';
import type { CategoryScore, CheckResult, JobMatch, Report } from '@core/types';

/** Matches the r=52 circle in resume-score.html. */
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

export interface ReportRefs {
  scoreboard: HTMLElement;
  gauge: SVGCircleElement;
  score: HTMLElement;
  band: HTMLElement;
  bandMessage: HTMLElement;
  stats: HTMLElement;
  categories: HTMLElement;
  actions: HTMLElement;
  checks: HTMLElement;
  checkCount: HTMLElement;
  reportMeta: HTMLElement;
  matchPanel: HTMLElement;
  matchBody: HTMLElement;
}

function toneFor(pct: number): 'good' | 'warn' | 'bad' {
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function statBadge(label: string, value: string | number): HTMLElement {
  return h('span', { class: 'badge' }, h('span', { class: 'mono', text: value }), ` ${label}`);
}

const SOURCE_LABELS: Record<Report['source'], string> = {
  pdf: 'PDF',
  docx: 'Word',
  text: 'pasted text',
};

export function renderScoreboard(refs: ReportRefs, report: Report): void {
  refs.scoreboard.dataset['band'] = report.band.id;
  setText(refs.score, report.score);
  setText(refs.band, report.band.label);
  setText(refs.bandMessage, report.band.message);

  refs.gauge.setAttribute('stroke-dasharray', String(GAUGE_CIRCUMFERENCE));
  refs.gauge.setAttribute(
    'stroke-dashoffset',
    String(GAUGE_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, report.score)) / 100)),
  );

  const { facts } = report;
  replaceChildren(
    refs.stats,
    statBadge('words', facts.wordCount),
    report.source === 'text' ? null : statBadge(facts.pageCount === 1 ? 'page' : 'pages', facts.pageCount),
    statBadge('bullets', facts.bulletCount),
    statBadge('sections', facts.sectionCount),
  );

  replaceChildren(refs.categories, ...report.categories.map(renderCategory));

  const when = new Date(report.generatedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  setText(
    refs.reportMeta,
    `${report.fileName ?? SOURCE_LABELS[report.source]} · ${when}`,
  );
}

function renderCategory(category: CategoryScore): HTMLElement {
  const tone = toneFor(category.pct);
  return h(
    'div',
    { class: 'category', 'data-tone': tone },
    h(
      'div',
      { class: 'category__head' },
      h('span', { class: 'category__name', text: category.name }),
      h('span', { class: 'category__pct', text: `${category.pct}%` }),
    ),
    h(
      'div',
      {
        class: 'category__bar',
        role: 'img',
        'aria-label': `${category.name}: ${category.score} of ${category.weight} points`,
      },
      h('span', { style: `width: ${category.pct}%` }),
    ),
  );
}

export function renderActions(refs: ReportRefs, report: Report): void {
  if (report.actions.length === 0) {
    replaceChildren(
      refs.actions,
      h(
        'li',
        { class: 'actions--clear' },
        h('strong', { text: 'Nothing major left' }),
        h('span', {
          text: 'Every check passed. Read it aloud once to catch anything awkward, then send it.',
        }),
      ),
    );
    return;
  }

  replaceChildren(
    refs.actions,
    ...report.actions.map((check) =>
      h(
        'li',
        { class: 'action', 'data-state': check.state },
        h(
          'div',
          {},
          h('h3', { class: 'action__label', text: check.label }),
          h('p', { class: 'action__summary', text: check.summary }),
          check.fix ? h('p', { class: 'action__fix', text: check.fix }) : null,
        ),
      ),
    ),
  );
}

function renderCheck(check: CheckResult): HTMLElement {
  return h(
    'li',
    { class: 'check', 'data-state': check.state },
    icon(stateIcon(check.state), 'check__mark'),
    h(
      'div',
      {},
      h('p', { class: 'check__label', text: check.label }),
      h('p', { class: 'check__summary', text: check.summary }),
      check.fix
        ? h('p', { class: 'check__fix' }, h('b', { text: 'Fix: ' }), check.fix)
        : null,
      check.evidence && check.evidence.length > 0
        ? h(
            'ul',
            { class: 'check__evidence' },
            ...check.evidence.map((item) => h('li', { text: item })),
          )
        : null,
    ),
  );
}

export function renderChecks(refs: ReportRefs, report: Report): void {
  const scored = report.checks.filter((check) => check.weight > 0);
  const passed = scored.filter((check) => check.state === 'pass').length;
  setText(refs.checkCount, `${passed} of ${scored.length} passing`);

  replaceChildren(
    refs.checks,
    ...report.categories.map((category) =>
      h(
        'section',
        { class: 'check-group' },
        h(
          'div',
          { class: 'check-group__head' },
          h(
            'div',
            {},
            h('h3', { class: 'check-group__name', text: category.name }),
            h('p', { class: 'check-group__blurb', text: category.blurb }),
          ),
          h('span', {
            class: 'check-group__score',
            text: `${category.score}/${category.weight}`,
          }),
        ),
        h('ul', { class: 'checks' }, ...category.checks.map(renderCheck)),
      ),
    ),
  );
}

export function renderMatch(refs: ReportRefs, match: JobMatch | null, note: string | null): void {
  if (!match) {
    if (note) {
      refs.matchPanel.hidden = false;
      replaceChildren(refs.matchBody, h('p', { class: 'field__hint', text: note }));
    } else {
      refs.matchPanel.hidden = true;
      replaceChildren(refs.matchBody);
    }
    return;
  }

  refs.matchPanel.hidden = false;

  const summary = h(
    'div',
    { class: 'match-summary' },
    h(
      'div',
      { class: 'match-stat' },
      h('b', { text: `${match.coverage}%` }),
      h('span', { text: 'of its key terms' }),
    ),
    h(
      'div',
      { class: 'match-stat' },
      h('b', { text: `${match.skillCoverage}%` }),
      h('span', { text: 'of its named tools' }),
    ),
    h(
      'div',
      { class: 'match-stat' },
      h('b', { text: String(match.missing.length) }),
      h('span', { text: 'terms not in your resume' }),
    ),
  );

  const chips = h(
    'ul',
    { class: 'keywords' },
    ...match.terms.map((term) =>
      h(
        'li',
        {
          class: 'keyword',
          'data-matched': String(term.matched),
          'data-skill': String(term.isSkill),
          title: term.matched ? 'Already in your resume' : 'In the posting, missing from your resume',
        },
        term.term,
        term.count > 1 ? h('span', { class: 'keyword__count', text: `×${term.count}` }) : null,
      ),
    ),
  );

  const legend = h(
    'p',
    { class: 'keyword-legend' },
    h('span', {}, h('i', { 'data-tone': 'good' }), ' already in your resume'),
    h('span', {}, h('i', { 'data-tone': 'bad' }), ' missing from your resume'),
  );

  replaceChildren(
    refs.matchBody,
    summary,
    h('p', {
      class: 'field__hint',
      style: 'margin-bottom: var(--space-4)',
      text: 'Add only the missing terms that are genuinely true of you. Padding a resume with words you cannot discuss in an interview fails later and harder.',
    }),
    chips,
    legend,
  );
}
