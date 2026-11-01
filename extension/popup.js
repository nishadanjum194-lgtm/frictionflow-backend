const STORAGE_KEYS = {
  rules: 'frictionRules',
  bypassed: 'bypassedSites',
  focusPass: 'focusPassExpiry',
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
function storageSet(value) {
  return new Promise((resolve) => chrome.storage.sync.set(value, resolve));
}

async function loadRules() {
  const data = await storageGet([STORAGE_KEYS.rules]);
  const rules = Array.isArray(data && data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules] : [];
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
    meta.textContent = `${rule.waitTime || 0}s wait${rule.mathRequired ? ' + math' : ''}`;

    main.appendChild(domain);
    main.appendChild(meta);

    const removeButton = document.createElement('button');
    removeButton.className = 'remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      const fresh = await storageGet([STORAGE_KEYS.rules]);
      const current = Array.isArray(fresh && fresh[STORAGE_KEYS.rules]) ? fresh[STORAGE_KEYS.rules] : [];
      current.splice(index, 1);
      await storageSet({ [STORAGE_KEYS.rules]: current });
      await loadRules();
    });

    item.appendChild(main);
    item.appendChild(removeButton);
    container.appendChild(item);
  });
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
}

document.getElementById('addForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(document.getElementById('newDomain').value);
  if (!domain) return;

  const waitTime = Math.max(1, Math.min(600, Number(document.getElementById('newWait').value) || 60));
  const mathRequired = document.getElementById('newMath').checked;

  const data = await storageGet([STORAGE_KEYS.rules]);
  const rules = Array.isArray(data && data[STORAGE_KEYS.rules]) ? data[STORAGE_KEYS.rules].slice() : [];
  const existingIndex = rules.findIndex(rule => String(rule && rule.domain).toLowerCase() === domain);

  const entry = { domain, waitTime, mathRequired };
  if (existingIndex >= 0) {
    rules[existingIndex] = entry;
  } else {
    rules.push(entry);
  }

  await storageSet({ [STORAGE_KEYS.rules]: rules });
  document.getElementById('addForm').reset();
  document.getElementById('newWait').value = '60';
  document.getElementById('newMath').checked = true;
  await loadRules();
});

loadRules();