/* 星穹铁道身份局 - 通用工具 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const U = SR.util = SR.util || {};

  U.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    const fn = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.getState = () => s >>> 0;
    fn.setState = (v) => { s = v >>> 0; };
    return fn;
  };

  U.shuffle = function (arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  U.pick = function (arr, rng) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(rng() * arr.length)];
  };

  U.clamp = function (v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  U.sum = function (arr, fn) {
    return arr.reduce((s, x) => s + (fn ? fn(x) : x), 0);
  };

  U.unique = function (arr) {
    return Array.from(new Set(arr));
  };

  U.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.formatTime = function (date) {
    const d = date || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  U.assert = function (cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
