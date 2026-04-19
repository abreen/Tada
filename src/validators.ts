export interface ResponseValidators {
  etag: string | null;
  lastModified: string | null;
}

export const EMPTY_RESPONSE_VALIDATORS: ResponseValidators = Object.freeze({
  etag: null,
  lastModified: null,
});

export function getResponseValidators(source: {
  headers: { get(name: string): string | null };
}): ResponseValidators {
  return {
    etag: source.headers.get('ETag'),
    lastModified: source.headers.get('Last-Modified'),
  };
}

export function hasUsableResponseValidators(
  validators: ResponseValidators,
): boolean {
  return validators.etag !== null || validators.lastModified !== null;
}

export function hasResponseValidatorsChanged(
  previous: ResponseValidators,
  current: ResponseValidators,
): boolean {
  if (previous.etag !== null && current.etag !== null) {
    return current.etag !== previous.etag;
  }

  if (previous.lastModified !== null && current.lastModified !== null) {
    return current.lastModified !== previous.lastModified;
  }

  return false;
}

export function getPreferredValidatorKey(
  validators: ResponseValidators,
): string | null {
  return validators.etag ?? validators.lastModified;
}
