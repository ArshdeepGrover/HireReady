/**
 * Small typed DOM helpers.
 *
 * Everything that renders resume content goes through `h`, which only ever
 * assigns `textContent`. Nothing user-supplied is passed to innerHTML anywhere
 * in this codebase.
 */

type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  class?: string;
  text?: string | number;
  html?: never;
  [key: string]: string | number | boolean | null | undefined | never;
}

/** Throws rather than returning null, so a markup typo fails loudly at boot. */
export function qs<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Expected an element matching "${selector}".`);
  return found;
}

export function qsa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

function appendChildren(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

/** Creates an element. `text` sets textContent; there is no innerHTML escape hatch. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

/** Replaces the children of a node in one go. */
export function replaceChildren(node: Element, ...children: Child[]): void {
  node.replaceChildren();
  appendChildren(node, children);
}

export function setText(node: Element, value: string | number): void {
  node.textContent = String(value);
}

/** Toggles `hidden`, which the base stylesheet enforces with !important. */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
}

/** Waits for the next frame, so a transition has a chance to run. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
