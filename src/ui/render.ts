/**
 * Report rendering.
 *
 * Every function here writes into the skeleton already present in resume-score.html.
 * All text goes through `h`, which assigns textContent, so resume content is
 * never interpreted as markup.
 */

import { h, replaceChildren, setText } from '@lib/dom';
import { icon, stateIcon } from '@lib/icons';
import type { CategoryId, CategoryScore, CheckResult, JobMatch, Report } from '@core/types';

/** Matches the r=52 circle in resume-score.html. */
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;

/** How long the score spends counting up to its new value. */
const COUNT_UP_MS = 520;

export interface ReportRefs {
  scoreboard: HTMLElement;
  gauge: SVGCircleElement;
  score: HTMLElement;
  scoreDelta: HTMLElement;
  band: HTMLElement;
  bandMessage: HTMLElement;
  stats: HTMLElement;
  categories: HTMLElement;
  actions: HTMLElement;
  checks: HTMLElement;
  checkCount: HTMLElement;
  checkFilter: HTMLElement;
  reportMeta: HTMLElement;
  matchPanel: HTMLElement;
  matchBody: HTMLElement;
}

/** Which checks the "Every check" list is currently showing. */
export type CheckFilter = 'all' | 'todo' | 'pass';

export interface ChecksView {
  filter: CheckFilter;
  /**
   * Categories the user has explicitly expanded or collapsed. Categories absent
   * from the map fall back to the default: open when something needs attention.
   */
  open: ReadonlyMap<CategoryId, boolean>;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

/** Invalidates an in-flight count-up when a newer score arrives mid-animation. */
let countUpToken = 0;

/**
 * Animates the big number so a re-score reads as a change rather than a silent
 * swap.
 *
 * The final value is written first and the animation only rewinds from there, so
 * a browser that never runs the frames - a hidden tab, an offscreen iframe,
 * reduced motion - still shows the right number.
 */
function countUp(node: HTMLElement, from: number, to: number): void {
  const token = (countUpToken += 1);
  setText(node, to);

  if (from === to || prefersReducedMotion() || document.visibilityState === 'hidden') return;

  const started = performance.now();
  const step = (now: number): void => {
    if (token !== countUpToken) return;
    // Clamped at both ends: a frame timestamp that predates `started` would
    // otherwise ease past the start and render a negative score.
    const progress = Math.max(0, Math.min(1, (now - started) / COUNT_UP_MS));
    // easeOutCubic: fast first, settles gently on the final number.
    const eased = 1 - (1 - progress) ** 3;
    setText(node, Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * @param previousScore The score on screen before this render, or null on the
 *                      first report. Drives the count-up and the +/- chip.
 */
export function renderScoreboard(
  refs: ReportRefs,
  report: Report,
  previousScore: number | null,
): void {
  refs.scoreboard.dataset['band'] = report.band.id;
  countUp(refs.score, previousScore ?? 0, report.score);
  setText(refs.band, report.band.label);
  setText(refs.bandMessage, report.band.message);

  renderScoreDelta(refs.scoreDelta, previousScore, report.score);

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

/** The "+3" chip beside the gauge. Hidden entirely on a first report. */
function renderScoreDelta(node: HTMLElement, previous: number | null, current: number): void {
  if (previous === null || previous === current) {
    node.hidden = true;
    replaceChildren(node);
    delete node.dataset['direction'];
    return;
  }

  const diff = current - previous;
  const up = diff > 0;
  node.hidden = false;
  node.dataset['direction'] = up ? 'up' : 'down';
  replaceChildren(
    node,
    // A real minus sign, so it is not mistaken for a hyphen at small sizes.
    h('span', { 'aria-hidden': 'true', text: `${up ? '+' : '\u2212'}${Math.abs(diff)}` }),
    h('span', {
      class: 'visually-hidden',
      text: `${Math.abs(diff)} points ${up ? 'better' : 'worse'} than your last check`,
    }),
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
          // Ties the summary back to the full entry, which carries the evidence.
          h('button', {
            class: 'link-btn action__jump',
            type: 'button',
            'data-jump': check.id,
            text: 'Show this in the checklist',
          }),
        ),
      ),
    ),
  );
}

const STATE_WORDS: Record<CheckResult['state'], string> = {
  pass: 'passing',
  warn: 'worth a look',
  fail: 'needs fixing',
  info: 'not applicable',
};

function renderCheck(check: CheckResult): HTMLElement {
  return h(
    'li',
    { class: 'check', 'data-state': check.state, 'data-check-id': check.id, tabindex: '-1' },
    icon(stateIcon(check.state), 'check__mark'),
    h(
      'div',
      {},
      h(
        'p',
        { class: 'check__label' },
        check.label,
        // The icon is decorative, so the state needs saying somewhere.
        h('span', { class: 'visually-hidden', text: ` - ${STATE_WORDS[check.state]}` }),
      ),
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

/** True when a check belongs in the list under the current filter. */
function passesFilter(check: CheckResult, filter: CheckFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pass') return check.state === 'pass';
  return check.state === 'fail' || check.state === 'warn';
}

/** Failures and warnings are what the user came for, so those groups start open. */
function defaultOpen(category: CategoryScore): boolean {
  return category.checks.some((check) => check.state === 'fail' || check.state === 'warn');
}

export function renderChecks(refs: ReportRefs, report: Report, view: ChecksView): void {
  const scored = report.checks.filter((check) => check.weight > 0);
  const passed = scored.filter((check) => check.state === 'pass').length;
  setText(refs.checkCount, `${passed} of ${scored.length} passing`);

  const groups = report.categories
    .map((category) => ({
      category,
      visible: category.checks.filter((check) => passesFilter(check, view.filter)),
    }))
    .filter((group) => group.visible.length > 0);

  if (groups.length === 0) {
    replaceChildren(
      refs.checks,
      h('p', {
        class: 'checks-none',
        text:
          view.filter === 'todo'
            ? 'Nothing needs fixing. Every check passed.'
            : 'No checks passed yet. Work through the list above.',
      }),
    );
    return;
  }

  replaceChildren(
    refs.checks,
    ...groups.map(({ category, visible }) => {
      const toFix = category.checks.filter(
        (check) => check.state === 'fail' || check.state === 'warn',
      ).length;

      return h(
        'details',
        {
          class: 'check-group',
          'data-category': category.id,
          // An explicit user choice wins; otherwise open the groups with problems.
          // Filtered views always open, or the filter would appear to do nothing.
          open: view.filter !== 'all' || (view.open.get(category.id) ?? defaultOpen(category)),
        },
        h(
          'summary',
          { class: 'check-group__head' },
          h(
            'div',
            {},
            h('h3', { class: 'check-group__name', text: category.name }),
            h('p', { class: 'check-group__blurb', text: category.blurb }),
          ),
          h(
            'span',
            { class: 'check-group__meta' },
            toFix > 0
              ? h('span', {
                  class: 'check-group__flag',
                  'data-tone': toneFor(category.pct),
                  text: `${toFix} to fix`,
                })
              : null,
            h('span', {
              class: 'check-group__score',
              text: `${category.score}/${category.weight}`,
            }),
          ),
        ),
        h('ul', { class: 'checks' }, ...visible.map(renderCheck)),
      );
    }),
  );
}

const FILTER_LABELS: ReadonlyArray<{ id: CheckFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: 'Needs work' },
  { id: 'pass', label: 'Passing' },
];

/**
 * The All / Needs work / Passing segmented control above the checklist.
 *
 * The buttons are built once and then updated in place. Replacing them on every
 * re-score would throw away keyboard focus, and the control is redrawn as often
 * as the user types.
 */
export function renderCheckFilter(refs: ReportRefs, report: Report, active: CheckFilter): void {
  const counts: Record<CheckFilter, number> = {
    all: report.checks.length,
    todo: report.checks.filter((check) => passesFilter(check, 'todo')).length,
    pass: report.checks.filter((check) => passesFilter(check, 'pass')).length,
  };

  if (refs.checkFilter.childElementCount === 0) {
    replaceChildren(
      refs.checkFilter,
      ...FILTER_LABELS.map(({ id, label }) =>
        h(
          'button',
          { class: 'chip', type: 'button', 'data-filter': id },
          label,
          h('span', { class: 'chip__count' }),
        ),
      ),
    );
  }

  for (const { id } of FILTER_LABELS) {
    const chip = refs.checkFilter.querySelector<HTMLButtonElement>(`[data-filter="${id}"]`);
    if (!chip) continue;
    chip.setAttribute('aria-pressed', String(id === active));
    const count = chip.querySelector('.chip__count');
    if (count) setText(count, String(counts[id]));
  }
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
    // Somewhere to put the gaps while rewriting, without retyping them.
    match.missing.length > 0
      ? h('button', {
          class: 'btn btn--secondary btn--sm',
          type: 'button',
          'data-copy-missing': '',
          style: 'margin-top: var(--space-4)',
          text: `Copy the ${match.missing.length} missing terms`,
        })
      : null,
  );
}
