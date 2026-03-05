module.exports = function createGlobals(site, page, subPath) {
  return {
    isHomePage: subPath === 'index',
    isoDate,
    readableDate,
    classNames,
    cx: classNames,
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
