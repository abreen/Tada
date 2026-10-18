// An example of a script for a Tada site.
//
// The Lectures page lists this file in its front matter:
//
//   scripts: [lectures/timezone.ts]
//
// Tada compiles it with the rest of the site and calls its default export
// each time the page is shown, including after a visitor follows a link from
// another page. Code at the top level of this module runs only once per visit.
//
// It lets visitors choose a time zone, then rewrites each
// <time datetime="HH:MM"> element on the page to show that time in their zone.
// Times are written in DEFAULT_TIME_ZONE, so they're still correct when
// JavaScript is turned off. The chooser itself is written into the page at
// build time by timezone.render.ts.
import './timezone.scss';
import type { Mount } from '@abreen/tada';
import { DEFAULT_TIME_ZONE } from './time-zones';

const STORAGE_KEY = 'timeZone';

// Minutes the zone is ahead of UTC today, accounting for daylight saving
function offsetMinutes(timeZone: string): number {
  const now = new Date();
  now.setSeconds(0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(p => p.type === type)?.value);
  const wallClock = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return (wallClock - now.getTime()) / 60000;
}

// A short name for the zone, such as "EDT" or "GMT+9"
function zoneName(timeZone: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? timeZone
  );
}

// Formats minutes after midnight like "5:40 PM"
function formatTime(minutes: number): string {
  return new Date(Date.UTC(2000, 0, 1, 0, minutes)).toLocaleTimeString(
    'en-US',
    { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' },
  );
}

function updateTimes(document: Document, timeZone: string): void {
  const shift = offsetMinutes(timeZone) - offsetMinutes(DEFAULT_TIME_ZONE);

  for (const time of document.querySelectorAll<HTMLTimeElement>(
    'time[datetime]',
  )) {
    // Remember the authored text so it can be restored
    time.dataset.original ??= time.textContent ?? '';

    const [hours, minutes] = time.dateTime.split(':');
    const total = Number(hours) * 60 + Number(minutes) + shift;
    if (Number.isNaN(total)) {
      continue;
    }

    if (timeZone === DEFAULT_TIME_ZONE) {
      time.textContent = time.dataset.original;
      time.removeAttribute('title');
      continue;
    }

    // Converting can move a time into the previous or next day
    const dayShift = Math.floor(total / 1440);
    let note = '';
    if (dayShift > 0) {
      note = ' (next day)';
    } else if (dayShift < 0) {
      note = ' (prev. day)';
    }

    time.textContent = `${formatTime(total)} ${zoneName(timeZone)}${note}`;
    time.title = `${time.dataset.original} ${zoneName(DEFAULT_TIME_ZONE)}`;
  }
}

const mount: Mount = ({ window, signal }) => {
  const { document, localStorage } = window;
  const select = document.querySelector<HTMLSelectElement>('tz-chooser select');
  if (!select) {
    return;
  }

  // Restore the visitor's choice. Storage can be unavailable, such as in
  // some private browsing modes, so fall back to the default.
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Use the default
  }
  const isOption = [...select.options].some(option => option.value === saved);
  select.value = isOption && saved ? saved : DEFAULT_TIME_ZONE;

  // Passing the signal removes the listener when the visitor leaves the page
  select.addEventListener(
    'change',
    () => {
      try {
        if (select.value === DEFAULT_TIME_ZONE) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, select.value);
        }
      } catch {
        // The choice still applies until the visitor leaves the page
      }
      updateTimes(document, select.value);
    },
    { signal },
  );

  // The chooser is disabled in the HTML so visitors without JavaScript can't
  // change a control that does nothing
  select.disabled = false;
  updateTimes(document, select.value);
};

export default mount;
