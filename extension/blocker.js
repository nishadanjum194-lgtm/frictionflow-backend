// Configure this to your deployed backend (see /backend). For local dev use http://localhost:5001
const BACKEND_URL = 'https://frictionflow-backend.onrender.com';

const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('target') || '';
const domain = (urlParams.get('domain') || '').trim().toLowerCase();
const requestedWait = Math.max(1, Number(urlParams.get('wait')) || 10);
let waitTime = requestedWait;
const mathRequired = urlParams.get('math') === 'true';

const targetDomainEl = document.getElementById('targetDomain');
if (targetDomainEl) targetDomainEl.textContent = domain || 'this site';

const timerDisplay = document.getElementById('timerDisplay');
const waitSection = document.getElementById('waitSection');
const mathSection = document.getElementById('mathSection');

function nowMs() { return Date.now(); }

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}
function storageSet(value) {
  return new Promise((resolve) => chrome.storage.sync.set(value, resolve));
}

let correctAnswer = 0;
function setupMath() {
  const a = Math.floor(Math.random() * 50) + 10;
  const b = Math.floor(Math.random() * 50) + 10;
  correctAnswer = a + b;
  const q = document.getElementById('mathQuestion');
  if (q) q.textContent = `${a} + ${b} = ?`;
}

async function grantAccess() {
  const waitDuration = requestedWait;
  const startedAt = nowMs() - waitDuration * 1000;
  const apiKeyResult = await storageGet(['backendApiKey']);
  const apiKey = apiKeyResult && apiKeyResult.backendApiKey ? String(apiKeyResult.backendApiKey) : '';

  const started = nowMs();
  const analyticsPayload = {
    domain,
    action: 'bypassed',
    duration: waitDuration,
    occurred_at: startedAt,
    user_id: 'extension',
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await fetch(`${BACKEND_URL}/api/analytics`, {
      method: 'POST',
      headers,
      body: JSON.stringify(analyticsPayload),
    });
  } catch (err) {
    console.warn('Analytics log failed:', err && err.message ? err.message : err);
  }

  const passMinutes = Math.max(1, Math.round(requestedWait / 6) || 15);
  // Use a friendly default focus window of 15 minutes regardless of wait time.
  const focusMinutes = 15;
  const expiry = nowMs() + focusMinutes * 60 * 1000;

  const data = await storageGet(['bypassedSites', 'focusPassExpiry']);
  const bypassed = (data && data.bypassedSites && typeof data.bypassedSites === 'object') ? data.bypassedSites : {};
  const passes = (data && data.focusPassExpiry && typeof data.focusPassExpiry === 'object') ? data.focusPassExpiry : {};
  bypassed[domain] = nowMs();
  passes[domain] = expiry;
  await storageSet({ bypassedSites: bypassed, focusPassExpiry: passes });

  if (targetUrl) window.location.href = targetUrl;
}

const submitMath = document.getElementById('submitMath');
if (submitMath) {
  submitMath.addEventListener('click', () => {
    const val = parseInt(document.getElementById('mathAnswer').value, 10);
    if (val === correctAnswer) {
      grantAccess();
    } else {
      alert('Incorrect. Try again.');
      setupMath();
    }
  });
}

const emergencyExit = document.getElementById('emergencyExit');
if (emergencyExit) {
  emergencyExit.addEventListener('click', () => window.close());
}

let interval = setInterval(() => {
  waitTime -= 1;
  if (timerDisplay) timerDisplay.textContent = `${Math.max(0, waitTime)}s`;
  if (waitTime <= 0) {
    clearInterval(interval);
    if (waitSection) waitSection.classList.add('hidden');
    if (mathRequired) {
      setupMath();
      if (mathSection) mathSection.classList.remove('hidden');
    } else {
      grantAccess();
    }
  }
}, 1000);
if (timerDisplay) timerDisplay.textContent = `${waitTime}s`;