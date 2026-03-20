export default function textToId(value: unknown): string {
  const text = value == null ? '' : String(value);
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}
