function parseHsl(hslColor) {
  const [, hue, saturation, lightness] = hslColor.match(
    /^hsl\((\d+)(?:deg)?\s+(\d+)%\s+(\d+)%\)$/,
  );
  return { hue, saturation, lightness };
}

module.exports = { parseHsl };
