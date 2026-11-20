const BACKEND_URL = 'https://frictionflow-backend.onrender.com';

const urlParams = new URLSearchParams(window.location.search);
const rawTargetUrl = urlParams.get('target') || '';
let targetUrl = '';
try {
  const parsedTarget = new URL(rawTargetUrl);
  if (parsedTarget.protocol === 'http:' || parsedTarget.protocol === 'https:') targetUrl = parsedTarget.href;
} catch (_error) {}
const domain = (urlParams.get('domain') || '').trim().toLowerCase();
const requestedWait = Math.max(1, Math.min(600, Number(urlParams.get('wait')) || 10));
let waitTime = requestedWait;
const mathRequired = urlParams.get('math') === 'true';
const targetDomainEl = document.getElementById('targetDomain');
if (targetDomainEl) targetDomainEl.textContent = domain || 'this site';
const timerDisplay = document.getElementById('timerDisplay');
const waitSection = document.getElementById('waitSection');
const mathSection = document.getElementById('mathSection');

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, (data) => resolve(data || {})));
}
function localGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, (data) => resolve(data || {})));
}
function storageSet(value) {
  return new Promise((resolve) => chrome.storage.sync.set(value, () => resolve()));
}
let correctAnswer = 0;
function setupMath() {
  const a = Math.floor(Math.random() * 50) + 10;
  const b = Math.floor(Math.random() * 50) + 10;
  correctAnswer = a + b;
  const question = document.getElementById('mathQuestion');
  if (question) question.textContent = \`\${a} + \${b} = ?\`;
}
async function grantAccess() {
  if (!targetUrl || !domain) return;
  const keyResult = await localGet(['backendApiKey']);
  const apiKey = keyResult.backendApiKey ? String(keyResult.backendApiKey) : '';
  const analyticsPayload = {
    domain,
    action: 'bypassed',
    duration: requestedWait,
    occurred_at: Date.now(),
    user_id: 'extension',
  };
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    await fetch(\`\${BACKEND_URL}/api/analytics\`, {
      method: 'POST',
      headers,
      body: JSON.stringify(analyticsPayload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.warn('Analytics log failed:', error && error.message ? error.message : error);
  }
  const expiry = Date.now() + 15 * 60 * 1000;
  const data = await storageGet(['focusPassExpiry']);
  const passes = data.focusPassExpiry && typeof data.focusPassExpiry === 'object' ? data.focusPassExpiry : {};
  passes[domain] = expiry;
  await storageSet({ focusPassExpiry: passes });
  window.location.href = targetUrl;
}
const submitMath = document.getElementById('submitMath');
if (submitMath) {
  submitMath.addEventListener('click', () => {
    const answer = parseInt(document.getElementById('mathAnswer').value, 10);
    if (answer === correctAnswer) grantAccess();
    else { alert('Incorrect. Try again.'); setupMath(); }
  });
}
const emergencyExit = document.getElementById('emergencyExit');
if (emergencyExit) emergencyExit.addEventListener('click', () => window.close());
const interval = setInterval(() => {
  waitTime -= 1;
  if (timerDisplay) timerDisplay.textContent = \`\${Math.max(0, waitTime)}s\`;
  if (waitTime <= 0) {
    clearInterval(interval);
    if (waitSection) waitSection.classList.add('hidden');
    if (mathRequired) {
      setupMath();
      if (mathSection) mathSection.classList.remove('hidden');
    } else grantAccess();
  }
}, 1000);
if (timerDisplay) timerDisplay.textContent = \`\${waitTime}s\`;
