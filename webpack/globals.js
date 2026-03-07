const timezones = require('../src/timezone/timezones.json');

module.exports = function createGlobals(site, page, subPath) {
  const siteVars = page; // second arg receives siteVariables per render.js call convention
  const defaultTz = timezones.find(t => t.value === siteVars.defaultTimeZone);
  const timezoneChooser = defaultTz
    ? `<select class="time-zone" hidden></select><noscript>Times shown in ${defaultTz.abbreviation}.</noscript>`
    : '<select class="time-zone" hidden></select>';

  return {
    isHomePage: subPath === 'index',
    isoDate,
    readableDate,
    classNames,
    cx: classNames,
    timezoneChooser,
  };
};

function isoDate(str) {
  if (str == null || str == '') {
    return null;
  }
  const date = new Date(str);
  return date.toISOString().slice(0, 10);
}

function readableDate(date) {
  if (date == null || date == '') {
    return '';
  }

  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  const str = date.toISOString();
  const year = str.slice(0, 4);
  let month = str.slice(5, 7);
  if (month[0] === '0') {
    month = month[1];
  }
  let day = str.slice(8, 10);
  if (day[0] === '0') {
    day = day[1];
  }

  const months = {
    1: 'January',
    2: 'February',
    3: 'March',
    4: 'April',
    5: 'May',
    6: 'June',
    7: 'July',
    8: 'August',
    9: 'September',
    10: 'October',
    11: 'November',
    12: 'December',
  };

  return `${months[month]} ${day}, ${year}`;
}

function classNames(obj) {
  const names = [];
  for (const key in obj) {
    if (!!obj[key]) {
      names.push(key);
    }
  }
  return names.join(' ');
}
