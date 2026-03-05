module.exports = function textToId(value) {
  const text = value == null ? '' : String(value);
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
};
