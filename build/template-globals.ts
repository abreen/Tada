import timezones from '../src/timezone/timezones.json' with { type: 'json' };
import type { SiteVariables } from './types';

const MONTHS = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface TemplateGlobals {
  isHomePage: boolean;
  isoDate: (str: string | null | undefined) => string | null;
  readableDate: (date: string | Date | null | undefined) => string;
  classNames: (obj: Record<string, unknown>) => string;
  cx: (obj: Record<string, unknown>) => string;
  renderTimeZoneChooser: () => string;
}

export default function createTemplateGlobals(
  pageVariables: Record<string, unknown>,
  siteVariables: SiteVariables,
  subPath: string,
): TemplateGlobals {
  const defaultTz = timezones.find(
    t => t.value === siteVariables.defaultTimeZone,
  )!;
  const options = timezones
    .map(tz => {
      const label =
        tz.value === 'UTC' ? tz.label : `${tz.label} (${tz.abbreviation})`;
      const selected = tz.value === defaultTz.value ? ' selected' : '';
      return `<option value="${tz.value}"${selected}>${label}</option>`;
    })
    .join('');
  const renderTimeZoneChooser = () =>
    `<span class="time-zone-label" hidden>Times shown in </span><select class="time-zone" hidden disabled aria-label="Time zone">${options}</select><noscript>Times shown in ${defaultTz.abbreviation}.</noscript>`;

  return {
    isHomePage: subPath === 'index',
    isoDate,
    readableDate,
    classNames,
    cx: classNames,
    renderTimeZoneChooser,
  };
}

function isoDate(str: string | null | undefined): string | null {
  if (str == null || str == '') {
    return null;
  }
  const date = new Date(str);
  return date.toISOString().slice(0, 10);
}

function readableDate(date: string | Date | null | undefined): string {
  if (date == null || date == '') {
    return '';
  }

  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  const str = date.toISOString();
  const year = str.slice(0, 4);
  const month = Number(str.slice(5, 7));
  const day = Number(str.slice(8, 10));

  return `${MONTHS[month]} ${day}, ${year}`;
}

export function classNames(obj: Record<string, unknown>): string {
  const names: string[] = [];
  for (const key in obj) {
    if (obj[key]) {
      names.push(key);
    }
  }
  return names.join(' ');
}
