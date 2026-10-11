import { encodePublicAssetPath } from './custom-fonts';
import { isEmojiSymbol } from './utils/symbol';
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
  encodeAuthoredUrl: (value: string) => string;
  encodePublicAssetPath: (value: string) => string;
  isEmojiSymbol: (value: string | null | undefined) => boolean;
}

export default function createTemplateGlobals(
  pageVariables: Record<string, unknown>,
  siteVariables: SiteVariables,
  subPath: string,
): TemplateGlobals {
  return {
    isHomePage: subPath === 'index',
    isoDate,
    readableDate,
    classNames,
    cx: classNames,
    encodeAuthoredUrl,
    encodePublicAssetPath,
    isEmojiSymbol,
  };
}

// Encode raw authored URL text, but preserve percent escapes authors already wrote.
export function encodeAuthoredUrl(value: string): string {
  return encodeURI(value).replace(/%25([0-9a-fA-F]{2})/g, '%$1');
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
