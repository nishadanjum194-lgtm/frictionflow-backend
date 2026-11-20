const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDomain } = require('../lib/domain');

test('accepts valid hostnames', () => {
  for (const value of ['youtube.com', 'www.example.co.uk', 'sub.domain.example', 'my-site.dev']) {
    assert.equal(isValidDomain(value), true, value);
  }
});

test('rejects lookalikes and malformed hostnames', () => {
  for (const value of ['', 'localhost', '.example.com', 'example.com.', 'example..com', '-bad.com', 'bad-.com', 'https://example.com', 'example.com/path', 'not a domain', 'a'.repeat(64) + '.com']) {
    assert.equal(isValidDomain(value), false, String(value));
  }
});
