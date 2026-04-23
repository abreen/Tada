interface TimeZone {
  value: string;
  label: string;
  abbreviation: string;
  offsetMinutes?: number;
}

declare var __SITE_BASE_PATH__: string;
declare var __SITE_TITLE_POSTFIX__: string;
declare var __SITE_DEFAULT_TIMEZONE__: string;
declare var __SITE_TIMEZONES__: TimeZone[];
