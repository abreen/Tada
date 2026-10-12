import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { findCodeLines } from './utils/block-code-lines';

// [Label|
const OPEN_PATTERN = /^\[(.*)\|[ \t]*$/;
// ]
const CLOSE_PATTERN = /^\][ \t]*$/;
// 1. Label
const STEP_PATTERN = /^(\d+)\.[ \t]/;

interface Tab {
  label: string;
  openLine: number;
  closeLine: number;
}

interface GroupMeta {
  tabs: Token[];
  panels: Token[];
}

function lineText(state: StateBlock, line: number): string | null {
  if (state.sCount[line] - state.blkIndent >= 4) {
    return null;
  }
  return state.src.slice(
    state.bMarks[line] + state.tShift[line],
    state.eMarks[line],
  );
}

/**
 * Whether brackets outside code spans and escapes are balanced, like a link's
 * text. Lines that only look like an opening line, such as a table row that
 * starts with a link (`[a](b) | c |`), are not.
 */
function hasBalancedBrackets(label: string): boolean {
  let depth = 0;
  for (let i = 0; i < label.length; i++) {
    const char = label[i];
    if (char === '\\') {
      i++;
    } else if (char === '`') {
      const run = /^`+/.exec(label.slice(i))![0];
      const close = label.indexOf(run, i + run.length);
      // An unclosed backtick run is literal text
      if (close !== -1) {
        i = close + run.length - 1;
      } else {
        i += run.length - 1;
      }
    } else if (char === '[') {
      depth++;
    } else if (char === ']' && --depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

function openLabel(state: StateBlock, line: number): string | null {
  const match = lineText(state, line)?.match(OPEN_PATTERN);
  if (!match) {
    return null;
  }
  const label = match[1].trim();
  // A leading ^ is left alone, like footnote references elsewhere
  if (label === '' || label.startsWith('^') || !hasBalancedBrackets(label)) {
    return null;
  }
  return label;
}

/** Whether the tabs are numbered steps: 1., 2., 3., ... (not 01., 02., ...) */
function isStepper(tabs: Tab[]): boolean {
  return (
    tabs.length >= 2 &&
    tabs.every(
      (tab, index) => STEP_PATTERN.exec(tab.label)?.[1] === String(index + 1),
    )
  );
}

function isClose(state: StateBlock, line: number): boolean {
  const text = lineText(state, line);
  return text != null && CLOSE_PATTERN.test(text);
}

// One pass per block context matches every opening line to its closing line,
// so the silent check before a group and later opening lines reuse it. Without
// it, each opening line without a closing line would scan to the end again.
const matchCache = new WeakMap<StateBlock, Map<string, Map<number, number>>>();

/**
 * Maps each opening line from startLine to endLine to its closing line, or -1
 * when unclosed. A closing line closes the nearest unclosed tab before it.
 * Delimiter-like lines inside code are skipped.
 */
function matchLines(
  state: StateBlock,
  startLine: number,
  endLine: number,
): Map<number, number> {
  let contexts = matchCache.get(state);
  if (!contexts) {
    contexts = new Map();
    matchCache.set(state, contexts);
  }
  // Lists and blockquotes reparse their lines with other indentation
  const key = `${endLine}:${state.blkIndent}:${state.parentType}`;
  const cached = contexts.get(key);
  if (cached?.has(startLine)) {
    return cached;
  }

  // Code fences and their contents stay literal
  const codeLines = findCodeLines(state, startLine + 1, endLine);
  const closes = new Map<number, number>([[startLine, -1]]);
  const open = [startLine];
  for (let line = startLine + 1; line < endLine; line++) {
    // Like a code fence, a tab ends with its list item or other container
    if (!state.isEmpty(line) && state.sCount[line] < state.blkIndent) {
      break;
    }
    if (codeLines.has(line)) {
      continue;
    }
    if (openLabel(state, line) != null) {
      closes.set(line, -1);
      open.push(line);
    } else if (open.length > 0 && isClose(state, line)) {
      closes.set(open.pop()!, line);
    }
  }
  contexts.set(key, closes);
  return closes;
}

export interface TabsPluginOptions {
  /**
   * Prefix of group IDs. Markdown rendered separately onto the same page, like
   * the site banner, needs its own prefix to keep IDs unique.
   */
  idPrefix?: string;
}

/**
 * Back and Next buttons in the panel box's bottom corners. Without JS every
 * step is shown, so they are hidden, and they stay disabled until the client
 * component mounts. Back starts hidden, since the first step is selected. The
 * arrows are decoration; the words name the buttons. The status announces the
 * step they reach to screen readers.
 */
const STEP_NAV_HTML = `<div class="tabs-step-nav" data-pagefind-ignore="">
<button type="button" class="tabs-step tabs-step-back" disabled="" hidden=""><span aria-hidden="true">←</span> Back</button>
<button type="button" class="tabs-step tabs-step-next" disabled="">Next <span aria-hidden="true">→</span></button>
<span class="tabs-step-status visually-hidden" role="status"></span>
</div>
`;

function tabsRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const firstLabel = openLabel(state, startLine);
  if (firstLabel == null) {
    return false;
  }
  const closes = matchLines(state, startLine, endLine);

  // Consecutive tabs, separated only by blank lines, form one group
  const tabs: Tab[] = [];
  let line = startLine;
  let label: string | null = firstLabel;
  while (label != null) {
    const closeLine = closes.get(line) ?? -1;
    if (closeLine === -1) {
      break;
    }
    tabs.push({ label, openLine: line, closeLine });

    line = closeLine + 1;
    while (line < endLine && state.isEmpty(line)) {
      line++;
    }
    label = closes.has(line) ? openLabel(state, line) : null;
  }

  if (tabs.length === 0) {
    return false;
  }
  if (silent) {
    return true;
  }

  const lastLine = tabs[tabs.length - 1].closeLine;
  const stepper = isStepper(tabs);
  // IDs are assigned once heading IDs are known (see assignIds)
  const meta: GroupMeta = { tabs: [], panels: [] };

  const pushInline = (content: string, map: [number, number]) => {
    const inline = state.push('inline', '', 0);
    inline.content = content;
    inline.map = map;
    inline.children = [];
    return inline;
  };

  const open = state.push('tabs_open', 'div', 1);
  open.block = true;
  open.map = [startLine, lastLine + 1];
  open.attrs = [
    ['class', stepper ? 'tabs tabs-stepper' : 'tabs'],
    ['id', ''],
  ];
  open.meta = meta;

  // The track holds the tab list between buttons that scroll it, which the
  // client component shows when the tabs do not fit. Keyboard and screen
  // reader users move through the tabs with the arrow keys instead.
  const trackOpen = state.push('tabs_track_open', 'div', 1);
  trackOpen.block = true;
  trackOpen.attrs = [['class', 'tabs-track']];
  const pushScrollButton = (side: string) => {
    const button = state.push('tabs_scroll_open', 'button', 1);
    button.block = true;
    button.attrs = [
      ['type', 'button'],
      ['class', `tabs-scroll tabs-scroll-${side}`],
      ['tabindex', '-1'],
      ['aria-hidden', 'true'],
      ['hidden', ''],
    ];
    state.push('tabs_scroll_close', 'button', -1).block = true;
  };
  pushScrollButton('start');

  // Build-time tab buttons stay disabled until the client component mounts
  const listOpen = state.push('tabs_list_open', 'div', 1);
  listOpen.block = true;
  listOpen.attrs = [['class', 'tabs-list']];
  const buttonLabels = tabs.map((tab, index) => {
    const tabOpen = state.push('tabs_tab_open', 'button', 1);
    // Block tokens would put line breaks around the label
    tabOpen.block = false;
    tabOpen.map = [tab.openLine, tab.openLine + 1];
    tabOpen.attrs = [
      ['type', 'button'],
      ['class', 'tabs-tab'],
      ['id', ''],
    ];
    if (index === 0) {
      tabOpen.attrs.push(['data-selected', '']);
    }
    tabOpen.attrs.push(['disabled', '']);
    meta.tabs.push(tabOpen);
    // Wrapped so its text can be centered by its capitals (see the styles)
    const labelOpen = state.push('tabs_tab_label_open', 'span', 1);
    labelOpen.block = false;
    labelOpen.attrs = [['class', 'tabs-tab-label']];
    // Filled from the panel's label once it is parsed (see copyButtonLabels)
    const buttonLabel = pushInline('', [tab.openLine, tab.openLine + 1]);
    state.push('tabs_tab_label_close', 'span', -1).block = false;
    state.push('tabs_tab_close', 'button', -1).block = true;
    return buttonLabel;
  });
  state.push('tabs_list_close', 'div', -1).block = true;
  pushScrollButton('end');
  state.push('tabs_track_close', 'div', -1).block = true;

  const panelsOpen = state.push('tabs_panels_open', 'div', 1);
  panelsOpen.block = true;
  panelsOpen.attrs = [['class', 'tabs-panels']];

  const oldLineMax = state.lineMax;
  tabs.forEach((tab, index) => {
    const panelOpen = state.push('tabs_panel_open', 'div', 1);
    panelOpen.block = true;
    panelOpen.map = [tab.openLine, tab.closeLine + 1];
    panelOpen.attrs = [
      ['class', 'tabs-panel'],
      ['id', ''],
    ];
    if (index === 0) {
      panelOpen.attrs.push(['data-selected', '']);
    }
    meta.panels.push(panelOpen);

    // Labels each panel when the tab list is not shown (no JS, print). Search
    // already indexes the label as the tab button's text.
    const labelOpen = state.push('tabs_panel_label_open', 'p', 1);
    labelOpen.block = true;
    labelOpen.attrs = [
      ['class', 'tabs-panel-label'],
      ['data-pagefind-ignore', ''],
    ];
    buttonLabels[index].meta = {
      tabsLabel: pushInline(tab.label, [tab.openLine, tab.openLine + 1]),
    };
    state.push('tabs_panel_label_close', 'p', -1).block = true;

    state.lineMax = tab.closeLine;
    state.md.block.tokenize(state, tab.openLine + 1, tab.closeLine);

    state.push('tabs_panel_close', 'div', -1).block = true;
  });
  state.lineMax = oldLineMax;

  if (stepper) {
    state.push('tabs_step_nav', '', 0).block = true;
  }

  state.push('tabs_panels_close', 'div', -1).block = true;
  state.push('tabs_close', 'div', -1).block = true;

  state.line = lastLine + 1;
  return true;
}

/**
 * Numbers groups in document order, skipping numbers whose IDs are already
 * used, such as by a heading titled "Tabs 1".
 */
function assignIds(state: StateCore, idPrefix: string): void {
  const used = new Set<string>();
  const collect = (tokens: Token[]) => {
    for (const token of tokens) {
      const id = token.attrGet('id');
      if (id) {
        used.add(id);
      }
      if (token.children) {
        collect(token.children);
      }
    }
  };
  collect(state.tokens);

  let count = 0;
  for (const token of state.tokens) {
    if (token.type !== 'tabs_open') {
      continue;
    }
    const { tabs, panels } = token.meta as GroupMeta;
    const idsOf = (groupId: string) => [
      groupId,
      ...tabs.map((_, index) => `${groupId}-tab-${index + 1}`),
      ...panels.map((_, index) => `${groupId}-panel-${index + 1}`),
    ];
    let ids: string[];
    do {
      count++;
      ids = idsOf(`${idPrefix}-${count}`);
    } while (ids.some(id => used.has(id)));

    token.attrSet('id', ids[0]);
    tabs.forEach((tab, index) => tab.attrSet('id', ids[1 + index]));
    panels.forEach((panel, index) =>
      panel.attrSet('id', ids[1 + tabs.length + index]),
    );
  }
}

// A <button> cannot contain links, so a tab shows its label without them. The
// panel's label keeps them, along with any footnote reference, which is parsed
// only there so its number and back-reference stay unique.
const BUTTON_LABEL_OMITTED = new Set(['footnote_ref']);

function copyButtonLabels(state: StateCore): void {
  const copy = (token: Token): Token =>
    Object.assign(
      new state.Token(token.type, token.tag, token.nesting),
      token,
      {
        attrs: token.attrs?.map(([name, value]) => [name, value]) ?? null,
        children: token.children?.map(copy) ?? null,
      },
    );
  for (const token of state.tokens) {
    const label = (token.meta as { tabsLabel?: Token } | null)?.tabsLabel;
    if (label) {
      token.children = (label.children ?? [])
        .filter(
          child => child.tag !== 'a' && !BUTTON_LABEL_OMITTED.has(child.type),
        )
        .map(copy);
    }
  }
}

/**
 * Use after plugins that add heading IDs or links, so group IDs avoid theirs
 * and tab buttons omit the links.
 */
export default function tabsPlugin(
  md: MarkdownIt,
  { idPrefix = 'tabs' }: TabsPluginOptions = {},
): void {
  md.block.ruler.before('fence', 'tabs', tabsRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.tabs_step_nav = () => STEP_NAV_HTML;
  md.core.ruler.push('tabs', state => {
    assignIds(state, idPrefix);
    copyButtonLabels(state);
  });
}
