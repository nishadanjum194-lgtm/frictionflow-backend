const assert = require('node:assert/strict');
const { normalizeDomain, matchesDomain, normalizeRule } = require('../extension/domain-utils');

const valid = [
  ['reddit.com', 'reddit.com'],
  ['WWW.Reddit.com', 'reddit.com'],
  ['https://www.reddit.com/', 'reddit.com'],
  ['youtube.com', 'youtube.com']
];
for (const [input, expected] of valid) assert.equal(normalizeDomain(input), expected);

for (const invalid of ['', 'not a domain', 'https://reddit.com/path', 'reddit.com:8080', 'https://user:pass@reddit.com', 'https://reddit.com/?x=1']) {
  assert.throws(() => normalizeDomain(invalid), undefined, 'reject ' + invalid);
}

assert.equal(matchesDomain('reddit.com', 'reddit.com'), true);
assert.equal(matchesDomain('www.reddit.com', 'reddit.com'), true);
assert.equal(matchesDomain('old.reddit.com', 'reddit.com'), true);
assert.equal(matchesDomain('reddit.com.evil.test', 'reddit.com'), false);
assert.equal(matchesDomain('notreddit.com', 'reddit.com'), false);
assert.equal(matchesDomain('youtube.com', 'you'), false);

assert.deepEqual(normalizeRule({ domain: 'https://www.youtube.com/', waitTime: 700, mathRequired: true }), {
  domain: 'youtube.com', waitTime: 600, mathRequired: true
});
assert.equal(normalizeRule({ domain: 'https://reddit.com/path', waitTime: 30 }), null);
assert.equal(normalizeRule(null), null);

console.log('EXTENSION TESTS PASSED (19 assertions)');
