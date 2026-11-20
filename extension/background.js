if (typeof importScripts === 'function') importScripts('domain-utils.js');
if (!globalThis.FrictionFlowDomain) throw new Error('FrictionFlow domain utilities failed to load.');

const DEFAULT_RULES = [
  { domain: 'youtube.com', waitTime: 60, mathRequired: true },
  { domain: 'instagram.com', waitTime: 60, mathRequired: true },
  { domain: 'twitter.com', waitTime: 30, mathRequired: false }
];
const PASS_STORAGE_KEY = 'focusPassExpiry';
const RULES_STORAGE_KEY = 'frictionRules';
const BYPASS_STORAGE_KEY = 'bypassedSites';

function storageGet(area, keys) {
  return new Promise(resolve => area.get(keys, result => {
    if (chrome.runtime.lastError) return resolve({});
    resolve(result || {});
  }));
}
function storageSet(area, values) {
  return new Promise(resolve => area.set(values, () => resolve(!chrome.runtime.lastError)));
}
async function initializeSettings() {
  const [localData, syncData] = await Promise.all([
    storageGet(chrome.storage.local, [RULES_STORAGE_KEY, BYPASS_STORAGE_KEY]),
    storageGet(chrome.storage.sync, [RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY])
  ]);
  const updates = {};
  if (!Array.isArray(syncData[RULES_STORAGE_KEY]) && Array.isArray(localData[RULES_STORAGE_KEY])) {
    updates[RULES_STORAGE_KEY] = localData[RULES_STORAGE_KEY].map(FrictionFlowDomain.normalizeRule).filter(Boolean);
  }
  if (!syncData[BYPASS_STORAGE_KEY] && localData[BYPASS_STORAGE_KEY] && typeof localData[BYPASS_STORAGE_KEY] === 'object') {
    updates[BYPASS_STORAGE_KEY] = localData[BYPASS_STORAGE_KEY];
  }
  if (!Array.isArray(syncData[RULES_STORAGE_KEY]) && !updates[RULES_STORAGE_KEY]) updates[RULES_STORAGE_KEY] = DEFAULT_RULES;
  if (!syncData[BYPASS_STORAGE_KEY] || typeof syncData[BYPASS_STORAGE_KEY] !== 'object') updates[BYPASS_STORAGE_KEY] = updates[BYPASS_STORAGE_KEY] || {};
  if (!syncData[PASS_STORAGE_KEY] || typeof syncData[PASS_STORAGE_KEY] !== 'object') updates[PASS_STORAGE_KEY] = {};
  if (Object.keys(updates).length) await storageSet(chrome.storage.sync, updates);
}
chrome.runtime.onInstalled.addListener(() => { void initializeSettings(); });
chrome.runtime.onStartup.addListener(() => { void initializeSettings(); });
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'CLOSE_BLOCKER_TAB' && sender.tab && Number.isInteger(sender.tab.id)) chrome.tabs.remove(sender.tab.id);
});
chrome.webNavigation.onBeforeNavigate.addListener(async details => {
  if (!details || details.frameId !== 0 || !details.url || !Number.isInteger(details.tabId)) return;
  let url;
  try { url = new URL(details.url); } catch { return; }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const data = await storageGet(chrome.storage.sync, [RULES_STORAGE_KEY, BYPASS_STORAGE_KEY, PASS_STORAGE_KEY]);
  const storedRules = Array.isArray(data[RULES_STORAGE_KEY]) ? data[RULES_STORAGE_KEY] : DEFAULT_RULES;
  const rule = storedRules.map(FrictionFlowDomain.normalizeRule).filter(Boolean)
    .find(item => FrictionFlowDomain.matchesDomain(hostname, item.domain));
  if (!rule) return;
  const now = Date.now();
  const passes = data[PASS_STORAGE_KEY] && typeof data[PASS_STORAGE_KEY] === 'object' ? data[PASS_STORAGE_KEY] : {};
  if (Number(passes[rule.domain]) > now) return;
  const bypassed = data[BYPASS_STORAGE_KEY] && typeof data[BYPASS_STORAGE_KEY] === 'object' ? data[BYPASS_STORAGE_KEY] : {};
  const lastBypassed = Number(bypassed[rule.domain] || 0);
  if (lastBypassed > 0 && now - lastBypassed <= 10 * 60 * 1000) return;
  const blockerUrl = chrome.runtime.getURL('blocker.html?target=' + encodeURIComponent(url.href) +
    '&domain=' + encodeURIComponent(rule.domain) + '&wait=' + encodeURIComponent(rule.waitTime) +
    '&math=' + encodeURIComponent(String(rule.mathRequired)));
  chrome.tabs.update(details.tabId, { url: blockerUrl }, () => {
    if (chrome.runtime.lastError) console.warn('FrictionFlow could not open the pause screen:', chrome.runtime.lastError.message);
  });
});
