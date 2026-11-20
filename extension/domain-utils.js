(function (root) {
  'use strict';
  function normalizeDomain(input) {
    const value = String(input || '').trim();
    if (!value || /\s/.test(value)) throw new Error('Enter a valid website domain.');
    let url;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : 'https://' + value); }
    catch { throw new Error('Enter a valid website domain, such as reddit.com.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.port || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('Enter only a domain name, not a page URL, port, or credentials.');
    }
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!hostname || hostname.length > 253 ||
        !hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error('That domain name is not valid.');
    }
    return hostname;
  }
  function matchesDomain(hostname, domain) {
    const host = String(hostname || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    const rule = String(domain || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    return Boolean(host && rule && (host === rule || host.endsWith('.' + rule)));
  }
  function normalizeRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    let domain;
    try { domain = normalizeDomain(rule.domain); } catch { return null; }
    const wait = Number(rule.waitTime);
    return { domain, waitTime: Number.isFinite(wait) ? Math.min(600, Math.max(1, Math.trunc(wait))) : 60, mathRequired: rule.mathRequired === true };
  }
  const api = { normalizeDomain, matchesDomain, normalizeRule };
  root.FrictionFlowDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
