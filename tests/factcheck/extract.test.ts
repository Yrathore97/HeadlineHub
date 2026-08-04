import { describe, it, expect } from 'vitest';
import { extractReadableText } from '../../src/lib/factcheck/extract';

describe('extractReadableText', () => {
  it('strips tags and returns prose', () => {
    const html = `<html><body><h1>Repo rate held</h1><p>The RBI kept rates at 6.5 percent.</p></body></html>`;
    const out = extractReadableText(html);
    expect(out).toContain('Repo rate held');
    expect(out).toContain('The RBI kept rates at 6.5 percent.');
    expect(out).not.toContain('<p>');
  });

  it('drops script and style contents', () => {
    const html = `<body><script>var x = "danger";</script><style>.a{color:red}</style><p>Real text.</p></body>`;
    const out = extractReadableText(html);
    expect(out).toBe('Real text.');
  });

  it('decodes common entities', () => {
    expect(extractReadableText('<p>Tata &amp; Sons said &quot;yes&quot;</p>')).toBe('Tata & Sons said "yes"');
  });

  it('truncates very long documents', () => {
    const html = `<p>${'word '.repeat(5000)}</p>`;
    expect(extractReadableText(html).length).toBeLessThanOrEqual(4000);
  });
});
