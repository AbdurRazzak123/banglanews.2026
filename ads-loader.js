/*
 * বাংলা সংবাদ — FINAL Ads Loader v22
 * Direct execution + safe sequential rendering.
 * Google Sheet Ads columns: A Position | B Active | C Image URL | D Click URL | E Title | F Ad Code
 * Supported: TOP, MIDDLE TOP, MIDDLE BOTTOM, BOTTOM, ALL, MIDDLE
 */
(function () {
  'use strict';

  const SHEET_ID = '1gX73WskIs3D-8IcyPJ24NT0xn1KIEJSjMXOF9nCQqTg';
  const SHEET_NAME = 'Ads';
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
    '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(SHEET_NAME);
  const VERSION = 'ads-v23-iframe-smart-final';
  // Built-in diagnostic fallback: this is NOT a paid/network ad. Set to false to hide it.
  const ENABLE_TEST_FALLBACK = true;
  const SHEET_TIMEOUT_MS = 5000;
  const CODE_TIMEOUT_MS = 4500;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const value = (row, i) => row && row.c && row.c[i] && row.c[i].v != null ? String(row.c[i].v).trim() : '';

  function parseGViz(raw) {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}') + 1;
    if (a < 0 || b <= a) throw new Error('Invalid Google Sheet response');
    const data = JSON.parse(raw.slice(a, b));
    if (data.status && data.status !== 'ok') throw new Error('Google Sheet status: ' + data.status);
    return data.table && Array.isArray(data.table.rows) ? data.table.rows : [];
  }

  function active(v) {
    const x = String(v || '').trim().toLowerCase();
    return !x || ['yes','true','1','active','on','হ্যাঁ','চালু'].includes(x);
  }

  function pos(v) {
    const p = String(v || '').toUpperCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if (p === 'TOP') return 'TOP';
    if (p === 'BOTTOM' || p === 'FOOTER') return 'BOTTOM';
    if (p === 'MIDDLE TOP' || p === 'MIDDLETOP') return 'MIDDLE_TOP';
    if (p === 'MIDDLE BOTTOM' || p === 'MIDDLEBOTTOM') return 'MIDDLE_BOTTOM';
    if (p === 'MIDDLE') return 'MIDDLE';
    if (p === 'ALL' || p === 'EVERYWHERE' || p === 'ALL POSITIONS') return 'ALL';
    return '';
  }

  function url(v) {
    const x = String(v || '').trim();
    return /^(https?:|mailto:|tel:|\/\/)/i.test(x) ? x : '';
  }

  function slots() {
    const out = [], seen = new Set();
    document.querySelectorAll('.sheet-ad-slot, .ad-slot').forEach(el => {
      if (seen.has(el)) return;
      if (!el.matches('.sheet-ad-slot') && !el.hasAttribute('data-ad-slot') && !el.hasAttribute('data-ad-position')) return;
      seen.add(el); out.push(el);
    });
    return out;
  }

  function slotPos(slot, i, total) {
    const explicit = pos(slot.getAttribute('data-ad-position') || slot.getAttribute('data-ad-slot'));
    if (explicit) return explicit;
    if (total === 2) return i === 0 ? 'TOP' : 'BOTTOM';
    if (total === 3) return ['TOP','MIDDLE','BOTTOM'][i] || '';
    if (total === 4) return ['TOP','MIDDLE_TOP','MIDDLE_BOTTOM','BOTTOM'][i] || '';
    return '';
  }

  function candidates(groups, p) {
    const out = [];
    const add = arr => { if (Array.isArray(arr)) arr.forEach(ad => { if (ad && !out.includes(ad)) out.push(ad); }); };
    add(groups[p]);
    add(groups.ALL);
    if (p === 'MIDDLE_TOP' || p === 'MIDDLE_BOTTOM') add(groups.MIDDLE);
    return out;
  }

  function clear(slot) {
    slot.replaceChildren();
    slot.classList.remove('ad-loaded','ad-code','ad-image');
    slot.removeAttribute('data-ad-error');
    slot.removeAttribute('data-ad-loaded');
  }

  function mark(slot, title, type) {
    slot.classList.add('ad-loaded', type === 'code' ? 'ad-code' : 'ad-image');
    slot.dataset.adLoaded = 'yes';
    slot.dataset.adType = type;
    slot.setAttribute('aria-label', title || 'Advertisement');
  }

  function imageAd(slot, image, click, title) {
    const src = url(image); if (!src) return false;
    clear(slot);
    const img = document.createElement('img');
    img.src = src; img.alt = title || 'Advertisement'; img.loading = 'eager'; img.decoding = 'async';
    const href = url(click);
    if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer sponsored'; a.appendChild(img); slot.appendChild(a); }
    else slot.appendChild(img);
    mark(slot, title, 'image');
    return true;
  }

  function hasCreative(host) {
    if (!host) return false;
    const els = host.querySelectorAll('iframe,img,object,embed,video,canvas,svg,ins,[data-ad-status="filled"],[data-ad],[class*="ad"],[id*="ad"]');
    for (const el of els) {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width > 2 && r.height > 2) return true;
      if (el.tagName === 'INS' && String(el.getAttribute('data-ad-status') || '').toLowerCase() === 'filled') return true;
    }
    return false;
  }

  function parseCode(code) {
    const template = document.createElement('template');
    template.innerHTML = code;
    return template.content;
  }

  async function runScriptsSequentially(host, scripts) {
    for (const old of scripts) {
      const s = document.createElement('script');
      for (const attr of old.attributes) {
        if (attr.name.toLowerCase() !== 'src') s.setAttribute(attr.name, attr.value);
      }
      const src = old.getAttribute('src');
      if (src) {
        s.src = src;
        s.async = false;
        await new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          s.onload = finish; s.onerror = finish;
          setTimeout(finish, 7000);
          host.appendChild(s);
        });
      } else {
        // Inline ad code runs in the page context, which lets providers see the real HTTPS site origin.
        s.text = old.textContent || '';
        host.appendChild(s);
        await sleep(40);
      }
    }
  }

  async function executeDirect(slot, code, title) {
    const source = String(code || '').trim();
    if (!source) return false;
    clear(slot);
    const iframe = document.createElement('iframe');
    iframe.className = 'ad-code-frame';
    iframe.title = title || 'Advertisement';
    iframe.setAttribute('scrolling','no');
    iframe.setAttribute('frameborder','0');
    iframe.style.cssText = 'display:block;width:100%;min-height:250px;border:0;margin:0 auto;overflow:hidden;background:transparent;';
    slot.appendChild(iframe);
    const waitForLoad = new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      iframe.addEventListener('load', finish, {once:true});
      iframe.addEventListener('error', finish, {once:true});
      setTimeout(finish, 2500);
    });
    try {
      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;overflow:hidden;">' + source + '</body></html>';
      await waitForLoad;
      const started = performance.now();
      const checks = [100,300,700,1200,2000,3200,4500];
      let previous = 0;
      for (const ms of checks) {
        await sleep(Math.max(0, ms - previous)); previous = ms;
        let doc = null;
        try { doc = iframe.contentDocument; } catch (_) {}
        if (doc && hasCreative(doc.body || doc.documentElement)) { mark(slot, title, 'code'); return true; }
        if (doc && doc.body && doc.body.innerHTML.trim()) {
          const txt = (doc.body.textContent || '').trim();
          if (doc.body.children.length > 0 || txt.length > 20) { mark(slot, title, 'code'); return true; }
        }
        if (performance.now() - started >= CODE_TIMEOUT_MS) break;
      }
      clear(slot); return false;
    } catch (e) {
      console.warn('Ads iframe execution failed:', e);
      clear(slot); slot.dataset.adError = 'iframe-execution-failed';
      return false;
    }
  }

  function testFallback(slot, reason) {
    if (!ENABLE_TEST_FALLBACK) return false;
    clear(slot);
    const box = document.createElement('div');
    box.className = 'ad-test-fallback';
    box.innerHTML = '<strong>TEST AD</strong><span>Ad slot is working</span><small>' +
      (reason || 'Network ad did not render') + '</small>';
    slot.appendChild(box);
    slot.classList.add('ad-loaded','ad-test');
    slot.dataset.adLoaded = 'test';
    slot.dataset.adType = 'test-fallback';
    slot.setAttribute('aria-label', 'Test advertisement fallback');
    return true;
  }

  async function render(slot, ads) {
    clear(slot);
    if (!ads || !ads.length) return testFallback(slot, 'No active ad found in Google Sheet');
    // Try every matching row, not only the first one. This prevents one bad TOP/MIDDLE row
    // from blocking a valid ad later in the same position.
    for (const ad of ads) {
      if (ad.code) {
        const ok = await executeDirect(slot, ad.code, ad.title);
        if (ok) return true;
      }
      if (imageAd(slot, ad.image, ad.click, ad.title)) return true;
    }
    return testFallback(slot, 'Matching ad rows were found, but none could render');
  }

  async function fetchSheet() {
    let last;
    for (let i=0; i<2; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
      try {
        const r = await fetch(SHEET_URL + '&_=' + Date.now() + '-' + i, {cache:'no-store',credentials:'omit',redirect:'follow',signal:controller.signal});
        if (!r.ok) throw new Error('Google Sheet HTTP ' + r.status);
        return parseGViz(await r.text());
      } catch (e) { last=e; if (i<1) await sleep(250); }
      finally { clearTimeout(timer); }
    }
    throw last || new Error('Google Sheet request failed');
  }

  async function loadAds() {
    const list = slots(); if (!list.length) return;
    // Always mark the loader version on every slot for easy browser debugging.
    list.forEach((s,i) => { s.dataset.adsLoader = VERSION; });
    if (location.protocol === 'file:') { console.warn('Ads: use HTTPS/GitHub Pages, not file://'); return; }
    list.forEach((s,i) => { const p=slotPos(s,i,list.length); s.dataset.adsLoader=VERSION; s.dataset.adPosition=p.toLowerCase().replace(/_/g,'-'); });
    try {
      const rows = await fetchSheet();
      const groups = {TOP:[],MIDDLE:[],MIDDLE_TOP:[],MIDDLE_BOTTOM:[],BOTTOM:[],ALL:[]};
      rows.forEach(row => {
        const p=pos(value(row,0)); if (!p || !Object.prototype.hasOwnProperty.call(groups,p) || !active(value(row,1))) return;
        const ad={image:value(row,2),click:value(row,3),title:value(row,4),code:value(row,5)};
        if (ad.code || ad.image) groups[p].push(ad);
      });
      await Promise.all(list.map((slot,i) => { const p=slotPos(slot,i,list.length); return render(slot,candidates(groups,p)); }));
    } catch(e) {
      console.warn('Google Sheet Ads load failed:',e);
      list.forEach(s => {
        s.dataset.adError='sheet-load-failed';
        testFallback(s, 'Google Sheet could not be loaded');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',loadAds,{once:true}); else loadAds();
})();
