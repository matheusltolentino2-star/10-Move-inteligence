/* 10 Move Intelligence — núcleo: utilidades, formatação, PRNG determinístico, DOM */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  /* ---------- PRNG determinístico (mulberry32) ---------- */
  function Rng(seed) {
    let a = seed >>> 0;
    this.next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Rng.prototype.int = function (min, max) { return min + Math.floor(this.next() * (max - min + 1)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  /* Caixa-Muller truncado */
  Rng.prototype.normal = function (mean, sd, min, max) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let val = mean + n * sd;
    if (min != null && val < min) val = min + (min - val) * 0.25;
    if (max != null && val > max) val = max - (val - max) * 0.25;
    if (min != null) val = Math.max(min, val);
    if (max != null) val = Math.min(max, val);
    return val;
  };
  /* Escolha ponderada: items = [{w: peso, ...}] */
  Rng.prototype.weighted = function (items, totalWeight) {
    let t = totalWeight;
    if (t == null) { t = 0; for (let i = 0; i < items.length; i++) t += items[i].w; }
    let r = this.next() * t;
    for (let i = 0; i < items.length; i++) { r -= items[i].w; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  MI.Rng = Rng;

  /* ---------- Formatação pt-BR ---------- */
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const nfCache = {};

  const fmt = {
    int: function (v) { return v == null || isNaN(v) ? '—' : nf0.format(Math.round(v)); },
    dec: function (v, d) {
      if (v == null || isNaN(v)) return '—';
      const casas = d == null ? 1 : Math.max(0, Math.min(6, d));
      if (casas === 1) return nf1.format(v);
      if (casas === 2) return nf2.format(v);
      let f = nfCache[casas];
      if (!f) f = nfCache[casas] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
      return f.format(v);
    },
    money: function (v) { return v == null || isNaN(v) ? '—' : cf.format(v); },
    pct: function (v, d) {
      if (v == null || isNaN(v)) return '—';
      return (d === 0 ? nf0 : nf1).format(v * 100).replace(/\s/g, '') + '%';
    },
    pctOf: function (part, total, d) { return total ? fmt.pct(part / total, d) : '—'; },
    compact: function (v) {
      if (v == null || isNaN(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e9) return nf1.format(v / 1e9) + ' bi';
      if (a >= 1e6) return nf1.format(v / 1e6) + ' mi';
      if (a >= 1e4) return nf0.format(Math.round(v / 1e3)) + ' mil';
      return nf0.format(Math.round(v));
    },
    date: function (d) {
      if (!(d instanceof Date) || isNaN(d)) return '—';
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    },
    dateIso: function (d) {
      if (!(d instanceof Date) || isNaN(d)) return '';
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    monthLabel: function (key) { // '2025-03' -> 'mar/25'
      const p = String(key).split('-');
      const m = MI.MESES_ABREV[(+p[1]) - 1] || '?';
      return m + '/' + String(p[0]).slice(2);
    },
    hour: function (h) { return String(h).padStart(2, '0') + 'h'; },
    bytes: function (b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return nf1.format(b / 1024) + ' KB';
      return nf1.format(b / 1048576) + ' MB';
    }
  };
  MI.fmt = fmt;

  MI.MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  MI.MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  MI.DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  MI.DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  /* ---------- DOM ---------- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return appendChildren(node, c);
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  MI.el = el; MI.clear = clear; MI.$ = $; MI.$$ = $$;

  /* ---------- Ícones (traço, 24x24) ---------- */
  const ICONS = {
    dashboard: '<path d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z"/>',
    users: '<path d="M16 19v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V19"/><circle cx="9.5" cy="8" r="3.2"/><path d="M17 11.2A3 3 0 0 0 17 5.3"/><path d="M21 19v-1.2a3.6 3.6 0 0 0-2.6-3.4"/>',
    map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.2 2"/>',
    filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6L4 5Z"/>',
    target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
    upload: '<path d="M12 16V5"/><path d="m8 9 4-4 4 4"/><path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
    report: '<path d="M14 3.5H7.5A2 2 0 0 0 5.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8l-4.5-4.5Z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6M9 16.5h4"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z"/><path d="m9.2 12.2 2 2 3.6-3.8"/>',
    database: '<ellipse cx="12" cy="6" rx="7.2" ry="2.8"/><path d="M4.8 6v12c0 1.5 3.2 2.8 7.2 2.8s7.2-1.3 7.2-2.8V6"/><path d="M4.8 12c0 1.5 3.2 2.8 7.2 2.8s7.2-1.3 7.2-2.8"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    download: '<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    alert: '<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2"/><circle cx="12" cy="8.2" r=".9" fill="currentColor"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7"/>',
    eye: '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    spark: '<path d="M4 17.5 9 11l3.5 3.5L20 6"/><path d="M15.5 6H20v4.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    refresh: '<path d="M20 11.5A8 8 0 0 0 6.3 6.8L4 9"/><path d="M4 4.5V9h4.5"/><path d="M4 12.5A8 8 0 0 0 17.7 17.2L20 15"/><path d="M20 19.5V15h-4.5"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7"/><path d="M6.5 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2A1.6 1.6 0 0 0 16.7 19l.8-12"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5h-7a3 3 0 0 0-3 3v7"/>'
  };
  MI.icon = function (name, size) {
    const s = size || 20;
    return '<svg class="icon" viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.info) + '</svg>';
  };

  /* ---------- Coleções ---------- */
  MI.countBy = function (rows, key) {
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][key];
      if (v == null || v === '') continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return m;
  };
  MI.mapToSorted = function (map, limit) {
    const arr = Array.from(map, function (e) { return { label: e[0], value: e[1] }; });
    arr.sort(function (a, b) { return b.value - a.value; });
    return limit ? arr.slice(0, limit) : arr;
  };
  MI.sum = function (arr, f) { let s = 0; for (let i = 0; i < arr.length; i++) s += f ? f(arr[i]) : arr[i]; return s; };
  /* Agrupa em uma passagem só — evita rows.filter() repetido sobre bases grandes */
  MI.groupBy = function (rows, key) {
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][key];
      if (v == null || v === '') continue;
      let a = m.get(v);
      if (!a) { a = []; m.set(v, a); }
      a.push(rows[i]);
    }
    return m;
  };
  MI.groupBy2 = function (rows, k1, k2) {
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i][k1], b = rows[i][k2];
      if (a == null || a === '' || b == null || b === '') continue;
      const key = a + '\u0001' + b;
      let arr = m.get(key);
      if (!arr) { arr = []; arr.a = a; arr.b = b; m.set(key, arr); }
      arr.push(rows[i]);
    }
    return m;
  };
  MI.uniq = function (arr) { return Array.from(new Set(arr)); };

  /* ---------- Normalização de texto ---------- */
  MI.slug = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  };
  /* Capitaliza respeitando partículas do português. Se o texto já vem com
     caixa mista (ex.: "São Bernardo do Campo"), é preservado como está. */
  const PARTICULAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'd', 'em', 'no', 'na'];
  MI.titleCase = function (s) {
    const txt = String(s == null ? '' : s).trim();
    if (!txt) return txt;
    const temMinuscula = /[a-zà-ú]/.test(txt), temMaiuscula = /[A-ZÀ-Ú]/.test(txt);
    if (temMinuscula && temMaiuscula) return txt; // já formatado pela origem
    return txt.toLowerCase().split(/(\s+|-)/).map(function (w, i) {
      if (!/[a-zà-ú]/.test(w)) return w;
      if (i > 0 && PARTICULAS.indexOf(w) >= 0) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join('');
  };

  /* ---------- CSV ---------- */
  MI.toCsv = function (header, rows) {
    const esc = function (v) {
      if (v == null) return '';
      const s = String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.map(esc).join(';')];
    for (let i = 0; i < rows.length; i++) lines.push(rows[i].map(esc).join(';'));
    return '﻿' + lines.join('\r\n');
  };

  /* ---------- Download / ambiente restrito ---------- */
  MI.env = {
    /* O visualizador de Artifact bloqueia downloads iniciados pela página. */
    downloadsBlocked: (function () {
      try { return !!window.claude || window.self !== window.top; } catch (e) { return true; }
    })()
  };

  MI.download = function (filename, mime, content) {
    try {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      return true;
    } catch (e) { return false; }
  };

  MI.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  };

  /* ---------- Avisos (toast) ---------- */
  let toastHost = null;
  MI.toast = function (message, kind) {
    if (!toastHost) {
      toastHost = el('div', { class: 'toast-host', id: 'toast-host' });
      document.body.appendChild(toastHost);
    }
    const t = el('div', { class: 'toast toast--' + (kind || 'info') }, [
      el('span', { class: 'toast__icon', html: MI.icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', 18) }),
      el('span', { text: message })
    ]);
    toastHost.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 4200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4800);
  };

  /* ---------- Armazenamento local tolerante a falhas ---------- */
  MI.storage = {
    get: function (key, fallback) {
      try {
        const raw = window.localStorage.getItem('mi.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem('mi.' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del: function (key) { try { window.localStorage.removeItem('mi.' + key); } catch (e) { } }
  };

  /* ---------- Datas ---------- */
  MI.parseDate = function (v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') {
      /* serial do Excel (dias desde 1899-12-30) */
      if (v > 20000 && v < 60000) return new Date(Math.round((v - 25569) * 86400000));
      return null;
    }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[T\s](\d{1,2}):(\d{2}))?/);
    if (m) {
      let y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900;
      const d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) return new Date(y, d - 1, mo, +(m[4] || 0), +(m[5] || 0));
      return new Date(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0));
    }
    return null;
  };

  MI.parseNumber = function (v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s|R\$|%/g, '');
    if (!s) return null;
    const hasComma = s.indexOf(',') >= 0, hasDot = s.indexOf('.') >= 0;
    if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
    else if (hasComma) s = s.replace(',', '.');
    else if (hasDot && /\.\d{3}(\D|$)/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return isFinite(n) ? n : null;
  };

  MI.monthKey = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

  /* ---------- Faixas de idade ---------- */
  MI.AGE_BANDS = [
    { label: 'Até 15', min: 0, max: 15 },
    { label: '16–24', min: 16, max: 24 },
    { label: '25–34', min: 25, max: 34 },
    { label: '35–44', min: 35, max: 44 },
    { label: '45–54', min: 45, max: 54 },
    { label: '55–64', min: 55, max: 64 },
    { label: '65+', min: 65, max: 200 }
  ];
  MI.ageBand = function (age) {
    if (age == null || isNaN(age)) return null;
    for (let i = 0; i < MI.AGE_BANDS.length; i++) {
      if (age >= MI.AGE_BANDS[i].min && age <= MI.AGE_BANDS[i].max) return MI.AGE_BANDS[i].label;
    }
    return age < 16 ? 'Até 15' : '65+';
  };

})(window.MI);
