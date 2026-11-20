const DEFAULT_RULES = [
  { domain: 'youtube.com', waitTime: 60, mathRequired: true },
  { domain: 'instagram.com', waitTime: 60, mathRequired: true },
  { domain: 'twitter.com', waitTime: 30, mathRequired: false },
];

const PASS_STORAGE_KEY = 'focusPassExpiry';
const RULES_STORAGE_KEY = 'frictionRules';
const BYPASS_STORAGE_KEY = 'bypassedSites';

function normalizeDomain(value) {
  const input = String(value || '').trim().toLowerCase().replace(/^www\./, '');
  if (!input || input.length > 253 || /[\/:@?#]/.test(input)) return '';
  try {
    const parsed = new URL('https://' + input);
    if (parsed.hostname !== input || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.hostname;
  } catch (_error) {
    return '';
  }
}

function matchesDomain(hostname, ruleDomain) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const domain = normalizeDomain(ruleDomain);
  return Boolean(domain && (host === domain || host.endsWith('.' + domain)));
}

chrome.runtime.onInstalled.addListener(() => {
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
      if (Object.keys(updates).length) chrome.storage.sync.set(updates, seedDefaults);
      else seedDefaults();
    });
  });
});

function seedDefaults() {
  chrome.storage.sync.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY], (data) => {
    if (chrome.runtime.lastError) return;
    const safe = data || {};
    const next = {};
    if (!Array.isArray(safe[RULES_STORAGE_KEY])) next[RULES_STORAGE_KEY] = DEFAULT_RULES;
    if (!safe[BYPASS_STORAGE_KEY] || typeof safe[BYPASS_STORAGE_KEY] !== 'object') next[BYPASS_STORAGE_KEY] = {};
    if (!safe[PASS_STORAGE_KEY] || typeof safe[PASS_STORAGE_KEY] !== 'object') next[PASS_STORAGE_KEY] = {};
    if (Object.keys(next).length) chrome.storage.sync.set(next);
  });
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!details || details.frameId !== 0 || !details.url) return;

  let url;
  try { url = new URL(details.url); } catch (_error) { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  const hostname = url.hostname.toLowerCase();
  chrome.storage.sync.get([RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY], (data) => {
    if (chrome.runtime.lastError) return;
    const safeData = data || {};
    const rules = Array.isArray(safeData[RULES_STORAGE_KEY]) ? safeData[RULES_STORAGE_KEY] : DEFAULT_RULES;
    const bypassed = safeData[BYPASS_STORAGE_KEY] || {};
    const passes = safeData[PASS_STORAGE_KEY] || {};
    const matchedRule = rules.find((rule) => matchesDomain(hostname, rule && rule.domain));
    if (!matchedRule) return;

    const domain = normalizeDomain(matchedRule.domain);
    if (!domain) return;
    const now = Date.now();
    if ((Number(passes[domain]) || 0) > now) return;

    const blockerUrl = chrome.runtime.getURL(
      \`blocker.html?target=\${encodeURIComponent(details.url)}&domain=\${encodeURIComponent(domain)}&wait=\${encodeURIComponent(matchedRule.waitTime || 10)}&math=\${encodeURIComponent(Boolean(matchedRule.mathRequired))}\`
    );
    chrome.tabs.update(details.tabId, { url: blockerUrl });
  });
});
