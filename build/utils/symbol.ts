// One emoji: a flag, keycap, subdivision flag, or pictograph with optional
// skin tone and ZWJ joins. Written for the `u` flag so the site schema (Ajv)
// can share it; `\p{RGI_Emoji}` needs the `v` flag.
const EMOJI = String.raw`\p{RI}\p{RI}|[#*0-9]\uFE0F\u20E3|\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}|(?!\p{RI})(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)\p{Emoji_Modifier}?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F?)\p{Emoji_Modifier}?)*`;

/** Must match `faviconSymbol` in `schema/site.schema.json` */
export const TEXT_SYMBOL_PATTERN = '^[A-Z0-9\\- ]{1,5}$';

/** Must match `symbol` in `schema/site.schema.json` */
export const SYMBOL_PATTERN = `^(?:[A-Z0-9\\- ]{1,5}|${EMOJI})$`;

const SYMBOL_RE = new RegExp(SYMBOL_PATTERN, 'u');
const EMOJI_RE = new RegExp(`^(?:${EMOJI})$`, 'u');

export function isValidSymbol(value: string): boolean {
  return SYMBOL_RE.test(value);
}

export function isEmojiSymbol(value: string | null | undefined): boolean {
  return value != null && EMOJI_RE.test(value);
}
