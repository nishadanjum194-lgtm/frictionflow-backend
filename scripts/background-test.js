const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const domainUtils = require('../extension/domain-utils');

const listeners = {};
const removedTabs = [];
const updates = [];
const storageData = {
  frictionRules: [{ domain: 'reddit.com', waitTime: 30, mathRequired: false }],
  bypassedSites: {},
  focusPassExpiry: {}
};
function makeArea() {
  return {
    get(keys, callback) {
      const result = {};
      for (const key of keys) if (key in storageData) result[key] = storageData[key];
      callback(result);
    },
    set(values, callback) {
      Object.assign(storageData, values);
      callback();
    }
  };
}
const chrome = {
  runtime: {
    lastError: null,
    onInstalled: { addListener(fn) { listeners.installed = fn; } },
    onStartup: { addListener(fn) { listeners.startup = fn; } },
    onMessage: { addListener(fn) { listeners.message = fn; } },
    getURL(path) { return 'chrome-extension://test/' + path; }
  },
  storage: { local: makeArea(), sync: makeArea() },
  webNavigation: { onBeforeNavigate: { addListener(fn) { listeners.navigate = fn; } } },
  tabs: {
    update(id, options, callback) { updates.push({ id, options }); callback(); },
    remove(id) { removedTabs.push(id); }
  }
};
const source = fs.readFileSync(require.resolve('../extension/background.js'), 'utf8');
vm.runInNewContext(source, {
  chrome, URL, Promise, Date, Number, String, Object, Array, Boolean, encodeURIComponent,
  console, FrictionFlowDomain: domainUtils, importScripts() {}
});

async function navigate(url, frameId = 0, tabId = 7) {
  await listeners.navigate({ frameId, tabId, url });
}

(async () => {
  await navigate('https://reddit.com/r/test');
  assert.equal(updates.length, 1, 'base domain is blocked');
  assert.equal(updates[0].id, 7);
  assert.match(updates[0].options.url, /^chrome-extension:\/\/test\/blocker\.html/);

  await navigate('https://old.reddit.com/');
  assert.equal(updates.length, 2, 'subdomain is blocked');

  await navigate('https://reddit.com.evil.test/');
  assert.equal(updates.length, 2, 'lookalike domain is not blocked');

  await navigate('https://notreddit.com/');
  assert.equal(updates.length, 2, 'suffix without dot boundary is not blocked');

  await navigate('https://reddit.com/frame', 3);
  assert.equal(updates.length, 2, 'subframes are ignored');

  storageData.focusPassExpiry = { 'reddit.com': Date.now() + 60000 };
  await navigate('https://reddit.com/allowed');
  assert.equal(updates.length, 2, 'active focus pass is respected');

  listeners.message({ type: 'CLOSE_BLOCKER_TAB' }, { tab: { id: 44 } });
  assert.deepEqual(removedTabs, [44], 'abandon action closes the blocker tab');

  console.log('BACKGROUND TESTS PASSED (7 scenarios)');
})().catch(error => { console.error(error); process.exitCode = 1; });
