export type PeriodStyle = [am: string, pm: string];

export const DEFAULT_PERIOD_STYLE: PeriodStyle = ['a.m.', 'p.m.'];

const PERIOD_PATTERNS: { pattern: RegExp; style: PeriodStyle }[] = [
  { pattern: /[AP]\.M\./, style: ['A.M.', 'P.M.'] },
  { pattern: /[AP]M/, style: ['AM', 'PM'] },
  { pattern: /[ap]\.m\./, style: ['a.m.', 'p.m.'] },
  { pattern: /[ap]m/, style: ['am', 'pm'] },
];

export function detectPeriodStyle(text: string): PeriodStyle | null {
  for (const { pattern, style } of PERIOD_PATTERNS) {
    if (pattern.test(text)) {
      return style;
    }
  }
  return null;
}

function pad(n: number | string) {
  return String(n).padStart(2, '0');
}

export function to12Hour(
  h: number,
  m: number,
  style: PeriodStyle | null = DEFAULT_PERIOD_STYLE,
) {
  const hour12 = ((h + 11) % 12) + 1;
  if (!style) {
    return `${hour12}:${pad(m)}`;
  }
  const period = h >= 12 ? style[1] : style[0];
  return `${hour12}:${pad(m)} ${period}`;
}

export function normalizeHM(totalMinutes: number) {
  const mins = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h, m] as const;
}
