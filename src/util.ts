export function debounce(fn: Function, time: number) {
  let timer: number;
  return (...args: any[]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn.apply(null, args);
    }, time);
  };
}

export function removeClass(el: HTMLElement, className: string) {
  el.classList.remove(className);
  if (!el.className) {
    el.removeAttribute('class');
  }
}

export function getElement(
  parent: Document | Element,
  selector: string,
): HTMLElement {
  const el = parent.querySelector(selector);
  if (!el) {
    throw new Error(`no element matching "${selector}"`);
  }
  return el as HTMLElement;
}

export function applyBasePath(subPath: string): string {
  if (!subPath.startsWith('/')) {
    throw new Error('invalid internal path, must start with "/": ' + subPath);
  }

  let path = window.siteVariables.basePath || '/';
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path + subPath;
}

export function scheduleTask(fn: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn);
  } else {
    return setTimeout(fn, 0);
  }
}

export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const absMs = Math.abs(ms);

  const roundTo = (val: number, decimals: number) => {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  };

  const formatSecondsFromMs = (msVal: number): string => {
    const sec = msVal / 1000;
    // Ensure fixed width 8 for seconds:
    // <10s => 1 + '.' + 5 + 's' = 8
    // >=10s => 2 + '.' + 4 + 's' = 8
    let decimals = sec < 10 ? 5 : 4;
    let rounded = roundTo(sec, decimals);

    // If rounding reaches 60, switch to minutes
    if (rounded >= 60) {
      return formatMinutesFromMs(msVal);
    }

    // If value was <10 but rounding crossed into >=10, drop one decimal to keep width 8
    if (decimals === 5 && rounded >= 10) {
      decimals = 4;
      rounded = roundTo(sec, decimals);
      if (rounded >= 60) {
        return formatMinutesFromMs(msVal);
      }
    }

    return `${rounded.toFixed(decimals)}s`;
  };

  const formatMinutesFromMs = (msVal: number): string => {
    const totalSec = msVal / 1000;
    let minutes = Math.floor(totalSec / 60);
    const rawSeconds = totalSec - minutes * 60;

    let decimals: number;
    if (minutes < 10) {
      decimals = rawSeconds < 10 ? 3 : 2;
    } else {
      decimals = rawSeconds < 10 ? 2 : 1;
    }

    let seconds = roundTo(rawSeconds, decimals);

    if (seconds >= 60) {
      minutes += 1;
      // after carry, seconds is 0 and decimals depend on new minutes value
      decimals = minutes < 10 ? 3 : 2;
      seconds = 0;
    }

    return `${minutes}m${seconds.toFixed(decimals)}s`;
  };

  if (absMs < 1000) {
    // 0.0000ms - 999.99ms
    let decimals = absMs < 10 ? 4 : absMs < 100 ? 3 : 2;
    let val = roundTo(absMs, decimals);
    if (val >= 1000) {
      return sign + formatSecondsFromMs(absMs);
    }
    return sign + `${val.toFixed(decimals)}ms`;
  } else if (absMs < 60000) {
    // 0.0000s - 59.9999s (variable decimals based on magnitude)
    return sign + formatSecondsFromMs(absMs);
  } else {
    // Minutes + seconds with precision based on minute/second magnitude
    return sign + formatMinutesFromMs(absMs);
  }
}
