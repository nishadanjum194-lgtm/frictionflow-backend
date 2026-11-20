function isValidDomain(value) {
  if (typeof value !== 'string') return false;
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253 || domain.includes('..')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('://')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}
module.exports = { isValidDomain };
