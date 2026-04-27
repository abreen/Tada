export function stripHtmlComments(str: string): string {
  return str.replace(/<!---[\s\S]*?-->/g, '');
}
