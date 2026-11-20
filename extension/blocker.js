const params = new URLSearchParams(window.location.search);
const domain = (params.get('domain') || '').trim().toLowerCase();
const rawTarget = params.get('target') || '';
const waitValue = Number(params.get('wait'));
const requestedWait = Number.isFinite(waitValue) ? Math.min(600, Math.max(1, Math.trunc(waitValue))) : 10;
const mathRequired = params.get('math') === 'true';
const PASS_MINUTES = 15;
let targetUrl = '';
try {
  const candidate = new URL(rawTarget);
  if (['http:', 'https:'].includes(candidate.protocol) && window.FrictionFlowDomain.matchesDomain(candidate.hostname, domain)) targetUrl = candidate.href;
} catch { /* Invalid or tampered redirect target: do not navigate. */ }

const targetDomainEl = document.getElementById('targetDomain');
if (targetDomainEl) targetDomainEl.textContent = domain || 'this site';
const timerDisplay = document.getElementById('timerDisplay');
const waitSection = document.getElementById('waitSection');
const mathSection = document.getElementById('mathSection');
const answerInput = document.getElementById('mathAnswer');

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
let correctAnswer = 0;
let granting = false;
let countdownTimer = null;
function setupMath() {
  const a = Math.floor(Math.random() * 50) + 10;
  const b = Math.floor(Math.random() * 50) + 10;
  correctAnswer = a + b;
  const question = document.getElementById('mathQuestion');
  if (question) question.textContent = a + ' + ' + b + ' = ?';
  if (answerInput) { answerInput.value = ''; answerInput.focus(); }
}
async function grantAccess() {
  if (granting || !targetUrl) return;
  granting = true;
  if (countdownTimer) clearInterval(countdownTimer);
  try {
    const data = await storageGet(['bypassedSites', 'focusPassExpiry', 'analyticsEnabled', 'backendApiKey', 'backendUrl']);
    const bypassed = data.bypassedSites && typeof data.bypassedSites === 'object' ? data.bypassedSites : {};
    const passes = data.focusPassExpiry && typeof data.focusPassExpiry === 'object' ? data.focusPassExpiry : {};
    const expiry = Date.now() + PASS_MINUTES * 60 * 1000;
    bypassed[domain] = Date.now();
    passes[domain] = expiry;
    await storageSet({ bypassedSites: bypassed, focusPassExpiry: passes });
    void sendAnalytics(data);
    window.location.replace(targetUrl);
  } catch (error) {
    granting = false;
    console.error('Could not save the focus pass:', error);
    alert('Could not save your focus pass. Please try again.');
  }
}
async function sendAnalytics(previousData) {
  if (previousData.analyticsEnabled !== true || !previousData.backendApiKey) return;
  const backendUrl = String(previousData.backendUrl || 'https://frictionflow-backend.onrender.com').replace(/\/$/, '');
  let endpoint;
  try {
    endpoint = new URL(backendUrl);
    const isLocalDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLocalDevelopment)) return;
  } catch { return; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(endpoint.href + '/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': String(previousData.backendApiKey) },
      body: JSON.stringify({ domain, action: 'bypassed', duration: requestedWait, occurred_at: Date.now(), user_id: 'extension' }),
      signal: controller.signal
    });
  } catch (error) { console.warn('Optional analytics request failed:', error.message); }
  finally { clearTimeout(timeout); }
}
function submitAnswer() {
  if (!answerInput) return;
  const value = answerInput.value.trim();
  if (!/^\d+$/.test(value) || Number(value) !== correctAnswer) { alert('Incorrect. Try again.'); setupMath(); return; }
  void grantAccess();
}
const submitMath = document.getElementById('submitMath');
if (submitMath) submitMath.addEventListener('click', submitAnswer);
if (answerInput) answerInput.addEventListener('keydown', event => { if (event.key === 'Enter') submitAnswer(); });
const emergencyExit = document.getElementById('emergencyExit');
if (emergencyExit) emergencyExit.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'CLOSE_BLOCKER_TAB' }));
const deadline = Date.now() + requestedWait * 1000;
function updateCountdown() {
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (timerDisplay) timerDisplay.textContent = remaining + 's';
  if (remaining > 0) return;
  if (countdownTimer) clearInterval(countdownTimer);
  if (waitSection) waitSection.classList.add('hidden');
  if (mathRequired) { setupMath(); if (mathSection) mathSection.classList.remove('hidden'); }
  else void grantAccess();
}
updateCountdown();
countdownTimer = setInterval(updateCountdown, 250);
