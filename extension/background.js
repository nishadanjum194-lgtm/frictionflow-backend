const DEFAULT_RULES = [
  { domain: 'youtube.com', waitTime: 60, mathRequired: true },
  { domain: 'instagram.com', waitTime: 60, mathRequired: true },
  { domain: 'twitter.com', waitTime: 30, mathRequired: false },
];

const PASS_STORAGE_KEY = 'focusPassExpiry';
const RULES_STORAGE_KEY = 'frictionRules';
const BYPASS_STORAGE_KEY = 'bypassedSites';

chrome.runtime.onInstalled.addListener(() => {
  // One-time migration from the older local-storage variant to sync storage.
  chrome.storage.local.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY], (localData) => {
    chrome.storage.sync.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY], (syncData) => {
      const updates = {};
      if (!Array.isArray(syncData && syncData[RULES_STORAGE_KEY]) && Array.isArray(localData && localData[RULES_STORAGE_KEY])) {
        updates[RULES_STORAGE_KEY] = localData[RULES_STORAGE_KEY];
      }
      if ((!syncData || typeof syncData[BYPASS_STORAGE_KEY] !== 'object') && localData && typeof localData[BYPASS_STORAGE_KEY] === 'object') {
        updates[BYPASS_STORAGE_KEY] = localData[BYPASS_STORAGE_KEY];
      }
      if (!syncData || typeof syncData[PASS_STORAGE_KEY] !== 'object') updates[PASS_STORAGE_KEY] = {};
      if (Object.keys(updates).length) chrome.storage.sync.set(updates);
      // continue seeding defaults...
      chrome.storage.sync.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY], (data) => {
        if (!data || typeof data !== 'object') return;
        const next = {};
        if (!Array.isArray(data[RULES_STORAGE_KEY])) next[RULES_STORAGE_KEY] = DEFAULT_RULES;
        if (!data[BYPASS_STORAGE_KEY] || typeof data[BYPASS_STORAGE_KEY] !== 'object') next[BYPASS_STORAGE_KEY] = {};
        if (!data[PASS_STORAGE_KEY] || typeof data[PASS_STORAGE_KEY] !== 'object') next[PASS_STORAGE_KEY] = {};
        if (Object.keys(next).length) chrome.storage.sync.set(next);
      });
    });
  });
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!details || details.frameId !== 0 || !details.url) return;

  let url;
  try { url = new URL(details.url); } catch (e) { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

  chrome.storage.sync.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY], (data) => {
    if (chrome.runtime.lastError) return;
    const safeData = data || {};
    const rules = Array.isArray(safeData[RULES_STORAGE_KEY]) ? safeData[RULES_STORAGE_KEY] : DEFAULT_RULES;
    const bypassed = safeData[BYPASS_STORAGE_KEY] || {};
    const passes = safeData[PASS_STORAGE_KEY] || {};
    const matchedRule = rules.find(rule => hostname.includes(String(rule.domain || '').toLowerCase()));

    if (!matchedRule) return;

    const now = Date.now();
    const domain = matchedRule.domain;
    const passExpiry = Number(passes[domain]) || 0;
    if (passExpiry > now) return; // Active focus pass: allow silently

    const lastBypassed = Number(bypassed[domain]) || 0;
    if (lastBypassed && now - lastBypassed <= 10 * 60 * 1000) return;

    const blockerUrl = chrome.runtime.getURL(
      `blocker.html?target=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(domain)}&wait=${encodeURIComponent(matchedRule.waitTime || 10)}&math=${encodeURIComponent(Boolean(matchedRule.mathRequired))}`
    );
    chrome.tabs.update(details.tabId, { url: blockerUrl });
  });
});