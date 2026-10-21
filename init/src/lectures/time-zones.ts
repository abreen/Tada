// The time zones visitors can choose from. Both timezone.render.ts, which
// writes the chooser at build time, and timezone.ts, which runs it in the
// browser, import this list.

/** The time zone the page's times are written in */
export const DEFAULT_TIME_ZONE = 'America/New_York';

export const TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (UK)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'UTC', label: 'UTC' },
];
