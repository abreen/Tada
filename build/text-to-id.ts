export default function textToId(value: unknown): string {
  const text = value == null ? '' : String(value);
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

export function deduplicateId(used: Map<string, number>, id: string): string {
  const count = (used.get(id) ?? 0) + 1;
  used.set(id, count);
  return count === 1 ? id : `${id}-${count}`;
}
