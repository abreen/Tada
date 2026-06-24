interface StructuredExpressionContext {
  site: object;
  vars: Record<string, unknown>;
}

const WHOLE_EXPRESSION_RE =
  /^\{\s*((?:site|vars)(?:\.[A-Za-z_$][\w$]*)+)\s*\}$/;
const INLINE_EXPRESSION_RE =
  /\{\s*((?:site|vars)(?:\.[A-Za-z_$][\w$]*)+)\s*\}/g;

function resolvePath(
  expression: string,
  context: StructuredExpressionContext,
  filePath: string,
): unknown {
  const [root, ...properties] = expression.split('.');
  let value: unknown = context[root as keyof StructuredExpressionContext];

  for (const property of properties) {
    if (
      value === null ||
      value === undefined ||
      typeof value !== 'object' ||
      !(property in value)
    ) {
      throw new Error(`${filePath}: unknown expression "${expression}"`);
    }
    value = (value as Record<string, unknown>)[property];
  }

  return value;
}

function resolveString(
  value: string,
  context: StructuredExpressionContext,
  filePath: string,
): unknown {
  const wholeExpression = value.match(WHOLE_EXPRESSION_RE);
  if (wholeExpression) {
    return resolvePath(wholeExpression[1], context, filePath);
  }

  return value.replace(INLINE_EXPRESSION_RE, (_match, expression: string) => {
    const resolved = resolvePath(expression, context, filePath);
    if (resolved !== null && typeof resolved === 'object') {
      throw new Error(
        `${filePath}: expression "${expression}" cannot be embedded in text`,
      );
    }
    return String(resolved ?? '');
  });
}

export function resolveStructuredExpressions(
  value: unknown,
  context: StructuredExpressionContext,
  filePath: string,
): unknown {
  if (typeof value === 'string') {
    return resolveString(value, context, filePath);
  }
  if (Array.isArray(value)) {
    return value.map(item =>
      resolveStructuredExpressions(item, context, filePath),
    );
  }
  if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveStructuredExpressions(item, context, filePath),
      ]),
    );
  }
  return value;
}
