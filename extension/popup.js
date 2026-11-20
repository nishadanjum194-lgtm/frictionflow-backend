const STORAGE_KEYS = {
  rules: 'frictionRules',
  bypassed: 'bypassedSites',
  focusPass: 'focusPassExpiry',
};

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (value) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(value || {});
    });
  });
}
function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(value, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
function localGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (value) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(value || {});
    });
  });
}
function localSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

async function loadApiKey() {
  const data = await localGet(['backendApiKey']);
  document.getElementById('apiKey').value = data.backendApiKey || '';
}
document.getElementById('saveApiKey').addEventListener('click', async () => {
  const key = document.getElementById('apiKey').value.trim();
  await localSet({ backendApiKey: key });
  document.getElementById('keyStatus').textContent = key ? 'API key saved on this device.' : 'API key cleared.';
});

async function loadRules() {
  const data = await storageGet([STORAGE_KEYS.rules]);
  const rules = Array.isArray(data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules] : [];
  const container = document.getElementById('rulesList');
  container.textContent = '';
  if (rules.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No friction sites configured yet.';
    container.appendChild(empty);
    return;
  }
  rules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'rule-item';
    const main = document.createElement('div');
    main.className = 'rule-main';
    const domain = document.createElement('div');
    domain.className = 'rule-domain';
    domain.textContent = rule.domain;
    const meta = document.createElement('div');
    meta.className = 'rule-meta';
    meta.textContent = \`\${rule.waitTime || 0}s wait\${rule.mathRequired ? ' + math' : ''}\`;
    main.append(domain, meta);
    const removeButton = document.createElement('button');
    removeButton.className = 'remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      const fresh = await storageGet([STORAGE_KEYS.rules]);
      const current = Array.isArray(fresh[STORAGE_KEYS.rules]) ? fresh[STORAGE_KEYS.rules].slice() : [];
      current.splice(index, 1);
      await storageSet({ [STORAGE_KEYS.rules]: current });
      await loadRules();
    });
    item.append(main, removeButton);
    container.appendChild(item);
  });
}
function normalizeDomain(value) {
  let input = String(value || '').trim().toLowerCase();
  if (!input) return '';
  if (input.startsWith('http://') || input.startsWith('https://')) {
    try { input = new URL(input).hostname; } catch (_error) { return ''; }
  }
  input = input.replace(/^www\./, '');
  if (input.length > 253 || /[\/:@?#\s]/.test(input)) return '';
  try {
    const parsed = new URL('https://' + input);
    return parsed.hostname === input && parsed.pathname === '/' ? parsed.hostname : '';
  } catch (_error) { return ''; }
}

document.getElementById('addForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(document.getElementById('newDomain').value);
  const error = document.getElementById('formError');
  if (!domain) {
    error.textContent = 'Enter a valid domain, such as example.com.';
    return;
  }
  error.textContent = '';
  const waitTime = Math.max(1, Math.min(600, Number(document.getElementById('newWait').value) || 60));
  const mathRequired = document.getElementById('newMath').checked;
  const data = await storageGet([STORAGE_KEYS.rules]);
  const rules = Array.isArray(data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules].slice() : [];
  const existingIndex = rules.findIndex((rule) => String(rule && rule.domain).toLowerCase() === domain);
  const entry = { domain, waitTime, mathRequired };
  if (existingIndex >= 0) rules[existingIndex] = entry;
  else rules.push(entry);
  await storageSet({ [STORAGE_KEYS.rules]: rules });
  document.getElementById('addForm').reset();
  document.getElementById('newWait').value = '60';
  document.getElementById('newMath').checked = true;
  await loadRules();
});

Promise.all([loadApiKey(), loadRules()]).catch((error) => {
  document.getElementById('rulesList').textContent = 'Could not load settings: ' + error.message;
});
