const STORAGE_KEYS = { rules: 'frictionRules' };
const rulesList = document.getElementById('rulesList');
const form = document.getElementById('addForm');
const domainInput = document.getElementById('newDomain');
const waitInput = document.getElementById('newWait');
const mathInput = document.getElementById('newMath');
const status = document.getElementById('status');
function storageGet(keys) {
  return new Promise((resolve, reject) => chrome.storage.sync.get(keys, data => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    resolve(data || {});
  }));
}
function storageSet(value) {
  return new Promise((resolve, reject) => chrome.storage.sync.set(value, () => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    resolve();
  }));
}
function showStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(isError);
}
async function loadRules() {
  const data = await storageGet([STORAGE_KEYS.rules]);
  const rules = Array.isArray(data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules] : [];
  rulesList.replaceChildren();
  if (!rules.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No friction sites configured yet.';
    rulesList.appendChild(empty);
    return;
  }
  rules.forEach(rawRule => {
    const rule = window.FrictionFlowDomain.normalizeRule(rawRule);
    if (!rule) return;
    const item = document.createElement('div');
    item.className = 'rule-item';
    const main = document.createElement('div');
    main.className = 'rule-main';
    const domain = document.createElement('div');
    domain.className = 'rule-domain';
    domain.textContent = rule.domain;
    const meta = document.createElement('div');
    meta.className = 'rule-meta';
    meta.textContent = rule.waitTime + 's wait' + (rule.mathRequired ? ' + math' : '');
    main.append(domain, meta);
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      try {
        const fresh = await storageGet([STORAGE_KEYS.rules]);
        const current = Array.isArray(fresh[STORAGE_KEYS.rules]) ? fresh[STORAGE_KEYS.rules] : [];
        await storageSet({ [STORAGE_KEYS.rules]: current.filter(entry => {
          const normalized = window.FrictionFlowDomain.normalizeRule(entry);
          return !normalized || normalized.domain !== rule.domain;
        }) });
        await loadRules();
        showStatus('Removed ' + rule.domain + '.');
      } catch (error) { showStatus('Could not remove rule: ' + error.message, true); }
    });
    item.append(main, removeButton);
    rulesList.appendChild(item);
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  let domain;
  try { domain = window.FrictionFlowDomain.normalizeDomain(domainInput.value); }
  catch (error) { showStatus(error.message, true); domainInput.focus(); return; }
  const rawWait = Number(waitInput.value);
  if (!Number.isFinite(rawWait) || !Number.isInteger(rawWait) || rawWait < 1 || rawWait > 600) {
    showStatus('Wait time must be a whole number from 1 to 600 seconds.', true);
    waitInput.focus();
    return;
  }
  try {
    const data = await storageGet([STORAGE_KEYS.rules]);
    const current = Array.isArray(data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules] : [];
    const rules = current.map(window.FrictionFlowDomain.normalizeRule).filter(Boolean);
    const entry = { domain, waitTime: rawWait, mathRequired: mathInput.checked };
    const index = rules.findIndex(rule => rule.domain === domain);
    if (index >= 0) rules[index] = entry; else rules.push(entry);
    await storageSet({ [STORAGE_KEYS.rules]: rules });
    form.reset();
    waitInput.value = '60';
    mathInput.checked = true;
    await loadRules();
    showStatus('Saved ' + domain + '.');
  } catch (error) { showStatus('Could not save rule: ' + error.message, true); }
});
loadRules().catch(error => showStatus('Could not load rules: ' + error.message, true));
