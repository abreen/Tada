interface TimezoneDef {
  value: string;
  label: string;
  abbreviation: string;
  offsetMinutes?: number;
}

interface Window {
  siteVariables: {
    base: string;
    basePath: string;
    titlePostfix?: string;
    defaultTimeZone: string;
    timezones: TimezoneDef[];
  };
}
