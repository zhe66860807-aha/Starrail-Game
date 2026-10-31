/* 星穹铁道身份局 - 中英双语显示层
 * 中文是唯一数据源；英文模式只在 DOM 显示层做替换，不改动游戏状态与规则逻辑。
 * 切回中文时按保存的原文逐节点还原，保证中文版本不受影响。
 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const I = SR.i18n = SR.i18n || {};
  const CJK = /[㐀-鿿豈-﫿]/;
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/;

  I.locale = 'zh-CN';
  I.exact = {};
  I.patterns = [];
  I.keys = [];
  I.misses = new Map();
  I.textOriginals = new WeakMap();
  I.attrOriginals = new WeakMap();
  I.observer = null;
  I.installed = false;
  I.onLocaleChange = null;

  I.normalize = function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  };

  // 法律声明等必须逐字显示的双语区块：英文模式下不翻译、也不计入中文残留扫描。
  I.skipSelector = '[data-i18n-skip]';
  I.isSkipped = function (node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest && el.closest(I.skipSelector));
  };

  // 英文标点转换：只用于包含中文的混合文本；纯英文译文保持原样。
  I.punct = function (s) {
    return String(s)
      .replace(/【/g, '[').replace(/】/g, ']')
      .replace(/“/g, '"').replace(/”/g, '"')
      .replace(/‘/g, "'").replace(/’/g, "'")
      .replace(/：/g, ': ')
      .replace(/，/g, ', ')
      .replace(/；/g, '; ')
      .replace(/。\s*/g, '. ')
      .replace(/！\s*/g, '! ')
      .replace(/？\s*/g, '? ')
      .replace(/、/g, ', ')
      .replace(/（/g, ' (')
      .replace(/）/g, ') ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+/g, ' ')
      .trim();
  };

  I.install = function (data) {
    if (!data) return;
    const exact = data.exact || {};
    I.exact = {};
    for (const zh of Object.keys(exact)) {
      const en = exact[zh];
      if (typeof en === 'string' && en) I.exact[I.normalize(zh)] = en;
    }
    I.patterns = (data.patterns || []).map(p => ({
      re: p[0] instanceof RegExp ? p[0] : new RegExp(p[0]),
      to: p[1]
    }));
    // 组件替换按长度降序，优先匹配较长的牌名/短语。
    I.keys = Object.keys(I.exact)
      .filter(k => Array.from(k).length >= 2)
      .sort((a, b) => b.length - a.length || a.localeCompare(b));
    // 单字仅用于最后的兜底替换，避免把“男/女/元素”留在英文句子里。
    I.singles = ['男', '女', '火', '冰', '雷', '风', '是', '否'].filter(k => I.exact[k]);
    I.installed = true;
  };

  I.recordMiss = function (s) {
    const key = I.normalize(s);
    if (!key) return;
    I.misses.set(key, (I.misses.get(key) || 0) + 1);
  };

  I.replaceComponents = function (out) {
    for (const k of I.keys) {
      if (out.indexOf(k) >= 0) out = out.split(k).join(I.exact[k]);
    }
    for (const k of I.singles) {
      if (out.indexOf(k) >= 0) out = out.split(k).join(I.exact[k]);
    }
    return out;
  };

  // 核心翻译：精确词条 → 句式规则 → 长词条组件替换。
  I.translate = function (s) {
    if (s == null) return '';
    const raw = String(s);
    if (!CJK.test(raw)) return raw;
    const core = I.normalize(raw);
    if (!core) return raw;
    if (Object.prototype.hasOwnProperty.call(I.exact, core)) return I.exact[core];
    for (const p of I.patterns) {
      p.re.lastIndex = 0;
      if (p.re.test(core)) {
        let out = core.replace(p.re, p.to);
        out = I.replaceComponents(out);
        out = I.punct(out);
        if (!CJK.test(out)) return out;
      }
    }
    let out = I.replaceComponents(core);
    out = I.punct(out);
    if (!CJK.test(out)) return out;
    I.recordMiss(core);
    return raw;
  };

  I.translateTextNode = function (node) {
    if (!node || node.nodeType !== 3) return;
    const parentNode = node.parentNode;
    if (parentNode && parentNode.tagName && SKIP_TAGS.test(parentNode.tagName)) return;
    if (I.isSkipped(node)) return;
    const raw = node.nodeValue;
    if (!raw || !CJK.test(raw)) return;
    const rec = I.textOriginals.get(node);
    if (rec && rec.en === raw) return;
    const core = I.normalize(raw);
    // 同一个中文词在不同控件里含义不同：场地效果下拉框的“关闭”= Off，弹窗按钮= Close。
    const parent = node.parentElement;
    let en;
    if (core === '关闭') {
      en = (parent && parent.tagName === 'OPTION' && parent.value === 'none') ? 'Off' : 'Close';
    } else if (parent && parent.classList && parent.classList.contains('equip-slot-placeholder')) {
      en = ({ '武器': 'WPN', '防具': 'ARM', '载具': 'VEH' })[core] || I.translate(core);
    } else {
      en = I.translate(core);
    }
    if (en === core && CJK.test(core)) return;
    const lead = (raw.match(/^\s*/) || [''])[0];
    const trail = (raw.match(/\s*$/) || [''])[0];
    const val = lead + en + trail;
    if (!rec || rec.zh !== raw) I.textOriginals.set(node, { zh: raw, en: val });
    else rec.en = val;
    node.nodeValue = val;
  };

  I.translateAttributes = function (el) {
    if (!el || el.nodeType !== 1) return;
    if (I.isSkipped(el)) return;
    for (const attr of ATTRS) {
      const raw = el.getAttribute(attr);
      if (!raw || !CJK.test(raw)) continue;
      let map = I.attrOriginals.get(el);
      if (!map) { map = {}; I.attrOriginals.set(el, map); }
      const rec = map[attr];
      if (rec && rec.en === raw) continue;
      const core = I.normalize(raw);
      const en = I.translate(core);
      if (en === core && CJK.test(core)) continue;
      if (!rec || rec.zh !== raw) map[attr] = { zh: raw, en };
      else rec.en = en;
      el.setAttribute(attr, en);
    }
  };

  I.translateTree = function (node) {
    if (!node) return;
    if (node.nodeType === 3) { I.translateTextNode(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (SKIP_TAGS.test(node.tagName) || I.isSkipped(node)) return;
      I.translateAttributes(node);
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (SKIP_TAGS.test(n.tagName) || I.isSkipped(n))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) I.translateTextNode(n);
      else I.translateAttributes(n);
    }
  };

  I.restoreTree = function (node) {
    if (!node) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    let n = node.nodeType === 1 ? node : null;
    if (n) {
      I.restoreAttributes(n);
    }
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        const rec = I.textOriginals.get(n);
        if (rec && rec.zh != null) n.nodeValue = rec.zh;
      } else {
        I.restoreAttributes(n);
      }
    }
  };

  I.restoreAttributes = function (el) {
    const map = I.attrOriginals.get(el);
    if (!map) return;
    for (const attr of Object.keys(map)) {
      const rec = map[attr];
      if (rec && rec.zh != null) el.setAttribute(attr, rec.zh);
    }
  };

  I.startObserver = function () {
    if (I.observer || typeof MutationObserver === 'undefined') return;
    I.observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') I.translateTextNode(m.target);
        else if (m.type === 'attributes') I.translateAttributes(m.target);
        else if (m.type === 'childList') {
          for (const n of m.addedNodes) I.translateTree(n);
        }
      }
    });
    I.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  };

  I.stopObserver = function () {
    if (!I.observer) return;
    I.observer.disconnect();
    I.observer = null;
  };

  I.docTitleZh = null;

  I.setLocale = function (locale, opts) {
    const next = locale === 'en-US' ? 'en-US' : 'zh-CN';
    const o = opts || {};
    if (next === I.locale) {
      if (o.notify !== false && I.onLocaleChange) I.onLocaleChange(I.locale);
      return;
    }
    if (next === 'en-US') {
      if (I.docTitleZh == null) I.docTitleZh = document.title;
      I.locale = 'en-US';
      document.documentElement.lang = 'en-US';
      I.translateTree(document.body);
      document.title = I.translate(I.docTitleZh);
      I.startObserver();
    } else {
      I.stopObserver();
      I.locale = 'zh-CN';
      document.documentElement.lang = 'zh-CN';
      I.restoreTree(document.body);
      if (I.docTitleZh != null) document.title = I.docTitleZh;
    }
    if (o.notify !== false && I.onLocaleChange) I.onLocaleChange(I.locale);
  };

  I.rulesText = function () {
    if (I.locale === 'en-US' && typeof SR.rulesTextEn === 'string' && SR.rulesTextEn) {
      return SR.rulesTextEn;
    }
    return SR.rulesText || '';
  };

  // 牌面英文名按空格折行；中文牌名仍沿用原有规则。
  I.cardNameLines = function (name) {
    const en = I.translate(name);
    if (!en || CJK.test(en)) return [name];
    if (Array.from(en).length <= 10) return [en];
    const words = en.split(/\s+/);
    if (words.length === 1) {
      const dash = en.indexOf('-');
      if (dash > 0 && dash < en.length - 1 && Math.max(dash + 1, en.length - dash - 1) <= 12) {
        return [en.slice(0, dash + 1), en.slice(dash + 1)];
      }
      return [en];
    }
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const score = Math.max(a.length, b.length) + Math.abs(a.length - b.length) * 0.3;
      if (!best || score < best.score) best = { a, b, score };
    }
    return best ? [best.a, best.b] : [en];
  };

  I.visibleCjk = function (root) {
    const out = [];
    const scope = root || document.body;
    if (!scope || typeof document === 'undefined') return out;
    if (I.isSkipped(scope)) return out;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (SKIP_TAGS.test(n.tagName) || I.isSkipped(n))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n = scope.nodeType === 1 ? scope : null;
    const takeAttr = el => {
      if (I.isSkipped(el)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute && el.getAttribute(a);
        if (v && CJK.test(v)) out.push(v.trim());
      }
    };
    if (n) takeAttr(n);
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        if (I.isSkipped(n)) continue;
        if (n.nodeValue && CJK.test(n.nodeValue)) out.push(n.nodeValue.trim());
      } else takeAttr(n);
    }
    if (document.title && CJK.test(document.title)) out.push(document.title);
    return out;
  };

  I.scan = function (root) {
    return I.visibleCjk(root);
  };

  I.report = function () {
    return {
      locale: I.locale,
      misses: Array.from(I.misses.entries()).map(([zh, count]) => ({ zh, count })),
      cjk: I.visibleCjk(document.body)
    };
  };

  if (SR.i18nData) I.install(SR.i18nData);
})(typeof globalThis !== 'undefined' ? globalThis : this);
