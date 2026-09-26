import { describe, expect, it } from 'vitest';
import { evidenceUrlsFromText, normalizeEvidenceUrls } from './evidence';

describe('evidence URL normalization', () => {
  it('canonicalizes and sorts stable public HTTPS sources', () => {
    expect(normalizeEvidenceUrls([
      'https://SOURCIFY.dev/server/v2/contract/1/0xabc',
      'https://example.com',
    ])).toEqual([
      'https://example.com/',
      'https://sourcify.dev/server/v2/contract/1/0xabc',
    ]);
  });

  it.each([
    'http://example.com/report',
    'https://localhost/report',
    'https://127.0.0.1/report',
    'https://example.com/report?latest=true',
    'https://user@example.com/report',
    'https://example.com/a//b',
  ])('rejects evidence the contract would reject: %s', (url) => {
    expect(() => normalizeEvidenceUrls([url])).toThrow();
  });

  it('rejects duplicates after canonicalization', () => {
    expect(() => evidenceUrlsFromText('https://EXAMPLE.com\nhttps://example.com/')).toThrow(/unique/);
  });
});
