const RESERVED_HOST_SUFFIXES = ['.internal', '.invalid', '.lan', '.local', '.localhost', '.test'];

function validHost(host: string) {
  if (!host || host.length > 253 || host.startsWith('.') || host.endsWith('.')) return false;
  if (/^\d+(?:\.\d+)*$/.test(host)) return false;
  if (RESERVED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) return false;
  return host.split('.').every((label) => (
    label.length > 0
    && label.length <= 63
    && !label.startsWith('-')
    && !label.endsWith('-')
    && /^[a-z0-9-]+$/.test(label)
  ));
}

export function normalizeEvidenceUrls(values: string[]) {
  if (values.length > 3) throw new Error('Use at most three evidence URLs per clearance.');
  const normalized: string[] = [];
  for (const value of values) {
    if (value !== value.trim() || value.length < 12 || value.length > 1_600 || /[?@#%\\\s]/.test(value)) {
      throw new Error('Evidence must use stable HTTPS links without credentials, queries, fragments, or escapes.');
    }
    if (!value.startsWith('https://')) throw new Error('Every evidence URL must use HTTPS.');
    const remainder = value.slice(8);
    const slash = remainder.indexOf('/');
    const authority = (slash === -1 ? remainder : remainder.slice(0, slash)).toLowerCase();
    const path = slash === -1 ? '/' : remainder.slice(slash);
    if (authority.includes(':') || !validHost(authority) || path.includes('//')) {
      throw new Error('Evidence URLs must use a public DNS hostname and a stable path.');
    }
    if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
      throw new Error('Evidence URL paths cannot contain dot segments.');
    }
    const canonical = `https://${authority}${path}`;
    if (normalized.includes(canonical)) throw new Error('Evidence URLs must be unique.');
    normalized.push(canonical);
  }
  return normalized.sort();
}

export function evidenceUrlsFromText(text: string) {
  return normalizeEvidenceUrls(text.split('\n').map((item) => item.trim()).filter(Boolean));
}
