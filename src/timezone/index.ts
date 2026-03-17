const STORAGE_KEY = 'timezoneSelection';

type PeriodStyle = [am: string, pm: string];

const DEFAULT_PERIOD_STYLE: PeriodStyle = ['a.m.', 'p.m.'];

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

function parseHHMM(hhmm: string) {
  const [h, m] = hhmm.split(':');
  if (h == null || m == null) {
    return NaN;
  }
  return Number(h) * 60 + Number(m);
}

// Compute UTC offset (in minutes) for a time zone at given date (DST-aware)
function getOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') {
        acc[p.type] = p.value;
      }
      return acc;
    }, {});
  const utcTs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // Difference (local - UTC) in minutes
  return (utcTs - date.getTime()) / 60000;
}

// window.siteVariables.timezones is replaced by DefinePlugin at build time.
// The typeof guard prevents a ReferenceError in test environments where
// window is not defined.
const TIMEZONES: TimezoneDef[] =
  typeof window !== 'undefined' ? window.siteVariables.timezones : [];

function getDefaultTimezone() {
  const value = window.siteVariables.defaultTimeZone;
  return TIMEZONES.find(tz => tz.value === value)!;
}

function computeOffsets(baseDate: Date) {
  TIMEZONES.forEach(tz => {
    tz.offsetMinutes = getOffsetMinutes(tz.value, baseDate);
  });
}

function init(element: HTMLDataListElement, selectedTz: string) {
  const beforeText = window.document.createTextNode('Times shown in ');
  element.parentElement?.insertBefore(beforeText, element);

  TIMEZONES.forEach(tz => {
    const opt = document.createElement('option');
    opt.value = tz.value;
    if (tz.value === 'UTC') {
      opt.textContent = tz.label;
    } else {
      opt.textContent = `${tz.label} (${tz.abbreviation})`;
    }
    if (tz.value === selectedTz) {
      opt.selected = true;
    }
    element.appendChild(opt);
  });

  element.removeAttribute('hidden');
}

function dominantPeriodStyle(
  styles: Map<HTMLTimeElement, PeriodStyle | null>,
): PeriodStyle {
  const counts = new Map<PeriodStyle, number>();
  for (const style of styles.values()) {
    if (style !== null) {
      counts.set(style, (counts.get(style) ?? 0) + 1);
    }
  }
  let best: PeriodStyle = DEFAULT_PERIOD_STYLE;
  let bestCount = 0;
  for (const [style, count] of counts) {
    if (count > bestCount) {
      best = style;
      bestCount = count;
    }
  }
  return best;
}

export default (window: Window) => {
  const defaultTz = getDefaultTimezone();
  const resetTitle = `Reset time zone to ${defaultTz.abbreviation} (default)`;

  // determine initial time zone (from storage or default)
  let initialTz = defaultTz.value;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && TIMEZONES.some(t => t.value === stored)) {
      initialTz = stored;
    }
  } catch {
    // ignored
  }

  const now = new Date();
  computeOffsets(now);
  const defaultOffset = defaultTz.offsetMinutes ?? 0;

  // Snapshot the original AM/PM style from each <time> element's text
  const periodStyles = new Map<HTMLTimeElement, PeriodStyle | null>();
  Array.from(window.document.querySelectorAll('time[datetime]'))
    .filter((el): el is HTMLTimeElement => el instanceof HTMLTimeElement)
    .forEach(el => {
      periodStyles.set(el, detectPeriodStyle(el.textContent ?? ''));
    });
  const pagePeriodStyle = dominantPeriodStyle(periodStyles);

  function updateTimes(targetTz: string) {
    const target = TIMEZONES.find(t => t.value === targetTz) || defaultTz;
    const targetOffset = target.offsetMinutes ?? 0;
    const deltaMinutes = targetOffset - defaultOffset;

    Array.from(window.document.querySelectorAll('time[datetime]'))
      .filter(el => el instanceof HTMLTimeElement)
      .forEach(el => {
        const datetime = el.getAttribute('datetime');
        if (!datetime) {
          return;
        }

        const isDefault = target.value === defaultTz.value;

        const baseMinutes = parseHHMM(datetime);
        if (isNaN(baseMinutes)) {
          return;
        }

        // raw (can be < 0 or > 1439)
        const rawMinutes = baseMinutes + deltaMinutes;
        const dayShift =
          Math.floor(rawMinutes / 1440) - (rawMinutes < 0 ? 1 : 0);
        // Normalize after computing dayShift
        const [h, m] = normalizeHM(rawMinutes);

        let suffix = '';
        if (!isDefault) {
          if (dayShift === 1) {
            suffix = ' <span class="next-prev-day">(next day)</span>';
          } else if (dayShift === -1) {
            suffix = ' <span class="next-prev-day">(prev. day)</span>';
          }
        }

        const originalStyle = periodStyles.get(el) ?? null;
        const originalIsPm = Math.floor(baseMinutes / 60) >= 12;
        const periodChanged = originalIsPm !== h >= 12 || dayShift !== 0;
        const style =
          originalStyle === null && periodChanged
            ? pagePeriodStyle
            : originalStyle;
        el.innerHTML = to12Hour(h, m, style) + suffix;

        if (isDefault) {
          el.classList.remove('is-modified');
          el.title = '';
        } else {
          el.classList.add('is-modified');
          el.title = `${to12Hour(...normalizeHM(baseMinutes), style ?? pagePeriodStyle)} ${defaultTz.abbreviation}`;
        }
      });
  }

  window.document
    .querySelectorAll('select.time-zone')
    .forEach(el => init(el as HTMLSelectElement, initialTz));

  const choosers: Array<{ sync: (val: string) => void }> = [];

  const syncAll = (val: string) => {
    choosers.forEach(({ sync }) => sync(val));
  };

  window.document.querySelectorAll('select.time-zone').forEach(sel => {
    const selectEl = sel as HTMLSelectElement;

    const resetBtn = window.document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    resetBtn.className = 'icon-button';

    resetBtn.setAttribute('aria-label', resetTitle);
    resetBtn.title = resetTitle;

    const wrapper = window.document.createElement('div');
    wrapper.className = 'timezone-wrapper';
    selectEl.insertAdjacentElement('beforebegin', wrapper);
    wrapper.appendChild(selectEl);
    wrapper.appendChild(resetBtn);

    const sync = (val: string) => {
      selectEl.value = val;
      const isDefault = val === defaultTz.value;
      resetBtn.style.opacity = isDefault ? '0' : '1';
      resetBtn.style.pointerEvents = isDefault ? 'none' : '';
    };

    choosers.push({ sync });

    selectEl.addEventListener('change', () => {
      const val = selectEl.value;
      try {
        if (val === defaultTz.value) {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          window.localStorage.setItem(STORAGE_KEY, val);
        }
      } catch {
        // ignore storage errors
      }
      syncAll(val);
      updateTimes(val);
    });

    resetBtn.addEventListener('click', () => {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      syncAll(defaultTz.value);
      updateTimes(defaultTz.value);
    });
  });

  // Initial render uses stored or default time zone
  syncAll(initialTz);
  updateTimes(initialTz);
  return () => {};
};
