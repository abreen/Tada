// An example of custom JavaScript in a Tada site.
//
// The Lectures page loads this file with
// <script src="/timezone.js" defer></script>, so it runs after the HTML is parsed.
// Tada runs scripts in page content each time the page is shown, including
// after a visitor clicks an internal link, so the code is wrapped in a function
// to keep its variables from clashing with the previous run.
//
// It lets visitors choose a time zone, then rewrites each
// <time datetime="HH:MM"> element on the page to show that time in their zone.
// Times are written in DEFAULT_TIME_ZONE, so they're still correct when
// JavaScript is turned off.
(() => {
  const DEFAULT_TIME_ZONE = 'America/New_York';
  const STORAGE_KEY = 'timeZone';

  const chooser = document.querySelector('.time-zone-chooser');
  const select = chooser?.querySelector('select');
  if (!select) {
    return;
  }

  // Minutes the zone is ahead of UTC today, accounting for daylight saving
  function offsetMinutes(timeZone) {
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
    const part = type => Number(parts.find(p => p.type === type).value);
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
  function zoneName(timeZone) {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName').value;
  }

  // Formats minutes after midnight like "5:40 PM"
  function formatTime(minutes) {
    return new Date(Date.UTC(2000, 0, 1, 0, minutes)).toLocaleTimeString(
      'en-US',
      { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' },
    );
  }

  function updateTimes(timeZone) {
    const shift = offsetMinutes(timeZone) - offsetMinutes(DEFAULT_TIME_ZONE);

    for (const time of document.querySelectorAll('time[datetime]')) {
      // Remember the authored text so it can be restored
      time.dataset.original ??= time.textContent;

      const [hours, minutes] = time.getAttribute('datetime').split(':');
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

  // Restore the visitor's choice. Storage can be unavailable, such as in
  // some private browsing modes, so fall back to the default.
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Use the default
  }
  const isOption = [...select.options].some(option => option.value === saved);
  select.value = isOption ? saved : DEFAULT_TIME_ZONE;

  select.addEventListener('change', () => {
    try {
      if (select.value === DEFAULT_TIME_ZONE) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, select.value);
      }
    } catch {
      // The choice still applies until the visitor leaves the page
    }
    updateTimes(select.value);
  });

  // The chooser is hidden in the HTML so visitors without JavaScript don't
  // see a control that does nothing
  select.disabled = false;
  chooser.hidden = false;
  updateTimes(select.value);
})();
