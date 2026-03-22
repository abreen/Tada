interface TimezoneDef {
  value: string;
  label: string;
  abbreviation: string;
  offsetMinutes?: number;
}

declare const __SITE_BASE__: string;
declare const __SITE_BASE_PATH__: string;
declare const __SITE_TITLE_POSTFIX__: string;
declare const __SITE_DEFAULT_TIMEZONE__: string;
declare const __SITE_TIMEZONES__: TimezoneDef[];
