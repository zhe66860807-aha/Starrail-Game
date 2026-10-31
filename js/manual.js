/* 星穹铁道身份局 - 手动界面控制器
 * 说明：界面只负责展示和收集选择；牌、判定、濒死、胜负仍由 rules/judge/events 结算。
 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const M = SR.manual = SR.manual || {};
  const G = SR.game;
  const AI = SR.ai;
  const J = SR.judge;
  const U = SR.util;
  const C = SR.cards;

  const $ = id => document.getElementById(id);
  const esc = s => U.escapeHtml(s == null ? '' : s);
  const cssEscape = v => (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(String(v))
    : String(v).replace(/["\\]/g, '\\$&');
  const maxRounds = (SR.data.rulesMeta && SR.data.rulesMeta.maxRounds) || 100;

  M.active = false;
  // 正式对局中座位区显示牌背；调试时可临时改为 true 查看所有角色手牌。
  M.revealAllHands = false;
  M.prePlaySkillWindow = false;
  M.pauseReveal = null;
  M.pauseTimer = null;
  M.endHold = false;
  M.endHoldTimer = null;
  M.endHoldMessage = '';
  M.evernightSpecialActive = false;
  M.finishPending = false;
  M.deathHoldSeen = false;
  M.skillPointFx = null;
  M.skillPointFxTimer = null;
  // 战技点音效：用于去重与玩家按钮冷却（AI 使用也会播放，但不锁玩家按钮）。
  M.skillPointSfxSeen = new Set();
  M.skillPointPlayerReadyAt = 0;
  M.skillPointCooldownTimer = null;
  M.turnBannerTimer = null;
  M.state = null;
  // 【星核猎手】每张牌实例在本局内固定一种随机牌面，避免重复渲染时闪变。
  M.starHunterArtCache = new Map();
  M.human = null;
  M.current = null;
  M.timer = null;
  M.phase = 'idle';
  M.turnIndex = 0;
  M.pending = null;
  M.discardMode = false;
  M.selectedDiscard = new Set();
  M.chainsawMode = false;
  M.chainsawSelected = new Set();
  M.finishingHumanTurn = false;
  M.deathChoiceShown = false;
  M.spectating = false;
  M.deathContext = null;
  M.bootsInserted = false;
  M.lastScreen = 'start';
  // 引擎决策是同步的：需要玩家选择时抛出 NeedChoice，控制器回滚本次动作、
  // 在页面内询问，然后从头重放（RNG 快照保证重放一致）。
  M.choiceCollector = false;
  M.choiceRunning = false;
  M.choiceAnswers = null;
  M.choiceCursor = 0;

  // 局内聊天/表情系统。聊天本身只操作界面，不改变 gameState；
  // 唯一的例外是场地效果 4 的语音【魔术技巧】，由 events.js 计数。
  M.chat = {
    open: false,
    tab: 'emote',
    pid: null,
    anchorLocation: 'panel',
    cooldownUntil: 0,
    cooldownTimer: null,
    panel: null,
    bubble: null,
    bubbleTimer: null,
    drag: null,
    suppressClickUntil: 0,
    eventVoiceKey: '',
    eventEmoteKey: '',
    bubbleKind: null
  };

  function NeedChoice(request) {
    this.code = 'HUMAN_CHOICE';
    this.request = request;
  }

  const IDENTITY_WIN = {
    navigator: '消灭所有虚卒和内鬼。',
    loyalist: '保护领航员，协助消灭所有虚卒和内鬼。',
    rebel: '击败领航员。',
    traitor: '先让除自己和领航员外的其他角色全部阵亡，再击败领航员。'
  };

  const FACTION_NAMES = {
    navigator: '领航员&无名客',
    loyalist: '无名客',
    rebel: '虚卒',
    traitor: '内鬼',
    none: '救世主',
    draw: '平局'
  };

  function factionLabel(key) {
    return FACTION_NAMES[key] || key || '—';
  }

  function characterOf(p) {
    return (p && p.character) || (p && SR.data.characters.find(c => c.id === p.characterId)) || null;
  }

  // 官方「苍天航路绒绒号」卡牌动物头像；只保留动物主体，去除卡框、文字与对话框。
  const ANIMALS = {
    trailblazer_m: { img: 'assets/cards/avatar_trailblazer.png', name: '开拓者' },
    trailblazer_f: { img: 'assets/cards/avatar_trailblazer.png', name: '开拓者' },
    danheng: { img: 'assets/cards/avatar_danheng.png', name: '丹恒' },
    march7: { img: 'assets/cards/avatar_march7.png?v=20261031z8', name: '三月七' },
    himeko: { img: 'assets/cards/avatar_himeko.png', name: '姬子' },
    welt: { img: 'assets/cards/avatar_welt.png', name: '瓦尔特·杨' },
    sunday: { img: 'assets/cards/avatar_sunday.png', name: '星期日' }
  };

  M.animalFor = function (p) {
    const id = p && (p.characterId || p.id);
    return ANIMALS[id] || { emoji: '🐾', name: '毛绒动物' };
  };

  // 有官方头像图时使用图片，否则保留 emoji 占位。
  M.animalArtHtml = function (p, cls) {
    const a = M.animalFor(p);
    if (a.img) {
      return `<img class="${cls || 'seat-avatar-img'}" src="${esc(a.img)}?v=20261031z8" alt="" draggable="false">`;
    }
    return esc(a.emoji);
  };

  // 三月七护盾的四叶草背景参考图：白色花瓣、浅青描边、粉色内瓣、白色花心。
  const CLOVER_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <g fill="#fbffff" stroke="#7bd9e8" stroke-width="3.4" stroke-linejoin="round">
      <ellipse cx="35" cy="35" rx="22" ry="16" transform="rotate(45 35 35)"/>
      <ellipse cx="65" cy="35" rx="22" ry="16" transform="rotate(-45 65 35)"/>
      <ellipse cx="35" cy="65" rx="22" ry="16" transform="rotate(-45 35 65)"/>
      <ellipse cx="65" cy="65" rx="22" ry="16" transform="rotate(45 65 65)"/>
    </g>
    <g fill="#e6a7c3" opacity=".92">
      <ellipse cx="35" cy="35" rx="12.5" ry="7.5" transform="rotate(45 35 35)"/>
      <ellipse cx="65" cy="35" rx="12.5" ry="7.5" transform="rotate(-45 65 35)"/>
      <ellipse cx="35" cy="65" rx="12.5" ry="7.5" transform="rotate(-45 35 65)"/>
      <ellipse cx="65" cy="65" rx="12.5" ry="7.5" transform="rotate(45 65 65)"/>
    </g>
    <circle cx="50" cy="50" r="5.2" fill="#ffffff" stroke="#7bd9e8" stroke-width="2.4"/>
  </svg>`;

  M.cloverBgHtml = function () {
    return `<span class="clover-bg" aria-hidden="true">
      <span class="clover clover-a">${CLOVER_SVG}</span>
      <span class="clover clover-b">${CLOVER_SVG}</span>
      <i class="clover-spark spark-a"></i><i class="clover-spark spark-b"></i><i class="clover-spark spark-c"></i>
    </span>`;
  };

  // 【药王慈怀】治疗特效的银杏叶：宽扇形叶面、浅波状顶缘、长叶柄与叉状细脉。
  const GINKGO_SVG = `<svg viewBox="-26 -18 52 38" aria-hidden="true" focusable="false">
      <path class="ginkgo-fan" d="M0 10 C-7 4 -15 -3 -22 -10 L-24 -12 C-22 -15 -17 -16 -12 -16 C-8 -16 -4 -14 0 -13 C4 -14 8 -16 12 -16 C17 -16 22 -15 24 -12 L22 -10 C15 -3 7 4 0 10 Z"/>
      <path class="ginkgo-vein" d="M0 7 L-20 -9 M0 7 L-13 -13 M0 7 L-5 -14 M0 7 L0 -11 M0 7 L5 -14 M0 7 L13 -13 M0 7 L20 -9"/>
      <path class="ginkgo-stem" d="M0 9 L0 17"/>
    </svg>`;
  // 叶片用百分比定位、固定像素尺寸，避免座位高度不同时被拉伸变形。
  const ginkgoLeaf = (x, y, rot, size, delay) => `<span class="ginkgo" style="left:${(x / 2).toFixed(1)}%;top:${(y / 1.4).toFixed(1)}%;--rot:${rot}deg;--size:${size}px">
      <i class="ginkgo-inner" style="animation-delay:${delay}s">${GINKGO_SVG}</i>
    </span>`;

  M.medicineVineHtml = function (variant) {
    // 【我有魔芋爽】轮末伤害：藤蔓与银杏叶数量约为药王慈怀的两倍半，
    // 并额外使用 S 形长枝与横贯底部的拱形枝两种形态。
    const moyin = variant === 'moyin';
    const leaves = (moyin ? [
      [24, 122, -32, 22, .26], [32, 98, 22, 20, .42], [40, 74, -18, 24, .58], [50, 50, 14, 19, .75], [56, 26, -8, 21, .9],
      [176, 116, 30, 21, .32], [172, 92, -26, 19, .48], [168, 67, 18, 23, .65], [160, 43, -12, 19, .82], [154, 20, 8, 20, .97],
      [88, 124, -24, 18, .68], [126, 112, 20, 19, .86],
      [14, 128, -18, 16, .34], [20, 84, 52, 15, .68], [30, 42, -38, 16, .86],
      [66, 104, 28, 15, .52], [62, 60, -52, 14, .74], [84, 126, 10, 15, .62],
      [104, 124, -8, 16, .78], [112, 94, 38, 14, .6], [94, 66, -20, 14, .7],
      [106, 38, 24, 15, .88], [120, 20, -16, 14, .96], [140, 124, 20, 16, .44],
      [152, 110, -10, 15, .58], [184, 120, -26, 15, .36], [186, 96, 54, 14, .55],
      [185, 58, -58, 15, .72], [176, 32, 34, 14, .88], [142, 78, 8, 14, .66],
      [132, 48, -44, 14, .8], [80, 112, -62, 13, .9]
    ] : [
      [24, 122, -32, 22, .26], [32, 98, 22, 20, .42], [40, 74, -18, 24, .58], [50, 50, 14, 19, .75], [56, 26, -8, 21, .9],
      [176, 116, 30, 21, .32], [172, 92, -26, 19, .48], [168, 67, 18, 23, .65], [160, 43, -12, 19, .82], [154, 20, 8, 20, .97],
      [88, 124, -24, 18, .68], [126, 112, 20, 19, .86]
    ]).map(a => ginkgoLeaf(a[0], a[1], a[2], a[3], a[4])).join('');
    const branches = moyin ? `
        <path class="vine" pathLength="100" d="M-6 146 C18 128 6 104 28 78 C44 60 46 34 46 6"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.35s" d="M28 78 C40 70 44 60 44 48"/>
        <path class="vine" pathLength="100" style="animation-delay:.12s" d="M206 146 C182 128 194 104 172 78 C156 60 154 34 154 6"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.47s" d="M172 78 C160 70 156 60 156 48"/>
        <path class="vine soft" pathLength="100" style="animation-delay:.2s" d="M48 146 C72 132 90 128 112 114 C134 100 146 86 152 74"/>
        <path class="vine s-curve" pathLength="100" style="animation-delay:.08s" d="M112 150 C96 134 124 121 108 105 C92 89 121 77 107 61 C97 49 104 33 117 18"/>
        <path class="vine twig s-twig" pathLength="100" style="animation-delay:.5s" d="M108 105 C122 97 129 87 131 75"/>
        <path class="vine twig s-twig" pathLength="100" style="animation-delay:.64s" d="M107 61 C94 55 88 47 86 37"/>
        <path class="vine arch" pathLength="100" style="animation-delay:.26s" d="M-10 132 C22 111 52 122 82 132 C116 144 156 130 206 99"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.6s" d="M82 132 C80 119 73 111 63 107"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.72s" d="M47 146 C38 132 38 120 43 108"/>` : `
        <path class="vine" pathLength="100" d="M-6 146 C18 128 6 104 28 78 C44 60 46 34 46 6"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.35s" d="M28 78 C40 70 44 60 44 48"/>
        <path class="vine" pathLength="100" style="animation-delay:.12s" d="M206 146 C182 128 194 104 172 78 C156 60 154 34 154 6"/>
        <path class="vine twig" pathLength="100" style="animation-delay:.47s" d="M172 78 C160 70 156 60 156 48"/>
        <path class="vine soft" pathLength="100" style="animation-delay:.2s" d="M48 146 C72 132 90 128 112 114 C134 100 146 86 152 74"/>`;
    return `<span class="medicine-vine-fx${moyin ? ' moyin' : ''}" aria-hidden="true">
      <svg class="medicine-vines" viewBox="0 0 200 140" preserveAspectRatio="none" focusable="false">${branches}
      </svg>
      ${leaves}
    </span>`;
  };

  M.avatarHtml = function (p, extraClass) {
    const a = M.animalFor(p);
    const frozen = !!(p && p.alive && (p.statuses || []).some(s => s.id === 'incineration'));
    return `<span class="seat-avatar animal-avatar ${extraClass || ''}${frozen ? ' frozen-avatar' : ''}" data-pid="${esc(p.id)}" title="${esc(a.name)}">${M.animalArtHtml(p)}</span>`;
  };

  // 英文模式下座位只显示角色名，命途仍保留在详情与玩家面板中，避免长名字被截断。
  M.seatDisplayName = function (p) {
    const name = String((p && p.name) || '');
    if (SR.i18n && SR.i18n.locale === 'en-US' && name.indexOf('.') >= 0) return name.split('.')[0];
    return name;
  };

  // ---------- 聊天 / 表情 / 语音 ----------
  M.chatEmotes = {
    pillow: { image: 'assets/chat/pillow.svg?v=20261031z8', label: '扔枕头', hint: '按住并拖到其他角色头像' },
    coffee: { icon: '☕', label: '递咖啡', hint: '按住并拖到其他角色头像' }
  };

  // 点击即发送的图片表情；仅在对应事件轮次临时开放。
  M.chatImageEmotes = {
    laojing: {
      image: 'assets/chat/laojing.png?v=20261031z8',
      label: '牢景',
      hint: '点击直接发送',
      thumbPos: '62% 32%'
    },
    dawnimg: {
      image: 'assets/chat/dawn.png?v=20261031z8',
      label: '黑天鹅',
      hint: '点击直接发送',
      thumbPos: '50% 28%'
    },
    romance: {
      image: 'assets/chat/romance.png?v=20261031z8',
      label: '浪漫古士',
      hint: '点击直接发送',
      thumbPos: '50% 24%'
    }
  };

  M.chatToggleHtml = function (p, location) {
    if (!p || !p.isHuman) return '';
    const active = M.chat.open && M.chat.pid === p.id ? ' active' : '';
    return `<button type="button" class="chat-toggle-btn${active}" data-chat-toggle="1" data-chat-pid="${esc(p.id)}" data-chat-location="${esc(location || 'panel')}" title="聊天与表情" aria-label="打开聊天与表情" aria-expanded="${active ? 'true' : 'false'}">💬</button>`;
  };

  M.chatAvatarEl = function (pid) {
    if (!pid) return null;
    const seatAvatar = document.querySelector(`.seat[data-seat-pid="${cssEscape(pid)}"] .seat-avatar`);
    if (seatAvatar) return seatAvatar;
    return document.querySelector('.human-head .seat-avatar') || null;
  };

  M.ensureChatPanel = function () {
    if (M.chat.panel && document.body.contains(M.chat.panel)) return M.chat.panel;
    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '聊天与表情');
    panel.hidden = true;
    panel.addEventListener('click', M.onChatPanelClick);
    panel.addEventListener('pointerdown', M.onChatPanelPointerDown);
    document.body.appendChild(panel);
    M.chat.panel = panel;
    return panel;
  };

  M.chatCooldownMs = function () {
    return Math.max(0, (M.chat.cooldownUntil || 0) - Date.now());
  };

  M.chatCanSend = function () {
    return M.chatCooldownMs() <= 0;
  };

  // 玩家从开局起拥有全部特殊语音；AI 对特殊表情/语音的使用仍由各自事件控制。
  M.chatEventVoices = function () {
    return [
      { kind: 'herta1', line: '黑塔女士沉鱼落雁！' },
      { kind: 'herta2', line: '黑塔女士闭月羞花！' },
      { kind: 'herta3', line: '黑塔女士举世无双！' },
      { kind: 'huahuo', line: '我来押注，我来博弈，我来赢取...' },
      { kind: 'dawn', line: '所以我出手了' },
      { kind: 'moyu', line: '人有五名，代价有三个...' }
    ];
  };

  M.chatImageEmoteAvailable = function (kind) {
    return !!(kind && M.chatImageEmotes[kind]);
  };

  // 聊天栏内容从开局起完整显示；轮次切换不需要增删项目。
  M.syncChatEventItems = function () {
    if (M.chat.open) M.renderChatPanel();
  };

  M.renderChatPanel = function () {
    const panel = M.ensureChatPanel();
    if (!panel) return;
    const cd = M.chatCooldownMs();
    const ready = cd <= 0;
    const tab = M.chat.tab === 'voice' ? 'voice' : 'emote';
    let emoteItems = '';
    const imageKeys = Object.keys(M.chatImageEmotes);
    if (imageKeys.length) {
      emoteItems += `<div class="chat-image-grid">${imageKeys.map(key => {
        const img = M.chatImageEmotes[key];
        return `<button type="button" class="chat-send-item chat-emote-item chat-emote-image-item" data-chat-image="${key}" ${ready ? '' : 'disabled'} aria-label="${esc(img.label)}，点击直接发送">
          <img class="chat-emote-art" src="${esc(img.image)}" alt="" draggable="false">
          <span class="chat-emote-tip">点击直接发送</span>
        </button>`;
      }).join('')}</div>`;
    }
    emoteItems += Object.keys(M.chatEmotes).map(key => {
      const item = M.chatEmotes[key];
      const art = item.image
        ? `<img class="chat-emote-art chat-emote-art-small" src="${esc(item.image)}" alt="" draggable="false">`
        : `<span class="chat-emote-emoji" aria-hidden="true">${item.icon}</span>`;
      return `<button type="button" class="chat-send-item chat-emote-item" data-chat-emote="${key}" ${ready ? '' : 'disabled'}>
        ${art}
        <span class="chat-item-copy"><b>${item.label}</b><small>${item.hint}</small></span>
      </button>`;
    }).join('');
    const emoteHint = imageKeys.length
      ? '图片表情点击直接发送；扔枕头 / 递咖啡按住拖到其他角色头像。'
      : '扔枕头 / 递咖啡按住拖到其他角色头像上再松开。';
    let voiceItems = `<button type="button" class="chat-send-item chat-voice-item" data-chat-voice="magic" ${ready ? '' : 'disabled'}>
      <span class="chat-item-icon">🎙️</span>
      <span class="chat-item-copy"><b class="chat-voice-line">魔术技巧</b></span>
    </button>`;
    for (const voice of M.chatEventVoices()) {
      // 只有【魔术技巧】带实际音频；其余台词没有音效，用文字气泡图标区分。
      voiceItems += `<button type="button" class="chat-send-item chat-voice-item" data-chat-voice="${voice.kind}" ${ready ? '' : 'disabled'}>
        <span class="chat-item-icon" aria-hidden="true">💬</span>
        <span class="chat-item-copy"><b class="chat-voice-line">${esc(voice.line)}</b></span>
      </button>`;
    }
    panel.innerHTML = `
      <div class="chat-head">
        <div class="chat-title"><span class="chat-title-mark">✦</span> 聊天与表情</div>
        <button type="button" class="chat-close" data-chat-close="1" aria-label="关闭聊天">×</button>
      </div>
      <div class="chat-tabs" role="tablist">
        <button type="button" class="chat-tab${tab === 'emote' ? ' active' : ''}" data-chat-tab="emote">表情</button>
        <button type="button" class="chat-tab${tab === 'voice' ? ' active' : ''}" data-chat-tab="voice">语音</button>
      </div>
      <div class="chat-body">
        ${tab === 'emote' ? `<div class="chat-hint">${emoteHint}</div>${emoteItems}` : voiceItems}
      </div>
      <div class="chat-foot ${ready ? '' : ' cooling'}">${ready ? '发送冷却：表情 / 语音共用 2 秒' : `冷却中 ${(cd / 1000).toFixed(1)} 秒`}</div>`;
    panel.hidden = !M.chat.open;
    if (M.chat.open) M.positionChatPanel();
  };

  M.syncChatButtons = function () {
    document.querySelectorAll('[data-chat-toggle]').forEach(btn => {
      const active = !!(M.chat.open && btn.dataset.chatPid === M.chat.pid);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
  };

  M.openChat = function (btn, pid) {
    M.chat.open = true;
    M.chat.pid = pid || (btn && btn.dataset.chatPid) || (M.human && M.human.id);
    M.chat.anchorLocation = (btn && btn.dataset.chatLocation) || 'panel';
    M.renderChatPanel();
    M.syncChatButtons();
    M.positionChatPanel();
  };

  M.closeChat = function () {
    M.chat.open = false;
    M.clearChatDragTarget(M.chat.drag);
    if (M.chat.drag) {
      if (M.chat.drag.ghost) M.chat.drag.ghost.remove();
      M.chat.drag = null;
    }
    window.removeEventListener('pointermove', M.onChatDragMove);
    window.removeEventListener('pointerup', M.onChatDragEnd);
    window.removeEventListener('pointercancel', M.onChatDragEnd);
    if (M.chat.panel) {
      M.chat.panel.classList.remove('chat-dragging');
      M.chat.panel.hidden = true;
    }
    M.syncChatButtons();
  };

  M.toggleChat = function (btn) {
    const pid = btn && btn.dataset.chatPid;
    if (M.chat.open && M.chat.pid === pid) {
      M.closeChat();
      return;
    }
    M.openChat(btn, pid);
  };

  M.positionChatPanel = function () {
    const panel = M.chat.panel;
    if (!panel || !M.chat.open) return;
    const pid = M.chat.pid || (M.human && M.human.id);
    if (!pid) return;
    const location = M.chat.anchorLocation || 'panel';
    let btn = document.querySelector(`.chat-toggle-btn[data-chat-pid="${cssEscape(pid)}"][data-chat-location="${cssEscape(location)}"]`);
    if (!btn) btn = document.querySelector(`.chat-toggle-btn[data-chat-pid="${cssEscape(pid)}"]`);
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    panel.hidden = false;
    const pw = panel.offsetWidth || 280;
    const ph = panel.offsetHeight || 210;
    const gap = 8;
    let left = br.right + gap;
    if (left + pw > window.innerWidth - 8) left = br.left - pw - gap;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = br.top;
    if (top + ph > window.innerHeight - 8) top = br.bottom - ph;
    top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  };

  M.chatTargetAt = function (x, y) {
    if (!M.state || !M.human) return null;
    const hit = document.elementFromPoint(x, y);
    if (!hit) return null;
    const seat = hit.closest('.seat[data-seat-pid]');
    if (!seat) return null;
    const target = G.getPlayer(M.state, seat.dataset.seatPid);
    if (!target || !target.alive || target.id === M.human.id) return null;
    return { id: target.id, seat, avatar: seat.querySelector('.seat-avatar') };
  };

  M.clearChatDragTarget = function (drag) {
    if (!drag || !drag.target) return;
    if (drag.target.avatar) drag.target.avatar.classList.remove('chat-drop-target');
    if (drag.target.seat) drag.target.seat.classList.remove('chat-drop-target-seat');
    drag.target = null;
  };

  M.positionChatGhost = function (x, y) {
    const drag = M.chat.drag;
    if (!drag || !drag.ghost) return;
    drag.ghost.style.left = `${x + 14}px`;
    drag.ghost.style.top = `${y - 24}px`;
  };

  M.onChatDragMove = function (e) {
    const drag = M.chat.drag;
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    drag.moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4;
    M.positionChatGhost(e.clientX, e.clientY);
    const target = M.chatTargetAt(e.clientX, e.clientY);
    if (drag.target && (!target || drag.target.id !== target.id)) M.clearChatDragTarget(drag);
    if (target && (!drag.target || drag.target.id !== target.id)) {
      drag.target = target;
      if (target.avatar) target.avatar.classList.add('chat-drop-target');
      if (target.seat) target.seat.classList.add('chat-drop-target-seat');
    }
  };

  M.onChatDragEnd = function (e) {
    const drag = M.chat.drag;
    if (!drag) return;
    window.removeEventListener('pointermove', M.onChatDragMove);
    window.removeEventListener('pointerup', M.onChatDragEnd);
    window.removeEventListener('pointercancel', M.onChatDragEnd);
    if (drag.ghost) drag.ghost.remove();
    M.clearChatDragTarget(drag);
    if (M.chat.panel) M.chat.panel.classList.remove('chat-dragging');
    M.chat.drag = null;
    M.chat.suppressClickUntil = Date.now() + 450;
    const target = drag.moved ? M.chatTargetAt(e.clientX, e.clientY) : null;
    if (drag.moved && target) {
      if (!M.chatCanSend()) {
        M.toast('聊天冷却中，请稍候。');
        return;
      }
      M.chatStartCooldown();
      M.playChatEmote(drag.kind, target.id, drag.sourceEl, target.avatar);
      M.maybeAiEmoteResponse(drag.kind, target.id);
    } else if (drag.moved) {
      M.toast('请拖到其他角色的头像上再松开。');
    }
  };

  M.startChatDrag = function (e, item) {
    if (!item || e.button !== 0 || !M.chatCanSend()) return;
    const kind = item.dataset.chatEmote;
    const def = M.chatEmotes[kind];
    if (!def) return;
    e.preventDefault();
    // 在拖拽的手势中预先解锁 AudioContext；枕头在命中时才发声，避免被判为非用户手势。
    M.ensureSfxContext();
    const ghost = document.createElement('div');
    ghost.className = `chat-drag-ghost chat-drag-${kind}`;
    const ghostArt = def.image
      ? `<img class="chat-drag-img" src="${esc(def.image)}" alt="" draggable="false">`
      : `<span class="chat-drag-icon">${def.icon}</span>`;
    ghost.innerHTML = `${ghostArt}<span>${def.label}</span>`;
    ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    M.chat.drag = {
      kind, ghost, startX: e.clientX, startY: e.clientY,
      moved: false, target: null,
      sourceEl: M.chatAvatarEl(M.human && M.human.id)
    };
    if (M.chat.panel) M.chat.panel.classList.add('chat-dragging');
    M.positionChatGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', M.onChatDragMove, { passive: false });
    window.addEventListener('pointerup', M.onChatDragEnd);
    window.addEventListener('pointercancel', M.onChatDragEnd);
  };

  M.playChatEmote = function (kind, targetId, sourceEl, targetEl) {
    const target = M.state && G.getPlayer(M.state, targetId);
    if (!target || !targetEl) return;
    const tr = targetEl.getBoundingClientRect();
    const sr = sourceEl ? sourceEl.getBoundingClientRect() : tr;
    if (kind === 'pillow') {
      const el = document.createElement('div');
      el.className = 'chat-pillow-fx';
      el.innerHTML = `<img class="chat-pillow-img" src="${esc(M.chatEmotes.pillow.image)}" alt="" draggable="false">`;
      document.body.appendChild(el);
      const sx = sr.left + sr.width / 2;
      const sy = sr.top + sr.height / 2;
      const tx = tr.left + tr.width / 2;
      const ty = tr.top + tr.height / 2;
      el.style.left = `${sx - 24}px`;
      el.style.top = `${sy - 17}px`;
      const dx = tx - sx;
      const dy = ty - sy;
      const finish = () => {
        el.remove();
        M.playChatSfx('pillow');
        M.chatImpact(targetEl, 'pillow');
      };
      if (typeof el.animate === 'function') {
        const anim = el.animate([
          { transform: 'translate(0, 0) rotate(0deg) scale(.85)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(640deg) scale(1.05)` }
        ], { duration: 620, easing: 'cubic-bezier(.2,.75,.3,1)' });
        anim.onfinish = finish;
      } else {
        setTimeout(finish, 620);
      }
    } else if (kind === 'coffee') {
      const el = document.createElement('div');
      el.className = 'chat-coffee-fx';
      el.innerHTML = '<span class="coffee-cup">☕</span>';
      const sx = sr.left + sr.width / 2;
      const sy = sr.top + sr.height / 2;
      const tx = tr.left + tr.width / 2;
      const ty = tr.top + tr.height / 2;
      el.style.left = `${sx - 17}px`;
      el.style.top = `${sy - 17}px`;
      document.body.appendChild(el);
      const dx = tx - sx;
      const dy = ty - sy;
      const finish = () => {
        el.remove();
        M.playChatSfx('coffee');
        targetEl.classList.add('chat-coffee-target');
        setTimeout(() => targetEl.classList.remove('chat-coffee-target'), 900);
      };
      if (typeof el.animate === 'function') {
        // 咖啡杯保持直立，从发送者位置直接递到目标面前；不做倾倒/倒液动画。
        const anim = el.animate([
          { transform: 'translate(0, 0) scale(.9)', opacity: 0 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 12}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(1.02)`, opacity: 1 }
        ], { duration: 720, easing: 'cubic-bezier(.2,.75,.3,1)' });
        anim.onfinish = finish;
      } else {
        setTimeout(finish, 720);
      }
    }
  };

  M.chatImpact = function (targetEl, kind) {
    if (!targetEl) return;
    const r = targetEl.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `chat-impact-fx ${kind || ''}`;
    el.textContent = kind === 'coffee' ? '☕' : '✦';
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  };

  M.clearChatBubble = function () {
    if (M.chat.bubble) { M.chat.bubble.remove(); M.chat.bubble = null; }
    if (M.chat.bubbleTimer) { clearTimeout(M.chat.bubbleTimer); M.chat.bubbleTimer = null; }
    M.chat.bubbleKind = null;
  };

  // 聊天气泡统一贴在头像侧面，垂直居中，并根据左右位置切换小三角方向。
  M.placeChatBubble = function (el, avatar, fallback) {
    if (!el || !avatar) return;
    const r = avatar.getBoundingClientRect();
    const f = fallback || {};
    const bw = el.offsetWidth || f.width || 170;
    const bh = el.offsetHeight || f.height || 40;
    let left = r.right + 7;
    // 聊天栏开着时优先放到头像另一侧，避免遮住面板。
    const panel = M.chat.open ? M.chat.panel : null;
    const pr = panel ? panel.getBoundingClientRect() : null;
    if (pr && (pr.left + pr.width / 2) > (r.left + r.width / 2)) left = r.left - bw - 7;
    if (left < 8) left = r.right + 7;
    if (left + bw > window.innerWidth - 8) left = r.left - bw - 7;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = r.top + r.height / 2 - bh / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
    const bubbleCenter = left + bw / 2;
    const avatarCenter = r.left + r.width / 2;
    el.classList.toggle('tail-right', bubbleCenter < avatarCenter);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  };

  M.showChatBubble = function (text, pid, kind) {
    const avatar = M.chatAvatarEl(pid);
    if (!avatar) return;
    M.clearChatBubble();
    const el = document.createElement('div');
    el.className = `chat-speech-bubble${kind ? ' ' + kind : ''}`;
    // 只有【魔术技巧】有实际音频，其余台词以文字气泡图标显示。
    const voiceIcon = kind === 'magic' ? '🎙️' : '💬';
    el.innerHTML = `<span class="chat-speech-icon">${voiceIcon}</span><span>${esc(text)}</span>`;
    document.body.appendChild(el);
    M.placeChatBubble(el, avatar);
    M.chat.bubble = el;
    M.chat.bubbleKind = kind || 'text';
    M.chat.bubbleTimer = setTimeout(() => {
      el.remove();
      if (M.chat.bubble === el) {
        M.chat.bubble = null;
        M.chat.bubbleKind = null;
      }
      M.chat.bubbleTimer = null;
    }, 2600);
  };

  // 图片表情气泡：直接贴着头像显示，不加语音图标或文字。
  M.showChatImageBubble = function (src, pid, kind) {
    const avatar = M.chatAvatarEl(pid);
    if (!avatar || !src) return;
    M.clearChatBubble();
    const el = document.createElement('div');
    el.className = `chat-speech-bubble chat-image-bubble${kind ? ' ' + kind : ''}`;
    el.innerHTML = `<img class="chat-bubble-image" src="${esc(src)}" alt="" draggable="false">`;
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    M.placeChatBubble(el, avatar, { width: 168, height: 110 });
    const img = el.querySelector('img');
    const showBubble = () => {
      // 图片加载后尺寸才确定，重新居中以避免小三角错位。
      M.placeChatBubble(el, avatar, { width: 168, height: 110 });
      el.style.visibility = '';
    };
    if (img && img.complete) showBubble();
    else if (img) img.addEventListener('load', showBubble, { once: true });
    M.chat.bubble = el;
    M.chat.bubbleKind = kind || 'image';
    M.chat.bubbleTimer = setTimeout(() => {
      el.remove();
      if (M.chat.bubble === el) {
        M.chat.bubble = null;
        M.chat.bubbleKind = null;
      }
      M.chat.bubbleTimer = null;
    }, 3200);
  };

  M.chatStartCooldown = function () {
    M.chat.cooldownUntil = Date.now() + 2000;
    if (M.chat.cooldownTimer) clearTimeout(M.chat.cooldownTimer);
    M.renderChatPanel();
    M.chat.cooldownTimer = setTimeout(() => {
      M.chat.cooldownTimer = null;
      M.renderChatPanel();
    }, 2040);
  };

  M.sendChatVoice = function (kind) {
    if (!M.chatCanSend()) {
      M.toast(`聊天冷却中 ${(M.chatCooldownMs() / 1000).toFixed(1)} 秒。`);
      return;
    }
    if (kind === 'magic') {
      M.chatStartCooldown();
      M.showChatBubble('魔术技巧', M.human && M.human.id, 'magic');
      M.playMagicVoice();
      M.handleMagicChatVoice();
      return;
    }
    const eventVoice = M.chatEventVoices().find(v => v.kind === kind);
    if (eventVoice) {
      // 特殊语音：不播放音频，也不触发任何对局效果。
      M.chatStartCooldown();
      M.showChatBubble(eventVoice.line, M.human && M.human.id, kind);
    }
  };

  M.sendChatImageEmote = function (kind) {
    if (!M.chatCanSend()) {
      M.toast(`聊天冷却中 ${(M.chatCooldownMs() / 1000).toFixed(1)} 秒。`);
      return;
    }
    const def = M.chatImageEmotes[kind];
    if (!def) return;
    if (!M.chatImageEmoteAvailable(kind)) return;
    M.chatStartCooldown();
    M.showChatImageBubble(def.image, M.human && M.human.id, kind);
  };

  M.handleMagicChatVoice = function () {
    const state = M.state;
    if (!state || state.over || !M.human || !M.human.alive) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 4) return;
    if (!SR.events || typeof SR.events.magicShout !== 'function') return;
    try {
      const result = SR.events.magicShout(state, M.human);
      if (!result) return;
      if (result.reward) {
        M.toast(`魔术技巧：第 ${result.count} 次喊话，获得【奇巧零食】。`, 2600);
      } else if (result.ended) {
        M.toast(`魔术技巧：${result.message || '本次奖励已结束'}。`, 2600);
      } else {
        M.toast(`魔术技巧：${result.count}/10。`);
      }
      if (M.human && M.human.characterId === 'march7') {
        const dan = M.state.players.find(p => p.characterId === 'danheng' && M.aiCanChat(p));
        if (dan && Math.random() < 0.25) {
          M.scheduleAiChat(180, () => {
            const cur = M.aiPlayer(dan.id);
            if (M.aiCanChat(cur)) M.showAiChatBubble('...', dan.id, 'text');
          }, 4);
        }
      }
      M.render();
      M.positionChatPanel();
    } catch (e) {
      console.error(e);
      M.toast('魔术技巧语音结算失败。');
    }
  };

  M.onChatPanelClick = function (e) {
    if (e.target.closest('[data-chat-close]')) {
      M.closeChat();
      return;
    }
    const tab = e.target.closest('[data-chat-tab]');
    if (tab) {
      M.chat.tab = tab.dataset.chatTab === 'voice' ? 'voice' : 'emote';
      M.renderChatPanel();
      M.positionChatPanel();
      return;
    }
    const imageEmote = e.target.closest('[data-chat-image]');
    if (imageEmote) {
      M.sendChatImageEmote(imageEmote.dataset.chatImage);
      return;
    }
    const voice = e.target.closest('[data-chat-voice]');
    if (voice) {
      M.sendChatVoice(voice.dataset.chatVoice);
      return;
    }
    const emote = e.target.closest('[data-chat-emote]');
    if (emote && !M.chat.drag) {
      M.toast(M.chatEmotes[emote.dataset.chatEmote] ? M.chatEmotes[emote.dataset.chatEmote].hint + '。' : '请拖到目标头像。');
    }
  };

  M.onChatPanelPointerDown = function (e) {
    const item = e.target.closest('[data-chat-emote]');
    if (!item || e.button !== 0) return;
    if (!M.chatCanSend()) {
      e.preventDefault();
      M.toast(`聊天冷却中 ${(M.chatCooldownMs() / 1000).toFixed(1)} 秒。`);
      return;
    }
    M.startChatDrag(e, item);
  };

  M.onChatOutsidePointer = function (e) {
    if (!M.chat.open) return;
    if (e.target.closest('.chat-panel') || e.target.closest('[data-chat-toggle]')) return;
    // 点击聊天栏外部只负责关闭聊天，不把这次点击继续传给牌桌/手牌。
    M.chat.suppressClickUntil = Date.now() + 350;
    M.closeChat();
  };

  M.onChatToggleClick = function (e) {
    const btn = e.target.closest('[data-chat-toggle]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    M.toggleChat(btn);
  };

  M.onChatSuppressClick = function (e) {
    if (Date.now() > (M.chat.suppressClickUntil || 0)) return;
    if (e.target.closest('.chat-panel') || e.target.closest('[data-chat-toggle]')) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // ---------- AI 聊天与表情行为 ----------
  M.aiChatTimers = new Set();
  M.aiBubbles = new Map();
  M.aiChatSeen = new Set();
  M.aiChatEpoch = 0;
  M.magicAiRound = null;

  // 仅存活 AI 会主动发送；逐火等隔离状态中的 AI 仍可发送。
  M.aiCanChat = function (p) {
    if (!p || p.isHuman) return false;
    if (p.alive) return true;
    return !!(SR.game && SR.game.hasStatus && SR.game.hasStatus(p, 'zhuhuo'));
  };

  M.aiChatOnce = function (key) {
    if (!key) return true;
    if (M.aiChatSeen.has(key)) return false;
    M.aiChatSeen.add(key);
    return true;
  };

  M.aiPlayer = function (id) {
    return M.state && SR.game.getPlayer(M.state, id);
  };

  M.clearAiChatBubbles = function () {
    for (const entry of M.aiBubbles.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.el) entry.el.remove();
    }
    M.aiBubbles.clear();
  };

  M.clearAiChat = function () {
    M.aiChatEpoch += 1;
    for (const timer of M.aiChatTimers) clearTimeout(timer);
    M.aiChatTimers.clear();
    M.clearAiChatBubbles();
    M.aiChatSeen.clear();
    M.magicAiRound = null;
  };

  // AI 消息全部绑定当前轮次；轮末/胜负/静默模拟时由 clearAiChat 统一取消。
  M.scheduleAiChat = function (delay, fn, eventId) {
    if (!M.active || !M.state || M.spectating) return null;
    const epoch = M.aiChatEpoch;
    const round = M.state.round;
    const timer = setTimeout(() => {
      M.aiChatTimers.delete(timer);
      if (!M.active || !M.state || M.spectating) return;
      if (M.aiChatEpoch !== epoch) return;
      if (!M.state || M.state.over || M.state.round !== round) return;
      if (M.state.phase === 'roundEnd') return;
      if (eventId != null && (!M.state.fieldEffect || M.state.fieldEffect.id !== eventId)) return;
      fn();
    }, Math.max(0, delay));
    M.aiChatTimers.add(timer);
    return timer;
  };

  M.placeAiBubble = function (el, avatar) {
    M.placeChatBubble(el, avatar);
  };

  M.showAiChatBubble = function (text, pid, kind) {
    const p = M.aiPlayer(pid);
    if (!M.aiCanChat(p)) return;
    const avatar = M.chatAvatarEl(pid);
    if (!avatar) return;
    const prev = M.aiBubbles.get(pid);
    if (prev) {
      if (prev.timer) clearTimeout(prev.timer);
      if (prev.el) prev.el.remove();
      M.aiBubbles.delete(pid);
    }
    const el = document.createElement('div');
    el.className = 'chat-speech-bubble ai-chat-bubble' + (kind ? ' ' + kind : '');
    // 只有【魔术技巧】有实际音频，其余台词以文字气泡图标显示。
    const voiceIcon = kind === 'magic' ? '🎙️' : '💬';
    el.innerHTML = `<span class="chat-speech-icon">${voiceIcon}</span><span>${esc(text)}</span>`;
    document.body.appendChild(el);
    M.placeChatBubble(el, avatar);
    const timer = setTimeout(() => {
      el.remove();
      const cur = M.aiBubbles.get(pid);
      if (cur && cur.el === el) M.aiBubbles.delete(pid);
    }, 2600);
    M.aiBubbles.set(pid, { el, timer });
  };

  M.showAiChatImageBubble = function (src, pid, kind) {
    const p = M.aiPlayer(pid);
    if (!M.aiCanChat(p) || !src) return;
    const avatar = M.chatAvatarEl(pid);
    if (!avatar) return;
    const prev = M.aiBubbles.get(pid);
    if (prev) {
      if (prev.timer) clearTimeout(prev.timer);
      if (prev.el) prev.el.remove();
      M.aiBubbles.delete(pid);
    }
    const el = document.createElement('div');
    el.className = 'chat-speech-bubble chat-image-bubble ai-chat-bubble' + (kind ? ' ' + kind : '');
    el.innerHTML = `<img class="chat-bubble-image" src="${esc(src)}" alt="" draggable="false">`;
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    M.placeChatBubble(el, avatar, { width: 168, height: 110 });
    const img = el.querySelector('img');
    const showBubble = () => {
      M.placeChatBubble(el, avatar, { width: 168, height: 110 });
      el.style.visibility = '';
    };
    if (img && img.complete) showBubble();
    else if (img) img.addEventListener('load', showBubble, { once: true });
    const timer = setTimeout(() => {
      el.remove();
      const cur = M.aiBubbles.get(pid);
      if (cur && cur.el === el) M.aiBubbles.delete(pid);
    }, 3200);
    M.aiBubbles.set(pid, { el, timer });
  };

  M.aiEmoteTo = function (kind, fromId, toId) {
    const state = M.state;
    if (!state) return;
    const from = SR.game.getPlayer(state, fromId);
    const to = SR.game.getPlayer(state, toId);
    if (!M.aiCanChat(from) || !to) return;
    if (!(to.alive || SR.game.hasStatus(to, 'zhuhuo'))) return;
    const sourceEl = M.chatAvatarEl(fromId);
    const targetEl = M.chatAvatarEl(toId);
    if (!sourceEl || !targetEl) return;
    M.playChatEmote(kind, toId, sourceEl, targetEl);
  };

  M.aiMagicShout = function (pid) {
    const state = M.state;
    if (!state || !state.fieldEffect || state.fieldEffect.id !== 4) return false;
    const p = SR.game.getPlayer(state, pid);
    if (!M.aiCanChat(p)) return false;
    M.showAiChatBubble('魔术技巧', pid, 'magic');
    // AI 玩家喊出魔术技巧时与玩家发送该语音完全一致：播放同一条人声。
    M.playMagicVoice();
    try {
      if (SR.events && typeof SR.events.magicShout === 'function') SR.events.magicShout(state, p);
    } catch (e) { /* 聊天失败不影响对局 */ }
    return true;
  };

  M.aiVoiceText = {
    huahuo: '我来押注，我来博弈，我来赢取...',
    moyu: '人有五名，代价有三个...',
    herta1: '黑塔女士沉鱼落雁！',
    herta2: '黑塔女士闭月羞花！',
    herta3: '黑塔女士举世无双！'
  };

  // 魔术技巧：按角色配置启动 AI 喊话。
  M.startMagicAiChat = function (state) {
    if (!M.active || !M.state || state !== M.state || M.spectating) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 4) return;
    if (M.magicAiRound === state.round) return;
    M.clearAiChat();
    M.magicAiRound = state.round;
    const findId = pred => {
      const p = state.players.find(pred);
      return p && M.aiCanChat(p) ? p.id : null;
    };
    const marchId = findId(p => p.characterId === 'march7');
    const trailId = findId(p => p.characterId && p.characterId.indexOf('trailblazer') === 0);
    const danId = findId(p => p.characterId === 'danheng');
    const himekoId = findId(p => p.characterId === 'himeko');
    const weltId = findId(p => p.characterId === 'welt');
    const sundayId = findId(p => p.characterId === 'sunday');

    // 三月七 / 开拓者：两人都在 AI 场时随机选一人，12–15 次，每 2 秒一次。
    let shouterId = null;
    if (marchId && trailId) shouterId = Math.random() < 0.5 ? marchId : trailId;
    else shouterId = marchId || trailId;
    if (shouterId) {
      const times = 12 + Math.floor(Math.random() * 4);
      let sent = 0;
      const tick = () => {
        const p = M.aiPlayer(shouterId);
        if (!M.aiCanChat(p)) return;
        M.aiMagicShout(shouterId);
        if (shouterId === marchId && danId && Math.random() < 0.25) {
          M.scheduleAiChat(180, () => {
            const dan = M.aiPlayer(danId);
            if (M.aiCanChat(dan)) M.showAiChatBubble('...', danId, 'text');
          }, 4);
        }
        sent += 1;
        if (sent < times) M.scheduleAiChat(2000, tick, 4);
      };
      M.scheduleAiChat(2000, tick, 4);
    }

    // 姬子：开局 5 秒后 50% 喊一次。
    if (himekoId) {
      M.scheduleAiChat(5000, () => {
        const p = M.aiPlayer(himekoId);
        if (M.aiCanChat(p) && Math.random() < 0.5) M.aiMagicShout(himekoId);
      }, 4);
    }

    // 瓦尔特 / 星期日：1.5 秒一次 25% 判定；成功者喊 10 次，另一人随后 0.75 秒附和。
    const startChorus = (mainId, echoId) => {
      let sent = 0;
      const shout = () => {
        const main = M.aiPlayer(mainId);
        if (!M.aiCanChat(main)) return;
        M.aiMagicShout(mainId);
        if (echoId) {
          M.scheduleAiChat(750, () => {
            const echo = M.aiPlayer(echoId);
            if (M.aiCanChat(echo)) M.aiMagicShout(echoId);
          }, 4);
        }
        sent += 1;
        if (sent < 10) M.scheduleAiChat(2000, shout, 4);
      };
      shout();
    };
    const both = [weltId, sundayId].filter(Boolean);
    if (both.length === 1) {
      const id = both[0];
      const check = () => {
        const p = M.aiPlayer(id);
        if (!M.aiCanChat(p)) return;
        if (Math.random() < 0.25) {
          startChorus(id, null);
          return;
        }
        M.scheduleAiChat(1500, check, 4);
      };
      M.scheduleAiChat(1500, check, 4);
    } else if (both.length === 2) {
      let turn = Math.random() < 0.5 ? 0 : 1;
      let done = false;
      const check = () => {
        if (done) return;
        let id = both[turn % 2];
        turn += 1;
        let p = M.aiPlayer(id);
        if (!M.aiCanChat(p)) {
          const otherId = both.find(x => x !== id);
          p = M.aiPlayer(otherId);
          id = otherId;
          if (!M.aiCanChat(p)) return;
        }
        if (Math.random() < 0.25) {
          done = true;
          const otherId = both.find(x => x !== id);
          const other = M.aiPlayer(otherId);
          startChorus(id, other && M.aiCanChat(other) ? otherId : null);
          return;
        }
        M.scheduleAiChat(1500, check, 4);
      };
      M.scheduleAiChat(1500, check, 4);
    }
  };

  M.onAiInsight42 = function (state, p, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(p)) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 2) return;
    if (!M.aiChatOnce(`insight42:${state.round}:${seq}`)) return;
    const lines = [
      ['herta1', M.aiVoiceText.herta1],
      ['herta2', M.aiVoiceText.herta2],
      ['herta3', M.aiVoiceText.herta3]
    ];
    lines.forEach(([kind, text], i) => {
      M.scheduleAiChat(i * 1500, () => {
        const cur = M.aiPlayer(p.id);
        if (M.aiCanChat(cur)) M.showAiChatBubble(text, p.id, kind);
      }, 2);
    });
  };

  M.onAiRomanceTrigger = function (state, seq) {
    if (!M.active || !M.state || state !== M.state) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 3) return;
    const candidates = state.players.filter(p => M.aiCanChat(p));
    if (!candidates.length) return;
    if (!M.aiChatOnce(`romance:${state.round}:${seq}`)) return;
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    const img = M.chatImageEmotes.romance;
    M.scheduleAiChat(400, () => {
      const cur = M.aiPlayer(p.id);
      if (M.aiCanChat(cur)) M.showAiChatImageBubble(img.image, p.id, 'romance');
    }, 3);
  };

  M.onAiHuahuoSkillPoints = function (state, p, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(p)) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 5) return;
    if (Math.random() >= 0.5) return;
    if (!M.aiChatOnce(`huahuo:${state.round}:${seq}`)) return;
    M.scheduleAiChat(350, () => {
      const cur = M.aiPlayer(p.id);
      if (M.aiCanChat(cur)) M.showAiChatBubble(M.aiVoiceText.huahuo, p.id, 'huahuo');
    }, 5);
  };

  M.aiLaojingEmote = function (state, p, seq, source) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(p)) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 6) return;
    if (Math.random() >= 1 / 3) return;
    if (!M.aiChatOnce(`laojing:${source}:${state.round}:${seq}`)) return;
    const img = M.chatImageEmotes.laojing;
    M.scheduleAiChat(300, () => {
      const cur = M.aiPlayer(p.id);
      if (M.aiCanChat(cur)) M.showAiChatImageBubble(img.image, p.id, 'laojing');
    }, 6);
  };

  M.onAiLaojingResist = function (state, p, seq) {
    M.aiLaojingEmote(state, p, seq, 'resist');
  };

  M.onAiLaojingAnda = function (state, p, seq) {
    M.aiLaojingEmote(state, p, seq, 'anda');
  };

  M.onAiDotAttach = function (state, source, target, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(source) || !target || source.id === target.id) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 7) return;
    if (Math.random() >= 0.5) return;
    if (!M.aiChatOnce(`dot:${state.round}:${seq}`)) return;
    const img = M.chatImageEmotes.dawnimg;
    M.scheduleAiChat(350, () => {
      const cur = M.aiPlayer(source.id);
      if (M.aiCanChat(cur)) M.showAiChatImageBubble(img.image, source.id, 'dawnimg');
    }, 7);
  };

  M.onAiMoyinHeal = function (state, source, target, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(source)) return;
    if (!state.fieldEffect || state.fieldEffect.id !== 8) return;
    if (Math.random() >= 0.5) return;
    if (!M.aiChatOnce(`moyu:${state.round}:${seq}`)) return;
    M.scheduleAiChat(350, () => {
      const cur = M.aiPlayer(source.id);
      if (M.aiCanChat(cur)) M.showAiChatBubble(M.aiVoiceText.moyu, source.id, 'moyu');
    }, 8);
  };

  M.onAiRescued = function (state, target, rescuer, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(target)) return;
    if (!rescuer || rescuer.id === target.id) return;
    if (Math.random() >= 0.75) return;
    if (!M.aiChatOnce(`rescue:${state.round}:${seq}`)) return;
    M.scheduleAiChat(450, () => {
      const cur = M.aiPlayer(target.id);
      if (M.aiCanChat(cur)) M.aiEmoteTo('coffee', target.id, rescuer.id);
    });
  };

  // 友军判断只能使用该 AI 自己的身份、公开信息与其既有信念，不读取伤害来源的隐藏身份。
  M.aiTrustsAsAlly = function (target, source) {
    if (!target || !source || target.id === source.id) return false;
    try {
      if (target.identity === 'navigator' || target.identity === 'loyalist') {
        // 领航员身份公开；无名客与领航员同属秩序阵营，不涉及读取他人身份。
        if (source.isNavigator) return true;
      }
      if (target.identity === 'traitor') return false;
      if (!SR.ai || typeof SR.ai.publicView !== 'function' || typeof SR.ai.privateView !== 'function' ||
          typeof SR.ai.trustedAlly !== 'function') return false;
      const mind = M.state && M.state.aiMinds && M.state.aiMinds[target.id];
      if (!mind) return false;
      const pub = SR.ai.publicView(M.state, target);
      const my = SR.ai.privateView(M.state, target);
      const sourcePub = pub.players.find(p => p.id === source.id);
      return !!(sourcePub && SR.ai.trustedAlly(pub, my, mind, sourcePub));
    } catch (e) {
      // 聊天判断失败不影响伤害结算。
      return false;
    }
  };

  M.onAiFriendlyFire = function (state, source, target, seq) {
    if (!M.active || !M.state || state !== M.state || !M.aiCanChat(target)) return;
    if (!source || !source.alive || source.id === target.id) return;
    if (!M.aiTrustsAsAlly(target, source)) return;
    if (Math.random() >= 0.25) return;
    if (!M.aiChatOnce(`friendly:${state.round}:${seq}`)) return;
    M.scheduleAiChat(250, () => {
      const cur = M.aiPlayer(target.id);
      if (M.aiCanChat(cur)) M.aiEmoteTo('pillow', target.id, source.id);
    });
  };

  // 玩家向 AI 发送递咖啡/扔枕头后，AI 有 25% 概率在 2 秒后回敬同一表情。
  M.maybeAiEmoteResponse = function (kind, targetId) {
    if (kind !== 'coffee' && kind !== 'pillow') return;
    const target = M.aiPlayer(targetId);
    if (!M.aiCanChat(target)) return;
    if (Math.random() >= 0.25) return;
    M.scheduleAiChat(2000, () => {
      const cur = M.aiPlayer(targetId);
      if (M.aiCanChat(cur) && M.human && M.human.alive) {
        M.aiEmoteTo(kind, targetId, M.human.id);
      }
    });
  };

  // 【记忆是梦的开场白】期间，头像周围持续冒出彩色泡泡；状态解除时随重绘一起消失。
  M.hasMemoryOpening = function (p) {
    return !!(p && Array.isArray(p.statuses) && p.statuses.some(s => s && s.id === 'memory_opening'));
  };

  M.dreamBubbleHtml = function () {
    const bubbles = [
      [4, 7, -0.2, 2.6, -3, 'rgba(255,111,181,.95)'],
      [12, 9, 0.35, 2.9, 2, 'rgba(102,217,255,.95)'],
      [20, 6, -1.1, 2.4, -2, 'rgba(255,209,102,.96)'],
      [26, 7, 0.8, 3.0, 3, 'rgba(179,136,255,.95)'],
      [74, 8, -0.6, 2.5, -1, 'rgba(125,255,176,.95)'],
      [80, 9, 0.15, 2.8, -3, 'rgba(255,159,110,.95)'],
      [88, 6, -1.4, 2.3, 2, 'rgba(143,179,255,.95)'],
      [96, 8, 1.0, 3.1, 3, 'rgba(255,123,220,.95)']
    ].map(([x, size, delay, dur, dx, color]) =>
      `<i style="--bx:${x}%;--bs:${size}px;--bd:${delay}s;--bt:${dur}s;--bdx:${dx}px;--bc:${color}"></i>`
    ).join('');
    return `<span class="dream-bubble-fx" aria-hidden="true">${bubbles}</span>`;
  };

  // 【欢愉诡计】选中两名角色时戴上的假面；两名角色的假面由同一份状态控制，同时出现、同时解除。
  // 图案从官方面具图提取轮廓与五官后矢量清晰化，避免放大后发糊。
  const ELATION_MASK_ART = 'assets/cards/elation_mask.svg?v=20261031z8';
  M.elationMaskHtml = function () {
    return `<span class="elation-mask-fx" aria-hidden="true">
      <img class="elation-mask-img" src="${ELATION_MASK_ART}" alt="" draggable="false">
    </span>`;
  };
  M.preloadElationMask = function () {
    if (M._elationMaskPreload) return;
    M._elationMaskPreload = new Image();
    M._elationMaskPreload.src = ELATION_MASK_ART;
  };

  // 【黑塔】解读：头像上的竖向菱形计数，颜色随 0→42 由浅蓝渐变到深紫。
  M.insightValue = function (p) {
    const s = (p && p.statuses || []).find(x => x && x.id === 'interpretation');
    return s && s.value != null ? Math.max(0, Math.floor(Number(s.value) || 0)) : null;
  };

  M.insightDiamondHtml = function (value) {
    const v = Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));
    const t = Math.min(1, v / 42);
    const h1 = 200 + 82 * t;
    const h2 = 214 + 73 * t;
    const l1 = 72 - 26 * t;
    const l2 = 54 - 24 * t;
    const sat = 86 + 6 * t;
    return `<span class="insight-badge" style="--ia:hsl(${h1.toFixed(1)}, ${sat.toFixed(1)}%, ${l1.toFixed(1)}%);--ib:hsl(${h2.toFixed(1)}, ${sat.toFixed(1)}%, ${l2.toFixed(1)}%);--ig:hsl(${h2.toFixed(1)}, ${sat.toFixed(1)}%, 62%)" aria-label="解读 ${v}">
      <span class="insight-diamond"></span><b>${v}</b>
    </span>`;
  };

  M.insightShatterHtml = function () {
    const shards = [
      [-19, -20, -130, .00, '#e6f8ff'], [16, -22, 115, .02, '#bfeaff'],
      [-24, -8, -95, .04, '#d8f3ff'], [23, -9, 85, .01, '#b8d8ff'],
      [-18, 10, -150, .06, '#c9d9ff'], [18, 9, 145, .03, '#b9c6ff'],
      [-8, -25, -75, .05, '#f2fbff'], [7, 24, 70, .07, '#cbb8ff'],
      [-27, 22, -110, .08, '#dfefff'], [27, 21, 120, .09, '#d7c8ff'],
      [0, -29, -20, .02, '#ffffff'], [-2, 28, 20, .06, '#c3b0ff']
    ].map(([sx, sy, sr, sd, sc]) =>
      `<i style="--sx:${sx}px;--sy:${sy}px;--sr:${sr}deg;--sd:${sd}s;--sc:${sc}"></i>`
    ).join('');
    return `<span class="insight-shatter-fx" aria-hidden="true">${shards}</span>`;
  };

  M.showInsightShatter = function (player) {
    M.showStatusFx(player, 'insight-shatter', 720);
  };

  // 100% 效果抵抗：在受影响角色头像上短暂显示“效果抵抗”，渐入后淡出。
  M.showEffectResist = function (player) {
    M.showStatusFx(player, 'effect-resist', 1150);
  };

  // dot 伤害结算：头像短暂出现紫色触电特效。
  M.showDotShock = function (player) {
    M.showStatusFx(player, 'dot-shock', 950);
  };

  // 战技点抽奖结果：玩家在按键旁、AI 在状态栏短暂显示结果文字。
  M.skillPointFxHtml = function (fx, place) {
    const text = fx && fx.kind === 'draw' ? '花花火火' : '恍恍惚惚';
    const kind = fx && fx.kind === 'draw' ? 'draw' : 'discard';
    return `<span class="skill-point-fx ${kind} ${place || ''}" aria-hidden="true">${text}</span>`;
  };

  M.clearSkillPointFx = function () {
    if (M.skillPointFxTimer) clearTimeout(M.skillPointFxTimer);
    M.skillPointFxTimer = null;
    M.skillPointFx = null;
  };

  M.showSkillPointFx = function (state, player, drew) {
    if (!M.active || !state || state !== M.state || !player || !player.id) return;
    if (M.suppressCombatFx) return;
    const kind = drew ? 'draw' : 'discard';
    const key = [state.round, player.id, player.turnSerial, state.log.length, kind].join('|');
    if (M.skillPointFx && M.skillPointFx.key === key) return;
    M.skillPointFx = { playerId: player.id, isHuman: !!player.isHuman, kind, key };
    if (M.skillPointFxTimer) clearTimeout(M.skillPointFxTimer);
    M.skillPointFxTimer = setTimeout(() => {
      M.skillPointFxTimer = null;
      M.skillPointFx = null;
      if (M.state) M.render();
    }, 760);
    M.render();
  };

  // 战技点音效时长取自本地音频；无法读取时按 1 秒兜底，并留 60ms 余量。
  M.skillPointSfxDurationMs = function () {
    const a = M.skillPointSfxAudio;
    const d = a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 1;
    return Math.ceil(d * 1000) + 60;
  };

  // 每次实际消耗战技点播放一次；用回合/角色/行动序号/日志长度去重，避免回滚重放重复发声。
  M.playSkillPointSfx = function (state, player) {
    if (!M.active || !state || state !== M.state || !player || !player.id) return;
    if (!M.skillPointSfxAudio) return;
    const key = [state.round, player.id, player.turnSerial, state.log.length, 'skill-point-sfx'].join('|');
    if (M.skillPointSfxSeen.has(key)) return;
    M.skillPointSfxSeen.add(key);
    // 导入音效保持原本的 0.9 音量。
    M.playVoiceElement(M.skillPointSfxAudio);
  };

  M.skillPointReady = function () {
    return !M.skillPointPlayerReadyAt || Date.now() >= M.skillPointPlayerReadyAt;
  };

  M.startSkillPointCooldown = function () {
    const ms = M.skillPointSfxDurationMs();
    M.skillPointPlayerReadyAt = Date.now() + ms;
    if (M.skillPointCooldownTimer) clearTimeout(M.skillPointCooldownTimer);
    M.skillPointCooldownTimer = setTimeout(() => {
      M.skillPointCooldownTimer = null;
      M.skillPointPlayerReadyAt = 0;
      if (M.state) M.render();
    }, ms + 20);
  };

  M.stopSkillPointSfx = function () {
    const a = M.skillPointSfxAudio;
    if (!a) return;
    try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
  };

  // 解读 = 42：菱形变为魔杖，并在头像周围短暂赐福。参考图未随消息传入，先使用内置星杖造型。
  M.insightWandHtml = function () {
    return `<span class="insight-wand-fx" aria-hidden="true">
      <span class="insight-blessing-fx"><i></i><i></i><i></i><i></i></span>
      <svg class="insight-wand" viewBox="0 0 44 52" focusable="false">
        <g transform="rotate(26 22 27)">
          <rect x="19.2" y="21" width="5.6" height="26" rx="2.8" fill="#281337" stroke="#ffd777" stroke-width="1.6"/>
          <path d="M20 25 C26 27 18 31 24 34 C28 36 18 39 22 42" fill="none" stroke="#f3c45f" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M22 3 L24.8 9.4 L31.8 10.3 L26.6 15.2 L28.1 22.1 L22 18.7 L15.9 22.1 L17.4 15.2 L12.2 10.3 L19.2 9.4 Z" fill="#ffdc78" stroke="#fff6d4" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="22" cy="12.4" r="2.2" fill="#fff8df"/>
        </g>
        <path d="M8 15 L9.6 18.2 L13 18.6 L10.5 20.8 L11.2 24.2 L8 22.5 L4.8 24.2 L5.5 20.8 L3 18.6 L6.4 18.2 Z" fill="#fff1bd" opacity=".95"/>
        <path d="M34 38 L35.2 41 L38.4 41.4 L36.1 43.5 L36.7 46.6 L34 45 L31.3 46.6 L31.9 43.5 L29.6 41.4 L32.8 41 Z" fill="#ffe28d" opacity=".9"/>
      </svg>
    </span>`;
  };

  // 体力显示：心形个数=上限，红色=当前体力，灰色=已损失体力。
  M.hpHearts = function (hp, maxHp, extraClass) {
    const max = Math.max(0, Math.floor(Number(maxHp) || 0));
    const raw = Number.isFinite(Number(hp)) ? Math.floor(Number(hp)) : 0;
    // 灰心数量只按体力上限绘制，不为负数追加心；回复后按当前体力重新点亮。
    const filled = Math.max(0, Math.min(max, raw));
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<span class="hp-heart${i < filled ? ' on' : ' lost'}">♥</span>`;
    }
    return `<span class="hp-hearts ${extraClass || ''}" title="体力 ${raw}/${max}" aria-label="体力 ${raw}/${max}">${html}<span class="hp-value${raw < 0 ? ' negative' : ''}">${raw}/${max}</span></span>`;
  };

  M.handCard = function (player, name) {
    return (player && player.hand || []).find(c => c.name === name) || null;
  };

  M.equipCard = function (player, slot) {
    return player && player.equipment && player.equipment[slot] || null;
  };

  function findCardByUid(uid) {
    if (!uid || !M.state) return null;
    for (const p of M.state.players) {
      for (const c of (p.hand || [])) if (c.uid === uid) return c;
      for (const c of (p.judge || [])) if (c.uid === uid) return c;
      for (const slot of ['weapon', 'armor', 'vehicle']) {
        if (p.equipment[slot] && p.equipment[slot].uid === uid) return p.equipment[slot];
      }
    }
    for (const c of (M.state.discard || [])) if (c.uid === uid) return c;
    return null;
  }

  function findStatus(id) {
    return (SR.data.statuses || []).find(s => s.id === id) || null;
  }

  function showScreen(name) {
    const screens = ['disclaimer', 'start', 'select', 'info', 'settings', 'records', 'game', 'result'];
    for (const s of screens) {
      const el = $('screen-' + s);
      if (el) el.hidden = s !== name;
    }
    if (name !== 'start' && name !== 'disclaimer') M.lastScreen = name;
    window.scrollTo(0, 0);
  }

  M.openModal = function (title, bodyHtml, actions, onClose) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml || '';
    const box = $('modalActions');
    box.innerHTML = '';
    (actions || [{ label: '知道了', action: M.closeModal }]).forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.addEventListener('click', () => { if (a.action) a.action(); });
      box.appendChild(b);
    });
    M.modalCloseHandler = typeof onClose === 'function' ? onClose : null;
    $('modalClose').hidden = !M.modalCloseHandler;
    // 全界面统一暖色，包括对局中的身份、卡牌、状态与角色详情弹窗。
    $('modalRoot').classList.add('warm-modal');
    $('modalRoot').hidden = false;
  };

  M.closeModal = function () {
    $('modalRoot').hidden = true;
    $('modalRoot').classList.remove('warm-modal');
    $('modalTitle').textContent = '';
    $('modalBody').innerHTML = '';
    $('modalActions').innerHTML = '';
    $('modalClose').hidden = true;
    M.modalCloseHandler = null;
  };

  M.clearPause = function () {
    if (M.pauseTimer) clearTimeout(M.pauseTimer);
    M.pauseTimer = null;
    M.pauseReveal = null;
    const fieldReveal = $('fieldReveal');
    if (fieldReveal) fieldReveal.hidden = true;
    const romanceFx = document.getElementById('romanceFxLayer');
    if (romanceFx) romanceFx.remove();
  };

  // 页面内选择框：返回 Promise，不使用 window.prompt/confirm。
  // 对局中的选择优先内联在玩家状态栏；有对应牌时，按钮显示在该牌下方。
  M.askInPage = function (request) {
    return new Promise(resolve => {
      const req = request || {};
      if (req.type === 'pause') {
        M.closeModal();
        // 爱上雷神的音乐与场地效果公示同时开始；此时 state.fieldEffect 已由引擎写入。
        if ((req.kind || '') === 'field' && Number(req.eventId) === 9) {
          M.startLeishenMusic(M.state);
        }
        M.pauseReveal = {
          kind: req.kind || 'play',
          playerId: req.playerId || null,
          cardUid: req.cardUid || null,
          reason: req.reason || '',
          text: req.text || '',
          silent: !!req.silent,
          card: req.card ? Object.assign({}, req.card) : null
        };
        M.render();
        // 伤害数字固定在座位节点内；本次 render 会重建座位，因此渲染后再刷新待展示伤害。
        if ((req.kind || '') === 'damage') M.flushCombatFx();
        if (M.pauseTimer) clearTimeout(M.pauseTimer);
        M.pauseTimer = setTimeout(() => {
          M.pauseTimer = null;
          M.pauseReveal = null;
          M.render();
          resolve(true);
        }, Math.max(0, Number(req.duration) || 2250));
        return;
      }
      const canInline = !!(M.human && M.state && $('humanPanel') && !M.spectating);
      let options = [];
      if (req.type === 'yesno') {
        options = [
          { label: req.yesLabel || '是', value: true, primary: true },
          { label: req.noLabel || '否', value: false }
        ];
      } else if (req.options && req.options.length) {
        options = req.options.slice();
        if (req.cancelable) options.push({ label: '取消', value: null, cancel: true });
      }
      if (!options.length) {
        resolve(null);
        return;
      }
      if (canInline) {
        M.closeModal();
        M.inlineChoice = {
          kind: req.inline === 'memoryPool' ? 'memoryPool' : (req.type === 'yesno' ? 'yesno' : 'options'),
          cardUid: req.cardUid || null,
          anchor: req.anchor || (req.cardUid ? 'equipment' : 'status'),
          playerId: req.playerId || M.human.id,
          title: req.title || '请选择',
          body: req.body || '',
          yesLabel: req.yesLabel || '是',
          noLabel: req.noLabel || '否',
          options,
          cancelable: !!req.cancelable,
          // 目标技能/效果可同时把目标座位标记为可点击；选项本身仍保留。
          seatTargets: Array.isArray(req.seatTargets) ? req.seatTargets.slice() : null,
          resolve
        };
        M.render();
        M.positionInlineChoice();
        return;
      }
      // 非对局状态才回退到弹窗（开局、说明、错误等）。
      const actions = options.map(o => ({
        label: o.label,
        primary: !!o.primary,
        action: () => { M.closeModal(); resolve(o.value); }
      }));
      const onClose = req.cancelable ? () => { M.closeModal(); resolve(null); } : null;
      M.openModal(req.title || '请选择', req.body || '', actions, onClose);
    });
  };

  M.restoreSnapshot = function (snap) {
    M.state = SR.sim.restore(snap);
    M.human = M.state.players.find(p => p.isHuman) || M.state.players[0];
    if (M.current) M.current = G.getPlayer(M.state, M.current.id);
    // 旧状态里的卡牌对象已经失效；目标/选牌由 uid 重新解析。
    M.pending = null;
  };

  M.requestAnswer = function (request, fallback) {
    if (!M.choiceCollector) return fallback();
    const index = M.choiceCursor++;
    if (index < M.choiceAnswers.length) return M.choiceAnswers[index];
    throw new NeedChoice(Object.assign({}, request, { index }));
  };

  // 引擎公示/判定后的 2.25 秒等待；只在当前手动对局内生效。
  M.requestPause = function (state, request) {
    if (!M.active || !M.state || state !== M.state || !M.choiceCollector) return;
    return M.requestAnswer(Object.assign({ type: 'pause', duration: 2250 }, request || {}), null);
  };

  // 执行可能触发玩家选择的同步引擎动作：依次询问、回滚、重放。
  M.runWithChoices = async function (fn) {
    if (!M.state || M.choiceRunning) return fn();
    const snapshot = SR.sim.snapshot(M.state);
    const answers = [];
    M.choiceRunning = true;
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        M.choiceAnswers = answers;
        M.choiceCursor = 0;
        M.choiceCollector = true;
        try {
          const result = fn();
          M.choiceCollector = false;
          return result;
        } catch (e) {
          M.choiceCollector = false;
          if (!e || e.code !== 'HUMAN_CHOICE') throw e;
          const answer = await M.askInPage(e.request);
          answers.push(answer);
          M.restoreSnapshot(snapshot);
        }
      }
      throw new Error('玩家选择重放次数过多');
    } finally {
      M.choiceCollector = false;
      M.choiceRunning = false;
      M.choiceAnswers = null;
    }
  };

  M.toast = function (text, ms) {
    const el = $('gameMessage');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(M._toastTimer);
    M._toastTimer = setTimeout(() => { el.hidden = true; }, ms || 1050);
  };

  M.showTurnBanner = function (p) {
    const el = $('turnBanner');
    if (!el || !p) return;
    el.textContent = `轮到 ${M.seatDisplayName(p)} 行动`;
    el.hidden = false;
    clearTimeout(M.turnBannerTimer);
    M.turnBannerTimer = setTimeout(() => {
      M.turnBannerTimer = null;
      el.hidden = true;
    }, 1450);
  };

  M.clearTurnBanner = function () {
    if (M.turnBannerTimer) clearTimeout(M.turnBannerTimer);
    M.turnBannerTimer = null;
    const el = $('turnBanner');
    if (el) { el.hidden = true; el.textContent = ''; }
  };

  M.clearTimer = function () {
    if (M.timer) clearTimeout(M.timer);
    M.timer = null;
  };

  M.showEndHold = function (text) {
    M.endHold = true;
    M.endHoldMessage = text || '对局结算中，请稍候…';
    const overlay = $('endHold');
    const label = $('endHoldText');
    if (label) label.textContent = M.endHoldMessage;
    if (overlay) overlay.hidden = false;
    M.render();
  };

  // 永劫轮回：轮末普通提示（黄）与特殊胜利提示（深红）共用全屏覆盖层。
  M.syncEvernightNotice = function () {
    const overlay = $('evernightNotice');
    const label = $('evernightNoticeText');
    if (!overlay || !label) return;
    const normal = !!(M.pauseReveal && M.pauseReveal.kind === 'evernight-rebirth');
    const special = !!M.evernightSpecialActive;
    if (!normal && !special) {
      overlay.hidden = true;
      overlay.classList.remove('normal', 'special');
      label.textContent = '';
      return;
    }
    overlay.hidden = false;
    overlay.classList.toggle('special', special);
    overlay.classList.toggle('normal', !special);
    label.textContent = special
      ? '众人将与一人离别，惟其人将觐见奇迹'
      : '再创世正常到来';
  };

  M.showEvernightSpecial = function () {
    M.evernightSpecialActive = true;
    M.endHold = true;
    M.render();
  };

  M.hideEvernightNotice = function () {
    M.evernightSpecialActive = false;
    const overlay = $('evernightNotice');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('normal', 'special');
    }
    const label = $('evernightNoticeText');
    if (label) label.textContent = '';
  };

  M.hideEndHold = function (render) {
    M.endHold = false;
    const overlay = $('endHold');
    if (overlay) overlay.hidden = true;
    if (render !== false) M.render();
  };

  M.clearEndHold = function () {
    if (M.endHoldTimer) clearTimeout(M.endHoldTimer);
    M.endHoldTimer = null;
    M.finishPending = false;
    M.hideEvernightNotice();
    M.hideEndHold(false);
  };

  M.wait = function (fn, ms) {
    M.clearTimer();
    M.timer = setTimeout(fn, ms == null ? 450 : ms);
  };

  // AI 每个动作之间留约 2.25–2.95 秒；出牌/响应/判定另有 2.25 秒公示暂停。
  function aiDelay() {
    return 2250 + Math.floor(Math.random() * 700);
  }

  // ---------- 战斗视觉特效 ----------
  // 只记录“真实发生”的扣体力/终末裁决，不参与规则结算。
  M.fxSeen = new Set();
  M.fxQueue = [];
  M.fxTimer = null;
  M.shieldGainQueue = [];
  M.shieldGainTimer = null;
  M.suppressCombatFx = false;
  M.statusFx = {};
  M.statusFxTimers = {};
  // 阿哈抽奖的老虎机：同一名玩家同一次抽奖在引擎重放时保持已有动画状态。
  M.ahaSlot = null;
  M.ahaSlotTicker = null;
  M.ahaSlotSettleTimer = null;
  M.ahaSlotFinished = new Set();
  M.ahaSlotSpinNodes = null;

  M.clearStatusFx = function () {
    M.clearSkillPointFx();
    for (const id of Object.keys(M.statusFxTimers || {})) {
      clearTimeout(M.statusFxTimers[id]);
    }
    M.statusFxTimers = {};
    M.statusFx = {};
    document.querySelectorAll('.gravity-field-fx, .holy-light-fx, .preservation-shield-fx, .medicine-vine-fx').forEach(el => el.remove());
    document.querySelectorAll('.seat.gravity-suppressed, .seat.holy-blessed, .seat.preservation-shielded, .seat.medicine-healing, .seat.moyin-healing').forEach(el => {
      el.classList.remove('gravity-suppressed', 'holy-blessed', 'preservation-shielded', 'medicine-healing', 'moyin-healing');
    });
    document.querySelectorAll('.himeko-laser-layer, .danheng-spear-layer').forEach(el => el.remove());
  };

  // 状态施加的短特效；只影响座位展示，不改变游戏流程。
  M.showStatusFx = function (player, kind, duration) {
    if (!player || !player.id || !M.active || !M.state || !M.state.players.includes(player)) return;
    const id = player.id;
    M.statusFx[id] = { kind };
    if (M.statusFxTimers[id]) clearTimeout(M.statusFxTimers[id]);
    M.statusFxTimers[id] = setTimeout(() => {
      delete M.statusFxTimers[id];
      delete M.statusFx[id];
      if (M.state) M.render();
    }, Math.max(200, Number(duration) || 1200));
    if (M.state) M.render();
  };

  // 引力坍缩施加后短暂显示“力场压制”效果。
  M.showGravityFx = function (player) {
    M.showStatusFx(player, 'gravity', 1200);
  };

  // 星期日触发【乐园之门】时短暂显示圣光。
  // 手动选择的回滚重放会重复执行同一段恢复结算，用“对局种子 + 轮次 + 角色”去重，
  // 保证每轮第一次因恢复摸牌只播放一次；新一轮或新对局再重新允许。
  M._holyFxRoundKey = null;
  M.showHolyFx = function (player, state) {
    const s = state || M.state;
    const key = s ? `${s.seed == null ? '' : s.seed}|${s.round == null ? '' : s.round}|${player && player.id ? player.id : ''}` : '';
    if (key && M._holyFxRoundKey === key) return;
    if (key) M._holyFxRoundKey = key;
    M.showStatusFx(player, 'holy', 1250);
  };

  // 存护命途减伤时，状态框浮现护盾后消散。
  M.showPreservationShield = function (state, player) {
    M.showStatusFx(player, 'preservation', 950);
  };

  // 【药王慈怀】治疗时，受治疗者状态框生长藤蔓与银杏叶。
  M.showMedicineFx = function (player) {
    M.showStatusFx(player, 'medicine', 1750);
  };

  // 【我有魔芋爽】轮末伤害：所有存活者状态框同时生长更茂密的藤蔓与银杏叶。
  // 用暂停点承载整段展示，避免特效延续到下一轮；模拟对局中 G.pause 不生效。
  M.showMoyinFx = function (state) {
    if (!M.active || !M.state || state !== M.state) return;
    G.pause(state, {
      kind: 'moyin',
      duration: 2200,
      reason: '魔芋爽',
      text: '【魔芋爽】轮末：所有存活玩家受到 1 点无来源、不可防止伤害。'
    });
  };

  // ===== 阿哈真没面子：头像上的三格老虎机 =====
  const AHA_SUITS = ['方块', '黑桃', '梅花', '红桃'];
  const AHA_SUIT_META = {
    '方块': { glyph: '♦︎', color: 'red' },
    '红桃': { glyph: '♥︎', color: 'red' },
    '黑桃': { glyph: '♠︎', color: 'black' },
    '梅花': { glyph: '♣︎', color: 'black' }
  };
  const randomAhaSuit = () => AHA_SUITS[Math.floor(Math.random() * AHA_SUITS.length)];

  // 老虎机停止后显示本次抽奖的简明效果；详细的前后数值仍由中央公示展示。
  M.ahaSlotEffectText = function (draw) {
    if (!Array.isArray(draw) || draw.length !== 3) return '';
    const counts = {};
    for (const s of draw) counts[s] = (counts[s] || 0) + 1;
    const triple = Object.keys(counts).find(k => counts[k] === 3);
    if (triple) {
      return {
        '方块': '手牌上限+1',
        '黑桃': '体力上限-1',
        '梅花': '手牌上限-1',
        '红桃': '体力上限+1'
      }[triple] || '';
    }
    const hpNet = (counts['红桃'] || 0) - (counts['黑桃'] || 0);
    const handNet = (counts['方块'] || 0) - (counts['梅花'] || 0);
    const parts = [];
    if (hpNet) parts.push(`体力${hpNet > 0 ? '+' : ''}${hpNet}`);
    if (handNet) parts.push(`手牌${handNet > 0 ? '+' : ''}${handNet}`);
    return parts.length ? parts.join(' ') : '无净变化';
  };

  M.ahaSlotHtml = function (slot) {
    const cells = [0, 1, 2].map(() => '<span class="aha-reel"><i class="aha-reel-symbol">?</i></span>').join('');
    const showEffect = !!(slot.settled && slot.effect);
    // 三同花色的“大奖！”在效果公示结束后弹出，避免被中央公示条遮住。
    let jackpot = '';
    if (slot.jackpotShown) {
      jackpot = `<span class="aha-jackpot${slot.jackpotAnimated ? ' shown' : ''}" aria-hidden="true"><b>大奖！</b></span>`;
      slot.jackpotAnimated = true;
    }
    return `<span class="aha-slot ${slot.settled ? 'settled' : 'spinning'}" data-aha-pid="${esc(slot.playerId)}" aria-hidden="true">
      <span class="aha-slot-label${showEffect ? ' effect' : ''}">${esc(showEffect ? slot.effect : '找点乐子')}</span>
      <span class="aha-reels">${cells}</span>
      ${jackpot}
    </span>`;
  };

  M.stopAhaSlotTicker = function () {
    if (M.ahaSlotTicker) clearInterval(M.ahaSlotTicker);
    M.ahaSlotTicker = null;
    if (M.ahaSlotSettleTimer) clearTimeout(M.ahaSlotSettleTimer);
    M.ahaSlotSettleTimer = null;
    if (typeof M.stopAhaSlotSpin === 'function') M.stopAhaSlotSpin();
  };

  M.clearAhaSlot = function () {
    M.stopAhaSlotTicker();
    M.ahaSlot = null;
  };

  M.syncAhaSlotDom = function () {
    const slot = M.ahaSlot;
    if (!slot || !M.state) return;
    const seat = document.querySelector(`.seat[data-seat-pid="${cssEscape(slot.playerId)}"]`);
    const panel = seat && seat.querySelector('.aha-slot');
    if (!panel) return;
    panel.classList.toggle('spinning', !slot.settled);
    panel.classList.toggle('settled', !!slot.settled);
    const reels = panel.querySelectorAll('.aha-reel-symbol');
    for (let i = 0; i < reels.length; i++) {
      const name = slot.settled ? slot.draw[i] : slot.display[i];
      const meta = AHA_SUIT_META[name] || AHA_SUIT_META['方块'];
      reels[i].textContent = meta.glyph;
      reels[i].className = 'aha-reel-symbol ' + meta.color;
    }
    const label = panel.querySelector('.aha-slot-label');
    if (label) {
      const showEffect = !!(slot.settled && slot.effect);
      label.textContent = showEffect ? slot.effect : '找点乐子';
      label.classList.toggle('effect', showEffect);
    }
    const showJackpot = !!slot.jackpotShown;
    let jackpot = panel.querySelector('.aha-jackpot');
    if (showJackpot) {
      if (!jackpot) {
        jackpot = document.createElement('span');
        jackpot.className = 'aha-jackpot';
        jackpot.setAttribute('aria-hidden', 'true');
        jackpot.innerHTML = '<b>大奖！</b>';
        panel.appendChild(jackpot);
        slot.jackpotAnimated = true;
      }
    } else if (jackpot) {
      jackpot.remove();
    }
  };

  M.settleAhaSlot = function () {
    const slot = M.ahaSlot;
    if (!slot || slot.settled) return;
    slot.settled = true;
    slot.display = slot.draw.slice();
    slot.effect = M.ahaSlotEffectText(slot.draw);
    M.stopAhaSlotTicker();
    // 轮盘停下时给一声清脆的“叮”；三同花色的“大奖！”在效果公示结束后再弹出。
    M.playAhaSlotDing();
    M.syncAhaSlotDom();
  };

  M.showAhaSlot = function (state, player, draw) {
    if (!M.active || !M.state || state !== M.state || !player || !Array.isArray(draw) || draw.length !== 3) return;
    const token = `aha:${state.round}:${player.id}:${draw.join('')}`;
    if (M.ahaSlotFinished.has(token)) return;
    if (M.ahaSlot && M.ahaSlot.token === token) return;
    M.clearAhaSlot();
    M.ahaSlot = {
      token,
      playerId: player.id,
      draw: draw.slice(),
      display: [randomAhaSuit(), randomAhaSuit(), randomAhaSuit()],
      settled: false,
      jackpot: draw[0] === draw[1] && draw[1] === draw[2],
      jackpotShown: false,
      jackpotAnimated: false
    };
    M.render();
    // 轮盘转动声与滚动画面同步；结算时由 settleAhaSlot 播放“叮”。
    M.playAhaSlotSpin(2000);
    M.playAhaSlotTick();
    M.ahaSlotTicker = setInterval(() => {
      const slot = M.ahaSlot;
      if (!slot || slot.settled) return;
      slot.display = [randomAhaSuit(), randomAhaSuit(), randomAhaSuit()];
      M.playAhaSlotTick();
      M.syncAhaSlotDom();
    }, 85);
    M.ahaSlotSettleTimer = setTimeout(M.settleAhaSlot, 2000);
  };

  M.hideAhaSlot = function (playerId) {
    const slot = M.ahaSlot;
    if (!slot) return;
    if (playerId && slot.playerId !== playerId) return;
    M.ahaSlotFinished.add(slot.token);
    M.clearAhaSlot();
    M.render();
  };

  // 三同花色：效果公示结束后再弹出“大奖！”，避免被中央公示条遮挡；
  // 文本留在老虎机内，hideAhaSlot 移除老虎机时一起消失。
  M.showAhaJackpot = function (state, player) {
    const slot = M.ahaSlot;
    if (!M.active || !M.state || state !== M.state || !slot) return false;
    if (!slot.settled || !slot.jackpot || slot.jackpotShown) return false;
    if (player && slot.playerId !== player.id) return false;
    slot.jackpotShown = true;
    M.syncAhaSlotDom();
    return true;
  };

  // 姬子【拓星启行】：从姬子头像向目标头像发射一束短促激光炮。
  // 选择手牌/目标后的回滚重放会重复进入技能结算，用种子+轮次+行动序号+目标去重。
  M._himekoLaserKey = null;
  M.showHimekoLaser = function (state, source, target) {
    if (M.suppressCombatFx || !M.active || !state || state !== M.state || !source || !target) return;
    const key = `${state.seed == null ? '' : state.seed}|${state.round == null ? '' : state.round}|${source.turnSerial == null ? '' : source.turnSerial}|${source.id}|${target.id}`;
    if (M._himekoLaserKey === key) return;
    M._himekoLaserKey = key;
    const sourceAvatar = document.querySelector(`.seat[data-seat-pid="${cssEscape(source.id)}"] .seat-avatar`);
    const targetAvatar = document.querySelector(`.seat[data-seat-pid="${cssEscape(target.id)}"] .seat-avatar`);
    if (!sourceAvatar || !targetAvatar) return;
    const a = sourceAvatar.getBoundingClientRect();
    const b = targetAvatar.getBoundingClientRect();
    const x1 = a.left + a.width / 2;
    const y1 = a.top + a.height / 2;
    const x2 = b.left + b.width / 2;
    const y2 = b.top + b.height / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 8) return;

    document.querySelectorAll('.himeko-laser-layer').forEach(el => el.remove());
    const layer = document.createElement('div');
    layer.className = 'himeko-laser-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<span class="himeko-laser-beam"><span class="himeko-laser-shell"></span></span>
      <span class="himeko-laser-muzzle"></span>
      <span class="himeko-laser-impact"></span>`;
    const beam = layer.querySelector('.himeko-laser-beam');
    const muzzle = layer.querySelector('.himeko-laser-muzzle');
    const impact = layer.querySelector('.himeko-laser-impact');
    beam.style.left = `${x1}px`;
    beam.style.top = `${y1 - 3}px`;
    beam.style.width = `${length}px`;
    beam.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    muzzle.style.left = `${x1}px`;
    muzzle.style.top = `${y1}px`;
    impact.style.left = `${x2}px`;
    impact.style.top = `${y2}px`;
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 900);
  };

  // 丹恒【云骑枪术】弃牌时：使用【击云】同款长枪贯穿目标头像。
  const DANHENG_SPEAR_ART = 'assets/cards/danheng_spear.png?v=20261031z8';
  M.preloadDanhengSpear = function () {
    if (M._danhengSpearPreload) return;
    M._danhengSpearPreload = new Image();
    M._danhengSpearPreload.src = DANHENG_SPEAR_ART;
  };

  M.showDanhengSpear = function (state, source, target) {
    if (M.suppressCombatFx || !M.active || !state || state !== M.state || !target) return;
    const targetAvatar = document.querySelector(`.seat[data-seat-pid="${cssEscape(target.id)}"] .seat-avatar`);
    if (!targetAvatar) return;
    const sourceAvatar = source
      ? document.querySelector(`.seat[data-seat-pid="${cssEscape(source.id)}"] .seat-avatar`)
      : null;
    const t = targetAvatar.getBoundingClientRect();
    const s = sourceAvatar ? sourceAvatar.getBoundingClientRect() : null;
    const tx = t.left + t.width / 2;
    const ty = t.top + t.height / 2;
    const sx = s ? s.left + s.width / 2 : tx - 80;
    const sy = s ? s.top + s.height / 2 : ty - 50;
    const angle = Math.atan2(ty - sy, tx - sx);
    document.querySelectorAll('.danheng-spear-layer').forEach(el => el.remove());
    const layer = document.createElement('div');
    layer.className = 'danheng-spear-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<span class="danheng-spear-fx" style="left:${tx}px;top:${ty}px;--spear-angle:${angle}rad">
      <img class="danheng-spear-img" src="${DANHENG_SPEAR_ART}" alt="" draggable="false">
      <i class="danheng-spear-impact"></i>
    </span>`;
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 850);
  };

  M.clearCombatFx = function () {
    M.clearStatusFx();
    if (M.fxTimer) clearTimeout(M.fxTimer);
    M.fxTimer = null;
    M.fxQueue = [];
    M.fxSeen.clear();
    if (M.shieldGainTimer) clearTimeout(M.shieldGainTimer);
    M.shieldGainTimer = null;
    M.shieldGainQueue = [];
    document.querySelectorAll('.combat-flash').forEach(el => el.remove());
    document.querySelectorAll('.damage-number, .lightning-fx, .shield-gain-float').forEach(el => el.remove());
  };

  M.pushCombatFx = function (pid, amount, key, lightning) {
    if (!pid || !key || M.fxSeen.has(key)) return;
    M.fxSeen.add(key);
    // 防止极长对局无限积累去重键。
    if (M.fxSeen.size > 800) M.fxSeen.clear();
    M.fxQueue.push({ pid, amount: Math.max(0, Math.floor(Number(amount) || 0)), lightning: !!lightning });
    if (!M.fxTimer) {
      M.fxTimer = setTimeout(() => {
        M.fxTimer = null;
        M.flushCombatFx();
      }, 30);
    }
  };

  // 每新增/削减一层护盾，在角色状态行上方各飘一次“护盾+1”/“护盾-1”。
  M.queueShieldChangeFx = function (pid, count, delta) {
    const n = Math.max(1, Math.floor(Number(count) || 1));
    if (!pid) return;
    M.shieldGainQueue.push({ pid, count: n, delta: Number(delta) < 0 ? -1 : 1 });
    if (!M.shieldGainTimer) {
      M.shieldGainTimer = setTimeout(() => {
        M.shieldGainTimer = null;
        M.flushShieldGainFx();
      }, 30);
    }
  };

  M.queueShieldGainFx = function (pid, count) {
    M.queueShieldChangeFx(pid, count, 1);
  };

  M.queueShieldLossFx = function (pid, count) {
    M.queueShieldChangeFx(pid, count, -1);
  };

  M.flushShieldGainFx = function () {
    const queue = M.shieldGainQueue.splice(0);
    if (!queue.length || !M.state) return;
    let index = 0;
    for (const item of queue) {
      const seat = document.querySelector(`.seat[data-seat-pid="${cssEscape(item.pid)}"]`);
      let anchor = seat ? (seat.querySelector('.seat-status-line') || seat.querySelector('.seat-line') || seat) : null;
      if (!anchor) {
        // 玩家头像不在座位层时，飘字仍然显示在其头像区域。
        anchor = document.querySelector('.human-head') || M.chatAvatarEl(item.pid);
      }
      if (!anchor) continue;
      const r = anchor.getBoundingClientRect();
      for (let i = 0; i < item.count; i++) {
        const el = document.createElement('span');
        el.className = 'shield-gain-float';
        el.textContent = item.delta < 0 ? '护盾-1' : '护盾+1';
        el.style.left = `${r.left + r.width / 2}px`;
        el.style.top = `${r.top + r.height - 2}px`;
        el.style.animationDelay = `${(i + index) * 70}ms`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900 + (i + index) * 70);
      }
      index += item.count;
    }
  };

  M.flashCombat = function (kind) {
    const screen = $('screen-game');
    if (!screen) return;
    const flash = document.createElement('div');
    flash.className = `combat-flash ${kind || 'electric'}`;
    flash.setAttribute('aria-hidden', 'true');
    screen.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  };

  M.flushCombatFx = function () {
    const queue = M.fxQueue.splice(0);
    if (!queue.length || !M.state) return;
    let damageCount = 0;
    let lightningCount = 0;
    for (const item of queue) {
      const seat = document.querySelector(`.seat[data-seat-pid="${cssEscape(item.pid)}"]`);
      if (!seat) continue;
      if (item.amount > 0) {
        damageCount++;
        // 让同一帧内的多个伤害数字错开，避免完全重叠。
        const num = document.createElement('span');
        num.className = 'damage-number';
        num.textContent = `-${item.amount}`;
        num.style.setProperty('--fx-i', String(damageCount - 1));
        seat.appendChild(num);
        setTimeout(() => num.remove(), 1300);
        seat.classList.remove('damage-hit');
        void seat.offsetWidth;
        seat.classList.add('damage-hit');
        setTimeout(() => seat.classList.remove('damage-hit'), 560);
      }
      if (item.lightning) {
        lightningCount++;
        const avatar = seat.querySelector('.seat-avatar');
        seat.classList.remove('lightning-hit');
        void seat.offsetWidth;
        seat.classList.add('lightning-hit');
        const bolt = document.createElement('span');
        bolt.className = 'lightning-fx';
        bolt.setAttribute('aria-hidden', 'true');
        bolt.innerHTML = '<i></i><i></i><i></i>';
        seat.appendChild(bolt);
        if (avatar) {
          avatar.classList.remove('lightning-avatar');
          void avatar.offsetWidth;
          avatar.classList.add('lightning-avatar');
          setTimeout(() => avatar.classList.remove('lightning-avatar'), 1200);
        }
        setTimeout(() => {
          seat.classList.remove('lightning-hit');
          bolt.remove();
        }, 1350);
      }
    }
    // 扣体力只在本角色状态框内显示，不再触发全屏红色闪光。
    if (lightningCount) M.flashCombat('electric');
  };

  // 由 rules.dealDamage 在造成伤害后、进入濒死/求援前调用。
  // 先入队；若目标进入濒死，伤害结算暂停会在 render 后刷新队列，
  // 确保伤害数字先于濒死求援提示出现。
  M.showDamageVisual = function (state, source, target, result, type, options) {
    if (M.suppressCombatFx || !state || state !== M.state || !target || !result) return;
    if (type === 'D11') M.showDotShock(target);
    const opts = options || {};
    // 用回合/目标/日志长度等组成稳定键；玩家选择触发的回滚重放不会重复播放。
    const key = [state.round, target.id, target.turnSerial, state.log.length,
      type || '', opts.sourceName || '', result.hpLoss || 0, result.absorbed || 0].join('|');
    // 扣体力与护盾吸收都算受到伤害；同一伤害在重放时不重复播放沉闷击打声。
    const hitKey = key + '|hit-sound';
    if (!M.fxSeen.has(hitKey)) {
      M.fxSeen.add(hitKey);
      M.playGameSfx('damage');
    }
    if (result.hpLoss > 0) {
      M.pushCombatFx(target.id, result.hpLoss, key + '|damage', false);
    }
  };

  M.installVisualHooks = function () {
    if (M._visualHooksInstalled) return;
    M._visualHooksInstalled = true;

    // 引力坍缩施加【失重】时播放短促力场特效；AI 与玩家操作共用此入口。
    const baseAddStatus = G.addStatus;
    G.addStatus = function (player, id, name, extra) {
      const had = G.hasStatus(player, id);
      const result = baseAddStatus.apply(this, arguments);
      if (!had && id === 'weightless' && player && M.state && M.state.players.includes(player)) {
        M.showGravityFx(player);
      }
      return result;
    };

    // 护盾每新增一层时记录一次飘字；同名护盾刷新/叠到上限不重复加层，不飘字。
    const baseGainShield = G.gainShield;
    G.gainShield = function (player, count) {
      const before = player ? Math.max(0, Number(player.shield) || 0) : 0;
      const result = baseGainShield.apply(this, arguments);
      if (!M.suppressCombatFx && M.state && player && M.state.players.includes(player)) {
        const after = Math.max(0, Number(player.shield) || 0);
        const added = Math.max(0, after - before);
        if (added > 0) {
          const key = [M.state.round, player.id, player.turnSerial, M.state.log.length,
            before, after, 'shield-gain'].join('|');
          if (!M.fxSeen.has(key)) {
            M.fxSeen.add(key);
            M.queueShieldGainFx(player.id, added);
          }
        }
      }
      return result;
    };

    // 护盾被伤害削减时，和增益一样在状态栏上方逐点飘“护盾-1”。
    const baseDealDamage = G.dealDamage;
    G.dealDamage = function (state, source, target, amount, type, options) {
      const beforeShield = target ? Math.max(0, Number(target.shield) || 0) : 0;
      const result = baseDealDamage.apply(this, arguments);
      if (!M.suppressCombatFx && M.state && state === M.state && target &&
          result && result.absorbed > 0) {
        const afterShield = Math.max(0, Number(target.shield) || 0);
        const key = [state.round, target.id, state.damageEventId || 0, state.log.length,
          beforeShield, afterShield, type || '', 'shield-loss'].join('|');
        if (!M.fxSeen.has(key)) {
          M.fxSeen.add(key);
          M.queueShieldLossFx(target.id, result.absorbed);
        }
      }
      return result;
    };

    // 所有成功打出的牌（含响应、装备、第IX机关）在公示时播放一次桌面拍牌声。
    const baseAnnounceActivePlay = G.announceActivePlay;
    G.announceActivePlay = function (state, player, cards, options) {
      const before = state ? (state.publicSeq || 0) : 0;
      const result = baseAnnounceActivePlay.apply(this, arguments);
      if (!M.suppressCombatFx && state && state === M.state && cards && cards.length &&
          (state.publicSeq || 0) > before) {
        const seq = state.publicSeq;
        if (M.cardSfxSeq !== seq) {
          M.cardSfxSeq = seq;
          M.playGameSfx('card');
          if (cards.some(c => c && c.name === '命途对撞')) M.playPathCollisionVoice();
        }
      }
      return result;
    };

    // 终末裁决的雷击特效按“判定触发”播放；即使伤害被护盾/技能抵消，也显示头像雷击。
    const baseResolveTerminal = J.resolveTerminalCard;
    J.resolveTerminalCard = function (state, actor, terminal) {
      const judged = baseResolveTerminal.apply(this, arguments);
      if (!M.suppressCombatFx && judged && judged.element === '雷' && state === M.state && actor) {
        const key = [state.round, actor.id, actor.turnSerial, terminal && terminal.uid,
          judged.uid || '', 'terminal-lightning'].join('|');
        M.pushCombatFx(actor.id, 0, key, true);
      }
      return judged;
    };
  };

  // ---------- 设置 / 记录 ----------
  M.settingsKey = 'starrail_ui_settings_v2';
  M.legacySettingsKey = 'starrail_ui_settings_v1';
  M.recordsKey = 'starrail_records_v1';
  // 音频分类：BGM 与 data-event-music 属于“音乐”；data-sfx-audio 与 Web Audio 合成音属于“音效”。
  M.audio = null;
  M.magicVoiceAudio = null;
  M.pathCollisionVoiceAudio = null;
  M.skillPointSfxAudio = null;
  M.ahaMusicAudio = null;
  M.huahuoMusicAudio = null;
  M.leishenMusicAudio = null;
  M.musicEnabled = true;
  M.musicVolume = 0.35;
  M.musicPlayPending = false;
  M.musicToken = 0;
  M.soundEnabled = true;
  M.sfxContext = null;
  M.sfxNoiseBuffer = null;
  // 除魔术技巧人声外，所有合成音效统一走这条增益总线，避免被音乐盖过。
  M.sfxMaster = null;
  M.sfxGain = 2;
  M.cardSfxSeq = null;
  M.ahaSceneActive = false;
  M.ahaSceneRound = null;
  M.ahaBgmWasPlaying = false;
  M.huahuoMusicActive = false;
  M.huahuoMusicRound = null;
  M.huahuoBgmWasPlaying = false;
  M.leishenMusicActive = false;
  M.leishenMusicRound = null;
  M.leishenBgmWasPlaying = false;
  M.leishenResultHold = null;
  M.ahaCharacterArt = [
    'assets/fx/aha_char_1_center.webp?v=20261031z8',
    'assets/fx/aha_char_2_center.webp?v=20261031z8'
  ];

  // 音乐只允许一个 audio 实例播放；初始化时顺手暂停页面里可能残留的其他 audio。
  M.initAudio = function () {
    M.audio = $('bgm') || document.querySelector('audio');
    M.magicVoiceAudio = $('magicVoice');
    M.pathCollisionVoiceAudio = $('pathCollisionVoice');
    M.skillPointSfxAudio = $('skillPointSfx');
    M.ahaMusicAudio = $('ahaMusic');
    M.huahuoMusicAudio = $('huahuoMusic');
    M.leishenMusicAudio = $('leishenMusic');
    [M.magicVoiceAudio, M.pathCollisionVoiceAudio, M.skillPointSfxAudio].forEach(a => {
      if (!a) return;
      a.preload = 'auto';
      a.volume = 0.9;
      try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
    });
    [M.ahaMusicAudio, M.huahuoMusicAudio].forEach(a => {
      if (!a) return;
      a.preload = 'auto';
      a.loop = true;
      a.volume = M.musicVolume;
      try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
    });
    if (M.leishenMusicAudio) {
      M.leishenMusicAudio.preload = 'auto';
      M.leishenMusicAudio.loop = false;
      M.leishenMusicAudio.volume = M.musicVolume;
      try { M.leishenMusicAudio.pause(); M.leishenMusicAudio.currentTime = 0; } catch (e) { /* ignore */ }
    }
    if (!M.audio) return;
    // 只管理背景音乐；带 data-sfx-audio / data-event-music 的元素各自独立。
    document.querySelectorAll('audio:not([data-sfx-audio]):not([data-event-music])').forEach(a => {
      if (a !== M.audio) {
        try { a.pause(); } catch (e) { /* ignore */ }
        a.muted = true;
        a.volume = 0;
      }
    });
    try { M.audio.pause(); } catch (e) { /* ignore */ }
    M.audio.loop = true;
    M.audio.volume = M.musicVolume;
    M.audio.muted = false;
  };

  M.stopMusic = function () {
    M.musicToken += 1;
    M.musicPlayPending = false;
    document.querySelectorAll('audio:not([data-sfx-audio]):not([data-event-music])').forEach(a => {
      try { a.pause(); } catch (e) { /* ignore */ }
      if (a === M.audio) {
        a.muted = true;
        a.volume = 0;
      }
    });
  };

  M.stopOtherAudio = function () {
    document.querySelectorAll('audio:not([data-sfx-audio]):not([data-event-music])').forEach(a => {
      if (a === M.audio) return;
      try { a.pause(); } catch (e) { /* ignore */ }
      a.muted = true;
      a.volume = 0;
    });
  };

  // 阿哈真没面子：随机形象的动画在事件开始前预载，避免入场时空白。
  M.preloadAhaCharacters = function () {
    M.ahaCharacterArt.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  };

  M.ahaSceneElements = function () {
    return {
      layer: $('ahaCharacterLayer'),
      img: $('ahaCharacterImg'),
      subtitle: $('ahaSubtitle')
    };
  };

  // 形象直接作为牌桌中央圆的背景层，底边对齐圆的下沿；不在全屏层重复显示。
  M.applyAhaPortrait = function (src) {
    const center = $('tableCenter');
    if (!center) return;
    if (!src) { M.clearAhaPortrait(); return; }
    const url = new URL(src, document.baseURI).href;
    center.style.setProperty('--aha-portrait', `url("${url}")`);
    center.classList.add('aha-portrait');
    M.syncAhaPortraitBounds();
  };

  M.clearAhaPortrait = function () {
    const center = $('tableCenter');
    if (!center) return;
    center.classList.remove('aha-portrait');
    center.style.removeProperty('--aha-portrait');
    center.style.removeProperty('--aha-portrait-bottom');
  };

  // 红线取中央玩家状态框上沿：形象底边停在该线之上，不进入状态框区域。
  M.syncAhaPortraitBounds = function () {
    const center = $('tableCenter');
    if (!center || !center.classList.contains('aha-portrait')) return;
    const cr = center.getBoundingClientRect();
    if (!cr.height) return;
    const seat = document.querySelector('.seat.human-seat');
    let bottomPct = 0;
    if (seat) {
      const sr = seat.getBoundingClientRect();
      if (sr.top > cr.top && sr.top < cr.bottom) {
        bottomPct = ((cr.bottom - sr.top) / cr.height) * 100;
      }
    }
    bottomPct = Math.max(0, Math.min(45, bottomPct));
    center.style.setProperty('--aha-portrait-bottom', `${bottomPct.toFixed(1)}%`);
  };

  // 事件开始（轮次前场地公示已播完）时启动专属演出；同轮重放只启动一次。
  M.startAhaScene = function (state) {
    if (!M.active || !M.state || state !== M.state) return;
    if (M.spectating || M.phase === 'result') return;
    if (!state.fieldEffect || state.fieldEffect.id !== 1) return;
    if (M.ahaSceneActive && M.ahaSceneRound === state.round) return;
    if (M.ahaSceneActive) M.stopAhaScene({ resume: false });
    if (M.huahuoMusicActive) M.stopHuahuoMusic();

    M.ahaSceneActive = true;
    M.ahaSceneRound = state.round;
    M.ahaBgmWasPlaying = !!(M.audio && (!M.audio.paused || M.musicPlayPending));
    if (M.ahaBgmWasPlaying) {
      try { M.audio.pause(); } catch (e) { /* ignore */ }
      M.musicPlayPending = false;
    }

    const els = M.ahaSceneElements();
    const pick = M.ahaCharacterArt[Math.floor(Math.random() * M.ahaCharacterArt.length)];
    if (els.layer) {
      if (els.img) {
        els.img.src = pick;
        els.img.alt = '';
      }
      // 旧全屏层保持隐藏；形象改画在中央圆内。
      els.layer.hidden = true;
    }
    M.applyAhaPortrait(pick);
    if (els.subtitle) {
      els.subtitle.hidden = false;
      els.subtitle.classList.remove('run');
      // 强制重排，保证同一局第二次阿哈也从屏幕左端重新滑入。
      void els.subtitle.offsetWidth;
      els.subtitle.classList.add('run');
    }

    const audio = M.ahaMusicAudio;
    if (M.musicEnabled && audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = true;
        audio.muted = false;
        audio.volume = M.musicVolume;
        const p = audio.play();
        if (p && p.catch) p.catch(() => { /* 自动播放受限时保留画面，轮末照常收起 */ });
      } catch (e) { /* 音频失败不影响对局 */ }
    }
  };

  // 轮次结束/分出胜负时：音乐、字幕、形象同一时刻消失，并接回原背景音乐。
  M.stopAhaScene = function (options) {
    if (!M.ahaSceneActive) return;
    const shouldResume = !(options && options.resume === false);
    const wasBgmPlaying = M.ahaBgmWasPlaying;
    M.ahaSceneActive = false;
    M.ahaSceneRound = null;
    M.ahaBgmWasPlaying = false;

    const audio = M.ahaMusicAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
    M.clearAhaPortrait();
    const els = M.ahaSceneElements();
    if (els.layer) els.layer.hidden = true;
    if (els.img) els.img.removeAttribute('src');
    if (els.subtitle) {
      els.subtitle.hidden = true;
      els.subtitle.classList.remove('run');
    }

    if (shouldResume && wasBgmPlaying && M.musicEnabled && !M.huahuoMusicActive && !M.leishenMusicActive) M.applyMusic();
  };

  // 花火事件专属音乐：只播放音乐，不叠加额外画面；轮末与 BGM 的切换规则同阿哈。
  M.startHuahuoMusic = function (state) {
    if (!M.active || !M.state || state !== M.state) return;
    if (M.spectating || M.phase === 'result') return;
    if (!M.musicEnabled || !state.fieldEffect || state.fieldEffect.id !== 5) return;
    if (M.huahuoMusicActive && M.huahuoMusicRound === state.round) return;
    if (M.huahuoMusicActive) M.stopHuahuoMusic({ resume: false });
    if (M.ahaSceneActive) M.stopAhaScene();

    M.huahuoMusicActive = true;
    M.huahuoMusicRound = state.round;
    M.huahuoBgmWasPlaying = !!(M.audio && (!M.audio.paused || M.musicPlayPending));
    if (M.huahuoBgmWasPlaying) {
      try { M.audio.pause(); } catch (e) { /* ignore */ }
      M.musicPlayPending = false;
    }

    const audio = M.huahuoMusicAudio;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = true;
        audio.muted = false;
        audio.volume = M.musicVolume;
        const p = audio.play();
        if (p && p.catch) p.catch(() => { /* 自动播放受限时静默处理，轮末照常恢复 BGM */ });
      } catch (e) { /* 音频失败不影响对局 */ }
    }
  };

  M.stopHuahuoMusic = function (options) {
    if (!M.huahuoMusicActive) return;
    const shouldResume = !(options && options.resume === false);
    const wasBgmPlaying = M.huahuoBgmWasPlaying;
    M.huahuoMusicActive = false;
    M.huahuoMusicRound = null;
    M.huahuoBgmWasPlaying = false;

    const audio = M.huahuoMusicAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }

    if (shouldResume && wasBgmPlaying && M.musicEnabled && !M.ahaSceneActive && !M.leishenMusicActive) M.applyMusic();
  };

  // 爱上雷神专属音乐：场地效果公示出现时播放一次，不循环；BGM 在整个轮次内保持暂停。
  M.startLeishenMusic = function (state) {
    if (!M.active || !M.state || state !== M.state) return;
    if (M.spectating || M.phase === 'result') return;
    if (!M.musicEnabled || !state.fieldEffect || state.fieldEffect.id !== 9) return;
    if (M.leishenMusicActive && M.leishenMusicRound === state.round) return;
    if (M.leishenMusicActive) M.stopLeishenMusic({ resume: false });
    if (M.ahaSceneActive) M.stopAhaScene({ resume: false });
    if (M.huahuoMusicActive) M.stopHuahuoMusic({ resume: false });

    M.leishenMusicActive = true;
    M.leishenMusicRound = state.round;
    M.leishenBgmWasPlaying = !!(M.audio && (!M.audio.paused || M.musicPlayPending));
    if (M.leishenBgmWasPlaying) {
      try { M.audio.pause(); } catch (e) { /* ignore */ }
      M.musicPlayPending = false;
    }

    const audio = M.leishenMusicAudio;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false;
        audio.muted = false;
        audio.volume = M.musicVolume;
        const p = audio.play();
        if (p && p.catch) p.catch(() => { /* 自动播放受限时保持 BGM 暂停，轮末照常恢复 */ });
      } catch (e) { /* 音频失败不影响对局 */ }
    }
  };

  // 轮末先停掉仍在播放的片段，但保留活动标记，让 BGM 继续暂停到下一轮开始。
  M.pauseLeishenMusic = function () {
    if (!M.leishenMusicActive) return;
    const audio = M.leishenMusicAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
  };

  M.stopLeishenMusic = function (options) {
    if (!M.leishenMusicActive) return;
    if (options && options.round != null && M.leishenMusicRound !== options.round) return;
    const shouldResume = !(options && options.resume === false);
    const wasBgmPlaying = M.leishenBgmWasPlaying;
    M.leishenMusicActive = false;
    M.leishenMusicRound = null;
    M.leishenBgmWasPlaying = false;

    const audio = M.leishenMusicAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }

    if (shouldResume && wasBgmPlaying && M.musicEnabled &&
        !M.ahaSceneActive && !M.huahuoMusicActive) M.applyMusic();
  };

  // 本轮内进入结算：先停专属音乐，BGM 保持暂停到结果页面真正显示。
  M.stopLeishenForResult = function () {
    if (!M.leishenMusicActive) return;
    M.leishenResultHold = {
      resume: !!(M.leishenBgmWasPlaying && M.musicEnabled)
    };
    M.leishenMusicActive = false;
    M.leishenMusicRound = null;
    M.leishenBgmWasPlaying = false;
    const audio = M.leishenMusicAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
  };

  M.resumeLeishenBgmOnResult = function () {
    if (!M.leishenResultHold) return;
    const hold = M.leishenResultHold;
    M.leishenResultHold = null;
    if (hold.resume && M.musicEnabled && !M.ahaSceneActive && !M.huahuoMusicActive) M.applyMusic();
  };

  M.stopMagicVoice = function () {
    const a = M.magicVoiceAudio;
    if (!a) return;
    try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
  };

  M.stopPathCollisionVoice = function () {
    const a = M.pathCollisionVoiceAudio;
    if (!a) return;
    try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
  };

  M.playVoiceElement = function (a, volume) {
    if (!M.soundEnabled || !a) return;
    try {
      // 同一语音元素先归零，避免快速重复播放时人声叠音。
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      const vol = Number(volume);
      a.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.9;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 浏览器可能阻止自动播放 */ });
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  M.playMagicVoice = function () {
    // 魔术技巧人声保持原音量，不随其他音效一起增强。
    M.playVoiceElement(M.magicVoiceAudio);
  };

  M.playPathCollisionVoice = function () {
    // 导入音效保持原本的 0.9 音量。
    M.playVoiceElement(M.pathCollisionVoiceAudio);
  };

  M.applyMusic = function () {
    if (!M.audio) return;
    M.stopOtherAudio();
    // 阿哈/花火/爱上雷神专属音乐期间保持原 BGM 暂停，避免两段音乐重叠。
    if (M.ahaSceneActive || M.huahuoMusicActive || M.leishenMusicActive || M.leishenResultHold) return;
    if (!M.musicEnabled) {
      M.stopMusic();
      return;
    }
    M.audio.muted = false;
    M.audio.volume = M.musicVolume;
    // 已经在播放时绝不重复 play()，从根上避免多段音乐叠在一起。
    if (!M.audio.paused || M.musicPlayPending) return;
    M.musicPlayPending = true;
    const token = ++M.musicToken;
    try {
      const p = M.audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          M.musicPlayPending = false;
          if (token !== M.musicToken || !M.musicEnabled) M.stopMusic();
        }).catch(() => {
          M.musicPlayPending = false; /* 浏览器可能要求用户先点击页面 */
        });
      } else {
        M.musicPlayPending = false;
      }
    } catch (e) {
      M.musicPlayPending = false;
    }
  };

  M.setMusicEnabled = function (enabled) {
    M.musicEnabled = !!enabled;
    const music = $('musicToggle');
    if (music) music.checked = M.musicEnabled;
    if (!M.musicEnabled) {
      // 关闭音乐时专属演出/专属音乐同步停止，不再恢复 BGM。
      M.stopAhaScene({ resume: false });
      M.stopHuahuoMusic({ resume: false });
      M.stopLeishenMusic({ resume: false });
      M.stopMusic();
    } else {
      M.applyMusic();
    }
    M.saveSettings();
  };

  M.ensureMusic = function () {
    M.applyMusic();
    // 首次用户手势顺带解锁 Web Audio，之后牌桌/伤害音效不会被浏览器自动播放策略拦截。
    M.ensureSfxContext();
  };

  M.onMusicVolume = function () {
    M.musicVolume = Math.max(0, Math.min(1, Number($('musicVolume') && $('musicVolume').value) || 0));
    if (M.audio && M.musicEnabled) M.audio.volume = M.musicVolume;
    if (M.ahaMusicAudio && M.ahaSceneActive) M.ahaMusicAudio.volume = M.musicVolume;
    if (M.huahuoMusicAudio && M.huahuoMusicActive) M.huahuoMusicAudio.volume = M.musicVolume;
    if (M.leishenMusicAudio && M.leishenMusicActive) M.leishenMusicAudio.volume = M.musicVolume;
    M.saveSettings();
  };

  M.onMusicToggle = function () {
    M.setMusicEnabled(!!($('musicToggle') && $('musicToggle').checked));
  };

  // 音效开关：所有非音乐声音（语音/出牌/受伤/聊天表情等）统一由此控制。
  M.setSoundEnabled = function (enabled) {
    M.soundEnabled = !!enabled;
    const sound = $('soundToggle');
    if (sound) sound.checked = M.soundEnabled;
    if (!M.soundEnabled) {
      // 音效音频元素（魔术技巧/命途对撞人声）立即停止。
      document.querySelectorAll('audio[data-sfx-audio]').forEach(a => {
        try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ }
      });
      M.stopMagicVoice();
      M.stopPathCollisionVoice();
      if (typeof M.stopAhaSlotSpin === 'function') M.stopAhaSlotSpin();
      // Web Audio 合成的出牌/受伤/咖啡/枕头音效也立即静音。
      if (M.sfxContext && M.sfxContext.state === 'running') {
        M.sfxContext.suspend().catch(() => {});
      }
    } else if (M.sfxContext && M.sfxContext.state === 'suspended') {
      M.sfxContext.resume().catch(() => {});
    }
    M.saveSettings();
  };

  M.onSoundToggle = function () {
    M.setSoundEnabled(!!($('soundToggle') && $('soundToggle').checked));
  };

  // 聊天表情音效使用浏览器 Web Audio 合成，不依赖外部音频文件。
  M.ensureSfxContext = function () {
    if (!M.soundEnabled) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      if (!M.sfxContext) M.sfxContext = new Ctx();
      if (M.sfxContext.state === 'suspended') M.sfxContext.resume().catch(() => {});
      if (!M.sfxMaster || M.sfxMaster.context !== M.sfxContext) {
        const master = M.sfxContext.createGain();
        master.gain.value = M.sfxGain;
        master.connect(M.sfxContext.destination);
        M.sfxMaster = master;
      }
      return M.sfxContext;
    } catch (e) {
      return null;
    }
  };

  M.sfxNoise = function (ctx) {
    if (M.sfxNoiseBuffer && M.sfxNoiseBuffer.sampleRate === ctx.sampleRate) return M.sfxNoiseBuffer;
    const length = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    M.sfxNoiseBuffer = buffer;
    return buffer;
  };

  M.playGameSfx = function (kind) {
    if (!M.soundEnabled) return;
    const ctx = M.ensureSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    try {
      if (kind === 'card') {
        // 牌打到桌面：短促、清亮的高频拍击；在当前 SFX 总线基础上再放大 2 倍。
        const noise = ctx.createBufferSource();
        noise.buffer = M.sfxNoise(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1550, now);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.24, now + 0.008);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
        noise.connect(hp).connect(ng).connect(M.sfxMaster);
        noise.start(now);
        noise.stop(now + 0.09);

        const click = ctx.createOscillator();
        click.type = 'triangle';
        click.frequency.setValueAtTime(1850, now);
        click.frequency.exponentialRampToValueAtTime(1200, now + 0.045);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, now);
        cg.gain.exponentialRampToValueAtTime(0.09, now + 0.005);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        click.connect(cg).connect(M.sfxMaster);
        click.start(now);
        click.stop(now + 0.07);
      } else if (kind === 'damage') {
        // 受到伤害：低频、闷钝的“啪”击打声。
        const noise = ctx.createBufferSource();
        noise.buffer = M.sfxNoise(ctx);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(720, now);
        lp.frequency.exponentialRampToValueAtTime(260, now + 0.14);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        noise.connect(lp).connect(ng).connect(M.sfxMaster);
        noise.start(now);
        noise.stop(now + 0.18);

        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(105, now);
        thump.frequency.exponentialRampToValueAtTime(48, now + 0.15);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.0001, now);
        tg.gain.exponentialRampToValueAtTime(0.1, now + 0.008);
        tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
        thump.connect(tg).connect(M.sfxMaster);
        thump.start(now);
        thump.stop(now + 0.18);
      }
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  // ===== 阿哈老虎机音效（Web Audio 合成，受“音效”开关控制） =====
  // 轮盘转动：低频马达嗡鸣 + 循环气流噪声；每 85ms 由滚动计时器补一声机械咔哒。
  M.stopAhaSlotSpin = function () {
    const nodes = M.ahaSlotSpinNodes;
    if (!nodes) return;
    M.ahaSlotSpinNodes = null;
    try {
      const { ctx, master, sources } = nodes;
      const now = ctx.currentTime;
      if (typeof master.gain.cancelAndHoldAtTime === 'function') {
        master.gain.cancelAndHoldAtTime(now);
      } else {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      }
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      for (const src of sources) {
        try { src.stop(now + 0.08); } catch (e) { /* 已经停止 */ }
      }
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  M.playAhaSlotSpin = function (durationMs) {
    M.stopAhaSlotSpin();
    if (!M.soundEnabled) return;
    const ctx = M.ensureSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    const duration = Math.max(0.5, Math.min(3.5, (Number(durationMs) || 2000) / 1000));
    try {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.45, now + 0.08);
      master.gain.setValueAtTime(0.45, now + Math.max(0.1, duration - 0.18));
      master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      master.connect(M.sfxMaster);

      const sources = [];
      // 低频马达：两个略微错开的振荡器，制造机械转动的厚实感。
      [[58, 'sawtooth', 0.08], [87, 'triangle', 0.05]].forEach(([freq, type, amp]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(240, now);
        lp.Q.setValueAtTime(0.6, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp, now);
        osc.connect(lp).connect(g).connect(master);
        osc.start(now);
        osc.stop(now + duration + 0.03);
        sources.push(osc);
      });

      // 轮盘摩擦/气流：带通噪声，循环播放到轮盘停下。
      const noise = ctx.createBufferSource();
      noise.buffer = M.sfxNoise(ctx);
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(760, now);
      bp.Q.setValueAtTime(0.9, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.12, now);
      noise.connect(bp).connect(ng).connect(master);
      noise.start(now);
      noise.stop(now + duration + 0.03);
      sources.push(noise);

      M.ahaSlotSpinNodes = { ctx, master, sources };
    } catch (e) {
      M.ahaSlotSpinNodes = null;
    }
  };

  M.playAhaSlotTick = function () {
    if (!M.soundEnabled) return;
    const ctx = M.ensureSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.004;
    try {
      // 机械咔哒：短促的三角波下滑 + 高频噪声。
      const click = ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(1380, now);
      click.frequency.exponentialRampToValueAtTime(920, now + 0.028);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, now);
      cg.gain.exponentialRampToValueAtTime(0.018, now + 0.003);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      click.connect(cg).connect(M.sfxMaster);
      click.start(now);
      click.stop(now + 0.045);

      const noise = ctx.createBufferSource();
      noise.buffer = M.sfxNoise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, now);
      bp.Q.setValueAtTime(1.4, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.02, now + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      noise.connect(bp).connect(ng).connect(M.sfxMaster);
      noise.start(now);
      noise.stop(now + 0.04);
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  M.playAhaSlotDing = function () {
    if (!M.soundEnabled) return;
    const ctx = M.ensureSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    try {
      // 清脆结算音：基音 + 五度泛音 + 极轻的高频亮点。
      [[1760, 0.09, 0.5], [2637, 0.03, 0.36], [3520, 0.008, 0.22]].forEach(([freq, amp, decay]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(amp, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(g).connect(M.sfxMaster);
        osc.start(now);
        osc.stop(now + decay + 0.02);
      });
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  M.playChatSfx = function (kind) {
    if (!M.soundEnabled) return;
    const ctx = M.ensureSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    try {
      if (kind === 'pillow') {
        // 柔软枕头命中：低频“噗”声 + 短促空气噪声。
        const noise = ctx.createBufferSource();
        noise.buffer = M.sfxNoise(ctx);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1100, now);
        lp.frequency.exponentialRampToValueAtTime(220, now + 0.16);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        noise.connect(lp).connect(ng).connect(M.sfxMaster);
        noise.start(now);
        noise.stop(now + 0.2);

        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(135, now);
        thump.frequency.exponentialRampToValueAtTime(55, now + 0.16);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.0001, now);
        tg.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
        thump.connect(tg).connect(M.sfxMaster);
        thump.start(now);
        thump.stop(now + 0.18);
      } else if (kind === 'coffee') {
        // 递咖啡：杯沿轻碰与短促空气声，不做倾倒液体声。
        const noise = ctx.createBufferSource();
        noise.buffer = M.sfxNoise(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1900, now);
        bp.Q.setValueAtTime(0.5, now);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.032, now + 0.012);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        noise.connect(bp).connect(ng).connect(M.sfxMaster);
        noise.start(now);
        noise.stop(now + 0.22);

        const clink = ctx.createOscillator();
        clink.type = 'sine';
        clink.frequency.setValueAtTime(1120, now);
        clink.frequency.exponentialRampToValueAtTime(840, now + 0.12);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, now);
        cg.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        clink.connect(cg).connect(M.sfxMaster);
        clink.start(now);
        clink.stop(now + 0.2);
      }
    } catch (e) { /* 音效失败不影响游戏 */ }
  };

  M.loadSettings = function () {
    let s = {};
    let hasCurrent = false;
    try {
      const raw = localStorage.getItem(M.settingsKey);
      if (raw) {
        hasCurrent = true;
        s = JSON.parse(raw) || {};
      } else {
        // 旧版本可能保存过 music:false，同时页面仍在播放；迁移时以“默认开启”为准。
        s = JSON.parse(localStorage.getItem(M.legacySettingsKey) || '{}') || {};
      }
    } catch (e) {
      s = {};
    }
    const music = $('musicToggle');
    const volume = $('musicVolume');
    const sound = $('soundToggle');
    const lang = $('languageSelect');
    M.musicEnabled = hasCurrent ? s.music !== false : true;
    M.musicVolume = s.musicVolume == null ? 0.35 : Math.max(0, Math.min(1, Number(s.musicVolume) || 0));
    // 首次进入（没有当前设置）时音乐与音效均默认开启；旧版设置不再把音效带入关闭态。
    M.soundEnabled = hasCurrent ? s.sound !== false : true;
    if (music) music.checked = M.musicEnabled;
    if (volume) volume.value = M.musicVolume;
    if (sound) sound.checked = M.soundEnabled;
    if (lang) lang.value = s.language || 'zh-CN';
    if (M.audio) {
      M.audio.volume = M.musicVolume;
      M.audio.muted = !M.musicEnabled;
      if (!M.musicEnabled) {
        try { M.audio.pause(); } catch (e) { /* ignore */ }
      }
    }
    // 恢复上次选择的语言；首次进入为中文。
    if (lang && lang.value === 'en-US' && SR.i18n) SR.i18n.setLocale('en-US', { notify: false });
  };

  M.saveSettings = function () {
    const s = {
      music: !!M.musicEnabled,
      musicVolume: M.musicVolume,
      sound: M.soundEnabled,
      language: ($('languageSelect') && $('languageSelect').value) || 'zh-CN'
    };
    try { localStorage.setItem(M.settingsKey, JSON.stringify(s)); } catch (e) { /* 文件模式下可能不可用 */ }
  };

  // 切换语言：只改显示层，不改游戏状态；切回中文时由 i18n 还原原文。
  M.onLocaleChange = function () {
    try {
      if (M.state && $('screen-game') && !$('screen-game').hidden) {
        M.render();
        if (M.chat.open) M.renderChatPanel();
      }
      if ($('screen-select') && !$('screen-select').hidden) M.renderCharacterInfo();
      if ($('screen-info') && !$('screen-info').hidden) {
        M.applyRulesText();
        M.renderCardGallery();
      }
      if ($('screen-records') && !$('screen-records').hidden) M.renderRecords();
    } catch (e) {
      console.error(e);
    }
  };

  M.setLocale = function (locale) {
    const next = locale === 'en-US' ? 'en-US' : 'zh-CN';
    if (SR.i18n) SR.i18n.setLocale(next, { notify: false });
    const sel = $('languageSelect');
    if (sel) sel.value = next;
    M.saveSettings();
    M.onLocaleChange();
  };

  // 由中文切到英文时先弹出中英提示；切回中文不提示。
  M.onLanguageSelect = function () {
    const sel = $('languageSelect');
    if (!sel) return;
    const next = sel.value === 'en-US' ? 'en-US' : 'zh-CN';
    if (next === 'en-US' && (!SR.i18n || SR.i18n.locale !== 'en-US')) {
      M.openModal('提示 / Notice',
        '<p>翻译内容均为机翻，可能有误。</p><p class="i18n-notice-en">All translations are machine-generated and may contain errors.</p>',
        [{ label: '确定 / OK', primary: true, action: () => { M.closeModal(); M.setLocale('en-US'); } }]);
      return;
    }
    M.setLocale(next);
  };

  M.loadRecords = function () {
    try {
      const a = JSON.parse(localStorage.getItem(M.recordsKey) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  };

  M.addRecord = function (record) {
    try {
      const a = M.loadRecords();
      a.unshift(record);
      localStorage.setItem(M.recordsKey, JSON.stringify(a.slice(0, 50)));
    } catch (e) { /* ignore */ }
  };

  M.renderRecords = function () {
    const el = $('recordsContent');
    if (!el) return;
    const records = M.loadRecords();
    if (!records.length) {
      el.innerHTML = '<p class="hint">还没有完成的对局记录。</p>';
      return;
    }
    el.innerHTML = records.map((r, i) => {
      const date = r.date ? esc(r.date) : '';
      const human = r.humanIdentity ? `身份：${esc(r.humanIdentity)}` : '';
      const survivors = r.survivors && r.survivors.length ? `存活：${esc(r.survivors.join('、'))}` : '存活：无';
      return `<div class="record-row"><strong>${i + 1}. ${esc(r.result || '—')}</strong>
        <div>${date} · ${esc(r.playerCount || 0)} 人局 · ${human} · ${r.rounds || 0} 轮</div>
        <div>${survivors}</div></div>`;
    }).join('');
  };

  // ---------- 角色选择 ----------
  // 规则书正文：中文版与英文版来自同一结构；英文版缺失时回退中文。
  M.applyRulesText = function () {
    const el = $('rulesContent');
    if (!el) return;
    const text = (SR.i18n && SR.i18n.rulesText)
      ? SR.i18n.rulesText()
      : (SR.rulesText || '规则文本未加载。');
    el.textContent = text || '规则文本未加载。';
  };

  M.renderCharacterInfo = function () {
    const el = $('characterInfo');
    if (!el) return;
    const id = ($('character') && $('character').value) || '';
    const c = SR.data.characters.find(x => x.id === id);
    if (!c) { el.innerHTML = '<p class="hint">请选择一个角色。</p>'; return; }
    const skill = (label, s) => s
      ? `<article class="skill-card"><div class="skill-title"><span class="skill-icon skill-icon-inline">${M.skillIconHtml(s.name)}</span><span class="skill-label">${esc(label)}</span>${esc(s.name || '')}</div><div class="skill-effect">${esc(s.effect || '')}</div></article>`
      : '';
    el.innerHTML = `
      <div class="character-preview">
        <div class="character-avatar animal-avatar-character" aria-hidden="true">${M.animalArtHtml(c, 'character-avatar-img')}</div>
        <div class="character-heading">
          <div class="character-name">${esc(c.name)}</div>
          <div class="character-meta">${esc(c.faction || '')} · ${esc(c.gender || '')} · ${M.hpHearts(c.hp, c.hp, 'character-hearts')}</div>
        </div>
      </div>
      <div class="skill-grid">
        ${skill('秘技', c.secret)}
        ${skill('天赋', c.talent)}
        ${c.id.indexOf('trailblazer') === 0 ? `<article class="skill-card"><div class="skill-title"><span class="skill-icon skill-icon-inline">${M.skillIconHtml('命途抉择')}</span><span class="skill-label">命途</span>身份确认后选择</div><div class="skill-effect">进入游戏并确认身份后，从毁灭、存护、同谐、记忆、欢愉中选择一种命途。</div></article>` : ''}
      </div>`;
  };

  M.populateCharacters = function () {
    const sel = $('character');
    if (!sel) return;
    sel.innerHTML = SR.data.characters.map(c =>
      `<option value="${esc(c.id)}">${esc(c.name)}（${c.hp} 体力）</option>`
    ).join('');
  };

  // ---------- 新的对局 ----------
  M.createGame = function () {
    M.clearTimer();
    // 在“开一把”的用户手势内解锁音频上下文，保证之后 AI 触发的音效也能播放。
    M.ensureSfxContext();
    M.clearEndHold();
    M.starHunterArtCache.clear();
    M.clearAhaSlot();
    M.clearAhaPortrait();
    M.ahaSlotFinished.clear();
    M.deathHoldSeen = false;
    M.clearTurnBanner();
    M.clearCombatFx();
    M.suppressCombatFx = false;
    M._holyFxRoundKey = null;
    M._himekoLaserKey = null;
    M.closeChat();
    M.stopMagicVoice();
    M.stopPathCollisionVoice();
    M.stopSkillPointSfx();
    M.skillPointSfxSeen.clear();
    M.skillPointPlayerReadyAt = 0;
    if (M.skillPointCooldownTimer) clearTimeout(M.skillPointCooldownTimer);
    M.skillPointCooldownTimer = null;
    if (M.chat.cooldownTimer) clearTimeout(M.chat.cooldownTimer);
    M.chat.cooldownTimer = null;
    M.chat.cooldownUntil = 0;
    M.chat.tab = 'emote';
    M.chat.pid = null;
    M.chat.eventVoiceKey = '';
    M.chat.eventEmoteKey = '';
    M.cardSfxSeq = null;
    const playerCount = Number($('playerCount').value) || 3;
    const characterId = $('character').value;
    const enableEvents = $('fieldMode').value === 'random';
    const seed = (Date.now() ^ 0x5f3759df) >>> 0;
    try {
      M.state = G.createGame({
        playerCount,
        characterId,
        seed,
        fullDeck: true,
        enableEvents,
        manualHuman: true
      });
    } catch (err) {
      M.openModal('开局失败', esc(err && err.message || err), [{ label: '返回', action: M.closeModal }]);
      return;
    }
    M.human = M.state.players.find(p => p.isHuman) || M.state.players[0];
    M.current = null;
    M.phase = 'reveal';
    M.turnIndex = 0;
    M.pending = null;
    M.inlineChoice = null;
    M.clearPause();
    M.prePlaySkillWindow = false;
    M.discardMode = false;
    M.selectedDiscard = new Set();
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    M.finishingHumanTurn = false;
    M.deathChoiceShown = false;
    M.spectating = false;
    M.deathContext = null;
    showScreen('game');
    M.render();
    M.showIdentity();
  };

  M.showIdentity = function () {
    const h = M.human;
    const body = `<div class="detail-line"><strong>你的身份</strong> ${esc(h.identityName)}</div>
      <div class="detail-line"><strong>胜利条件</strong> ${esc(IDENTITY_WIN[h.identity] || '—')}</div>
      <p class="hint">其他角色的身份牌保持背面；只有身份公开或阵亡后才显示。</p>`;
    M.openModal('身份抽取', body, [{
      label: '确认身份',
      primary: true,
      action: () => {
        M.closeModal();
        if (h.characterId && h.characterId.indexOf('trailblazer') === 0) M.choosePath();
        else M.beginRound();
      }
    }]);
  };

  M.choosePath = function () {
    const body = '<p class="hint">你是开拓者。请选择本局命途，确认后整局不可更改。</p>' +
      SR.data.paths.map(p => `<div class="detail-line"><strong>${esc(p.name)}</strong> ${esc(p.effect)}</div>`).join('');
    M.openModal('选择命途', body, SR.data.paths.map(p => ({
      label: p.name,
      action: () => {
        M.human.path = p.id;
        const c = characterOf(M.human);
        const base = (c && c.name) || (M.human.characterId === 'trailblazer_m' ? '开拓者（男）' : '开拓者（女）');
        M.human.name = `${base}.${p.name}`;
        M.closeModal();
        M.beginRound();
      }
    })));
  };

  M.beginRound = async function () {
    if (!M.state || M.state.over) return M.finish();
    M.turnIndex = 0;
    M.phase = 'roundStart';
    M.render();
    M.toast(`第 ${M.state.round} 轮开始`);
    try {
      await M.runWithChoices(() => G.startRound(M.state));
    } catch (e) { M.fail(e); return; }
    M.clearPublicPlays();
    M.render();
    if (M.state.over) return M.finish();
    M.wait(M.nextTurn, 650);
  };

  M.bootsHasLater = function () {
    if (!M.state) return false;
    for (let i = M.turnIndex + 1; i < M.state.actionOrder.length; i++) {
      const q = G.getPlayer(M.state, M.state.actionOrder[i]);
      if (q && q.alive) return true;
    }
    return false;
  };

  M.askBootsActNow = async function (p) {
    if (!p) return false;
    if (!p.isHuman) {
      return !!(AI.chooseBootsActNow && AI.chooseBootsActNow(M.state, p));
    }
    return await M.askInPage({
      type: 'yesno',
      title: '反重力皮靴',
      body: '本轮正常行动时点已到。选择“正常行动”后本轮不能再插入；选择“等待插入”将跳过本次正常行动，之后可在其他角色行动前插入。',
      yesLabel: '正常行动',
      noLabel: '等待插入',
      cardUid: p.equipment.weapon ? p.equipment.weapon.uid : null,
      anchor: 'equipment',
      playerId: p.id
    });
  };

  M.nextTurn = async function () {
    M.clearTimer();
    if (!M.state) return;
    if (M.state.over) return M.finish();
    if (M.human && !M.human.alive && !M.deathChoiceShown && !M.spectating) {
      return M.askAfterDeath('turn');
    }
    if (M.turnIndex >= M.state.actionOrder.length) {
      // 与规则一致：所有其他角色行动完毕仍未插入的持有者，在本轮最后强制行动。
      const left = (M.state.boots || []).find(b => G.bootsCanAsk(M.state, b));
      if (left) {
        const holder = G.getPlayer(M.state, left.holderId);
        if (holder && holder.alive) {
          left.used = true;
          G.log(M.state, `所有其他角色行动完毕，${holder.name} 因【反重力皮靴】在本轮最后强制行动。`);
          M.current = holder;
          M.state.currentId = holder.id;
          M.render();
          if (holder.isHuman) {
            await M.beginHuman(holder);
          } else {
            M.setStatus(`${holder.name} 行动中…`);
            M.wait(() => {
              M.beginAITurn(holder).catch(M.fail);
            }, aiDelay());
          }
          return;
        }
      }
      return M.endRound();
    }
    const id = M.state.actionOrder[M.turnIndex];
    const p = G.getPlayer(M.state, id);
    if (!p || !p.alive) { M.turnIndex++; return M.nextTurn(); }
    if (G.hasStatus(p, 'zhuhuo')) {
      M.turnIndex++;
      M.toast(`${p.name} 处于【逐火】，跳过行动`);
      return M.nextTurn();
    }
    const own = G.bootsEntry(M.state, p.id);
    // 已经通过皮靴插入行动过：跳过正常行动时点，避免同一轮重复行动。
    if (own && own.active && own.used) {
      G.log(M.state, `${p.name} 已通过【反重力皮靴】行动，跳过正常行动时点。`);
      M.turnIndex++;
      return M.nextTurn();
    }
    // 反重力皮靴：在正常行动者之前，给仍在等待的持有者一次插入机会。
    if (await M.tryBootsInsert(p)) return;
    if (own && own.active && G.bootsCanAsk(M.state, own)) {
      if (!M.bootsHasLater()) {
        own.used = true;
        G.log(M.state, `${p.name} 是最后一个行动者，直接按正常时点行动。`);
      } else {
        const actNow = await M.askBootsActNow(p);
        if (actNow) {
          own.used = true;
          G.log(M.state, `${p.name} 在本轮正常时点行动，结束【反重力皮靴】的插入机会。`);
        } else {
          own.normalSlotPassed = true;
          G.log(M.state, `${p.name} 放弃本轮正常时点，继续等待【反重力皮靴】插入机会。`);
          M.turnIndex++;
          M.toast(`${p.name} 本轮正常时点已跳过，等待插入机会`);
          return M.nextTurn();
        }
      }
    }
    M.current = p;
    M.state.currentId = p.id;
    M.render();
    if (p.isHuman) {
      await M.beginHuman(p);
    } else {
      M.setStatus(`${p.name} 行动中…`);
      M.wait(() => {
        M.beginAITurn(p).catch(M.fail);
      }, aiDelay());
    }
  };

  M.tryBootsInsert = async function (upcoming) {
    const state = M.state;
    if (!state || !upcoming) return false;
    const entries = (state.boots || []).filter(b =>
      b.holderId !== upcoming.id && G.bootsCanAsk(state, b)
    ).sort((a, b) => state.actionOrder.indexOf(a.holderId) - state.actionOrder.indexOf(b.holderId));
    for (const b of entries) {
      const holder = G.getPlayer(state, b.holderId);
      if (!holder) continue;
      let use = false;
      if (holder.isHuman) {
        use = await M.askInPage({
          type: 'yesno',
          title: '反重力皮靴',
          body: `${holder.name}：是否发动【反重力皮靴】插入到 ${upcoming.name} 前行动？`,
          yesLabel: '插入行动', noLabel: '跳过',
          cardUid: holder.equipment.weapon ? holder.equipment.weapon.uid : null,
          anchor: 'equipment',
          playerId: holder.id
        });
      } else {
        use = !!(AI.chooseBootsInsert && AI.chooseBootsInsert(state, holder, upcoming));
      }
      if (!use) continue;
      b.used = true;
      M.bootsInserted = true;
      M.toast(`${holder.name} 发动【反重力皮靴】，插入行动`);
      M.current = holder;
      state.currentId = holder.id;
      M.render();
      if (holder.isHuman) await M.beginHuman(holder);
      else M.wait(() => { M.beginAITurn(holder).catch(M.fail); }, aiDelay());
      return true;
    }
    return false;
  };

  // AI 回合按动作逐步执行：每个动作之间保持约 2.25 秒，便于玩家看清。
  M.beginAITurn = async function (p) {
    if (!M.state || M.state.over || !p || !p.alive) return M.afterAITurn();
    M.clearPublicPlays();
    const pid = p.id;
    M.current = G.getPlayer(M.state, pid);
    M.state.currentId = pid;
    M.phase = 'ai';
    M.showTurnBanner(p);
    try {
      const info = await M.runWithChoices(() => {
        const state = M.state;
        const q = G.getPlayer(state, pid);
        G.endPreviousTurn(state, q);
        if (!q || !q.alive || state.over) return { stop: true };
        if (G.hasStatus(q, 'zhuhuo')) return { stop: true, zhuhuo: true };
        G.startTurn(state, q);
        if (!q.alive || state.over) return { stop: true };
        if (J.resolveTerminalBeforeAction) J.resolveTerminalBeforeAction(state, q);
        if (!q.alive || state.over) return { stop: true };
        if (J.resolveMemoryIceForActor) J.resolveMemoryIceForActor(state, q);
        if (!q.alive || state.over) return { stop: true };
        if (q.skipAction) return { stop: true, skip: true };
        state.phase = 'judge';
        if (J.resolveJudgePhase) J.resolveJudgePhase(state, q);
        if (!q.alive || state.over) return { stop: true };
        state.phase = 'draw';
        G.draw(state, q, 2);
        state.phase = 'play';
        return { stop: false, skipPlay: !!q.skipPlay };
      });
      M.clearPublicPlays();
      p = G.getPlayer(M.state, pid);
      if (!p) return M.afterAITurn();
      if (info && info.zhuhuo) M.toast(`${p.name} 处于【逐火】，跳过行动`);
      if (!info || info.stop) {
        if (info && info.skip) M.toast(`${p.name} 跳过本次行动`);
        return info && info.skip ? M.finishAITurn(p) : M.afterAITurn();
      }
      if (info.skipPlay) {
        M.toast(`${p.name} 被【记忆冰封】跳过出牌阶段，进入弃牌阶段`);
        return M.finishAITurn(p);
      }
      M.aiActionCount = 0;
      M.render();
      M.wait(() => M.aiPlayStep(p).catch(M.fail), aiDelay());
    } catch (e) { M.fail(e); }
  };

  M.aiPlayStep = async function (p) {
    if (!M.state || M.state.over || !p || !p.alive) return M.finishAITurn(p);
    if (M.human && !M.human.alive && !M.deathChoiceShown && !M.spectating) {
      return M.askAfterDeath('ai', () => M.wait(() => M.aiPlayStep(p).catch(M.fail), 300));
    }
    if (M.aiActionCount++ >= 24) return M.finishAITurn(p);
    M.clearPublicPlays();
    AI.ensure(M.state);
    const ctx = AI.context(M.state, p);
    const result = AI.chooseAction(ctx.pub, ctx.my, ctx.mind, M.state.rng || (() => 0.5));
    if (!result || !result.action) return M.finishAITurn(p);
    AI.logDecision(M.state, p, result);
    const pid = p.id;
    let ok = false;
    try {
      ok = await M.runWithChoices(() => {
        const q = G.getPlayer(M.state, pid);
        return q ? AI.applyAction(M.state, q, result.action) : false;
      });
    } catch (e) { return M.fail(e); }
    M.clearPublicPlays();
    if (!ok) {
      AI.recordRejected(M.state, p, result.action, null);
      return M.finishAITurn(G.getPlayer(M.state, pid));
    }
    M.render();
    p = G.getPlayer(M.state, pid);
    if (M.state.over || !p || !p.alive) return M.afterAITurn();
    if (M.human && !M.human.alive && !M.deathChoiceShown && !M.spectating) {
      return M.askAfterDeath('ai', () => M.wait(() => M.aiPlayStep(p).catch(M.fail), 300));
    }
    M.wait(() => M.aiPlayStep(p).catch(M.fail), aiDelay());
  };

  M.finishAITurn = async function (p) {
    if (!M.state || M.state.over) return M.afterAITurn();
    const pid = p && p.id;
    try {
      await M.runWithChoices(() => {
        const state = M.state;
        const q = pid ? G.getPlayer(state, pid) : null;
        if (!q || !q.alive) return;
        state.phase = 'discard';
        G.discardToLimit(state, q);
        if (SR.events && SR.events.onActionEndDot) SR.events.onActionEndDot(state, q);
        q.skipPlay = false;
        G.checkWin(state);
      });
    } catch (e) { return M.fail(e); }
    if (M.state.over) return M.finish();
    return M.afterAITurn();
  };

  M.beginHuman = async function (p) {
    M.phase = 'turnStart';
    M.clearPublicPlays();
    M.prePlaySkillWindow = false;
    M.showTurnBanner(p);
    M.render();
    const pid = p.id;
    G.endPreviousTurn(M.state, p);
    if (!p.alive || M.state.over) return M.afterHumanAction();
    try {
      await M.runWithChoices(() => G.startTurn(M.state, G.getPlayer(M.state, pid)));
    } catch (e) { return M.fail(e); }
    M.clearPublicPlays();
    p = G.getPlayer(M.state, pid);
    if (!p || !p.alive || M.state.over) return M.afterHumanAction();
    if (p.skipAction) {
      M.toast(`${p.name} 跳过本次行动`);
      M.phase = 'skipped';
      M.render();
      M.wait(M.afterHumanAction, 650);
      return;
    }
    // 没有需要判定的延时牌时，不展示手动判定阶段，直接摸牌进入出牌阶段。
    const pendingJudges = J.startJudgeCount ? J.startJudgeCount(p) : 0;
    if (!pendingJudges) {
      // 直接进入出牌；保留回合开始技能的可用窗口。
      M.prePlaySkillWindow = true;
      return M.humanJudge();
    }
    M.phase = 'judge';
    M.render();
  };

  M.humanJudge = async function () {
    if (M.pauseReveal || M.endHold) return;
    if (!M.human || !M.human.alive || !M.state || M.state.over) return;
    M.clearPublicPlays();
    const pid = M.human.id;
    try {
      const result = await M.runWithChoices(() => {
        const state = M.state;
        const p = G.getPlayer(state, pid);
        if (!p || !p.alive || state.over) return { stop: true };
        // 每次点击只结算一张开始行动时的判定牌。
        const step = J.resolveOneStartJudge ? J.resolveOneStartJudge(state, p) : null;
        if (!p.alive || state.over) return { stop: true, judged: step && step.judged };
        const remaining = J.startJudgeCount ? J.startJudgeCount(p) : 0;
        if (step && remaining > 0) return { waiting: true, remaining };
        state.phase = 'judge';
        if (J.resolveJudgePhase) J.resolveJudgePhase(state, p);
        if (!p.alive || state.over) return { stop: true, judged: step && step.judged };
        state.phase = 'draw';
        G.draw(state, p, 2);
        return { stop: false, done: true, skip: !!p.skipPlay };
      });
      M.clearPublicPlays();
      const p = G.getPlayer(M.state, pid);
      if (!p) return M.afterHumanAction();
      if (!result || result.stop) return M.afterHumanAction();
      if (result.waiting) {
        M.phase = 'judge';
        M.render();
        if (result.remaining > 0) M.toast(`还剩 ${result.remaining} 张判定牌`);
        return;
      }
      if (result.skip) {
        M.phase = 'skipped';
        M.toast(`${p.name} 跳过出牌阶段，进入弃牌阶段`);
        M.render();
        M.wait(M.enterDiscardPhase, 650);
        return;
      }
      M.state.phase = 'play';
      M.phase = 'play';
      M.render();
    } catch (e) { M.fail(e); }
  };

  M.afterAITurn = function () {
    if (!M.state) return;
    M.render();
    if (M.state.over) return M.finish();
    if (M.human && !M.human.alive && !M.deathChoiceShown && !M.spectating) {
      M.deathContext = 'ai';
      return M.askAfterDeath('ai');
    }
    if (M.bootsInserted) {
      M.bootsInserted = false;
      M.setStatus('');
      M.wait(M.nextTurn, 280);
      return;
    }
    M.turnIndex++;
    M.setStatus('');
    M.wait(M.nextTurn, 280);
  };

  M.afterHumanAction = function () {
    if (!M.state) return;
    const p = M.human;
    M.render();
    if (M.state.over) return M.finish();
    if (p && !p.alive) {
      M.deathContext = 'human';
      return M.askAfterDeath('human');
    }
    if (M.bootsInserted) {
      M.bootsInserted = false;
      M.setStatus('');
      M.wait(M.nextTurn, 250);
      return;
    }
    M.turnIndex++;
    M.setStatus('');
    M.wait(M.nextTurn, 250);
  };

  M.endRound = async function () {
    // AI 聊天只覆盖当前轮次；轮末取消所有待发送消息与气泡。
    M.clearAiChat();
    // 专属音乐只覆盖当前轮次：轮末即停止并恢复原 BGM。
    // 爱上雷神的 BGM 需保持暂停到下一轮开始，因此这里只停片段，活动标记留到 round++ 后再清除。
    M.pauseLeishenMusic();
    M.stopAhaScene();
    M.stopHuahuoMusic();
    if (!M.state || M.state.over) return M.finish();
    try { await M.runWithChoices(() => G.endRound(M.state)); } catch (e) { return M.fail(e); }
    if (M.state.over) return M.finish();
    if (M.state.round >= maxRounds) {
      M.state.over = true;
      M.state.draw = true;
      M.state.winner = { faction: 'draw', members: [], names: [] };
      G.log(M.state, `达到 ${maxRounds} 轮上限，判为平局。`);
      return M.finish();
    }
    M.state.round++;
    // 进入下一轮：结束爱上雷神的 BGM 暂停（若下一轮有专属音乐，会在其开始时再次暂停）。
    M.stopLeishenMusic();
    M.turnIndex = 0;
    M.phase = 'roundStart';
    M.render();
    M.toast(`第 ${M.state.round} 轮`);
    M.wait(async () => {
      try { await M.runWithChoices(() => G.startRound(M.state)); } catch (e) { return M.fail(e); }
      M.render();
      if (M.state.over) return M.finish();
      M.nextTurn();
    }, 650);
  };

  // ---------- 玩家回合操作 ----------
  M.cardNeedsTarget = function (card) {
    if (!card) return false;
    if (card.name === '再见安打') return true;
    if (card.name === '闪身步' || card.name === '第IX机关' || card.name === '入梦池') return false;
    if (C.isDelayed(card)) return true;
    return ['随蝴蝶一起消散吧', '星核猎手', '命途对撞', '欢愉诡计', '记忆冰封', '终末裁决'].includes(card.name);
  };

  M.cardTargets = function (card) {
    const p = M.human;
    if (!p || !card) return [];
    if (card.name === '再见安打') return G.validAnDaTargets(M.state, p, card);
    const alive = M.state.players.filter(t => t.alive && !G.isProtected(t));
    if (card.name === '星核猎手') {
      return alive.filter(t => t.id !== p.id && G.distance(M.state, p, t) <= 1);
    }
    if (card.name === '命途对撞') return alive.filter(t => G.validDuelTarget(M.state, p, t));
    if (card.name === '欢愉诡计') return alive.filter(t => t.id !== p.id);
    return alive;
  };

  M.pendingTargets = function () {
    const p = M.human, pending = M.pending;
    if (!p || !pending) return [];
    let targets;
    if (pending.card) targets = M.cardTargets(pending.card);
    else if (pending.skill === 'march7') targets = G.shieldTargets(M.state, p);
    else if (pending.skill === 'himeko') targets = G.himekoTargets(M.state, p);
    else if (pending.skill === 'chainsaw') targets = G.chainsawTargets(M.state, p);
    else targets = M.state.players.filter(x => x.alive && !G.isProtected(x));
    if (pending.card && pending.card.name === '欢愉诡计' && pending.stage === 'victim') {
      targets = targets.filter(x => x.id !== pending.forcedId);
    }
    return targets;
  };

  M.onHandCard = function (uid) {
    if (M.pauseReveal || M.endHold) return;
    if (M.chainsawMode) {
      if (!M.human || !M.human.alive) return;
      if (M.chainsawSelected.has(uid)) M.chainsawSelected.delete(uid);
      else if (M.chainsawSelected.size >= 2) return M.toast('只能选择两张手牌。');
      else M.chainsawSelected.add(uid);
      M.render();
      return;
    }
    if (M.phase === 'judge') return M.toast('请先判定');
    if (M.discardMode) {
      if (M.selectedDiscard.has(uid)) M.selectedDiscard.delete(uid);
      else M.selectedDiscard.add(uid);
      M.render();
      return;
    }
    if (M.phase !== 'play' || !M.human || !M.human.alive) return;
    M.clearPublicPlays();
    const card = findCardByUid(uid);
    if (!card) return;
    if (card.name === '闪身步') return M.toast('【闪身步】只能在响应时打出。');
    if (card.name === '第IX机关') return M.toast('【第IX机关】只能在响应时使用。');
    if (card.name === '入梦池') return M.toast('【入梦池】只能在回合开始时使用。');
    if (card.name === '再见安打' && !G.canPlayAnDa(M.state, M.human, card)) {
      return M.toast('本回合不能再使用【再见安打】，或没有合法目标。');
    }
    if (C.isEquip(card)) return M.confirmEquip(card);
    if (M.cardNeedsTarget(card)) {
      M.pending = { card, stage: card.name === '欢愉诡计' ? 'forced' : 'target', forcedId: null };
      M.render();
      return;
    }
    M.useCard(card, null);
  };

  // 玩家主动穿戴/更换装备前二次确认；AI 仍按引擎自动装备。
  M.confirmEquip = async function (card) {
    const slot = C.getSlot(card);
    const oldEquip = slot && M.human && M.human.equipment ? M.human.equipment[slot] : null;
    const ok = await M.askInPage({
      type: 'yesno',
      title: '装备确认',
      body: oldEquip ? '是否用该装备替换原装备？' : '是否穿戴该装备？',
      yesLabel: '是',
      noLabel: '否',
      cardUid: card.uid,
      anchor: 'hand',
      playerId: M.human && M.human.id
    });
    if (!ok) return;
    return M.useCard(card, null);
  };

  M.onTarget = function (targetId) {
    if (M.pauseReveal || M.endHold || !M.pending) return;
    const target = G.getPlayer(M.state, targetId);
    if (!target) return;
    const pending = M.pending;
    if (pending.card.name === '欢愉诡计') {
      if (pending.stage === 'forced') {
        if (target.id === M.human.id) return M.toast('【欢愉诡计】不能选择自己作为被强迫者。');
        pending.forcedId = target.id;
        pending.stage = 'victim';
        M.render();
        return;
      }
      if (target.id === M.human.id || target.id === pending.forcedId) {
        return M.toast('【欢愉诡计】的两名目标必须是不同角色，且不能选择自己。');
      }
      M.pending = null;
      M.useCard(pending.card, null, { forced: G.getPlayer(M.state, pending.forcedId), victim: target });
      return;
    }
    M.pending = null;
    M.useCard(pending.card, target);
  };

  M.useCard = async function (card, target, extra) {
    if (M.endHold || !M.human || !M.human.alive || M.phase !== 'play') return;
    M.clearPublicPlays();
    M.prePlaySkillWindow = false;
    const uid = card && card.uid;
    const tid = target && target.id;
    const forcedId = extra && extra.forced && extra.forced.id;
    const victimId = extra && extra.victim && extra.victim.id;
    let ok = false;
    try {
      ok = await M.runWithChoices(() => {
        const c = findCardByUid(uid);
        const opts = {};
        if (tid) opts.target = G.getPlayer(M.state, tid);
        if (forcedId) opts.forced = G.getPlayer(M.state, forcedId);
        if (victimId) opts.victim = G.getPlayer(M.state, victimId);
        return G.playCard(M.state, M.human, c, opts);
      });
    } catch (e) { return M.fail(e); }
    M.clearPublicPlays();
    if (!ok) M.toast(`无法使用【${card.name}】`);
    M.render();
    if (M.state.over) return M.finish();
    if (!M.human.alive) {
      M.deathContext = 'human';
      return M.askAfterDeath('human');
    }
  };

  M.onDotRemove = async function (uid) {
    if (M.pauseReveal || M.endHold || !M.human || M.phase !== 'play' || !(M.human.dots > 0)) return;
    M.clearPublicPlays();
    M.prePlaySkillWindow = false;
    try {
      await M.runWithChoices(() => {
        const c = findCardByUid(uid);
        return G.playCard(M.state, M.human, c, { removeDot: true });
      });
    } catch (e) { return M.fail(e); }
    M.clearPublicPlays();
    M.render();
    if (M.state.over) M.finish();
  };

  M.onSkillPoint = function () {
    if (M.pauseReveal || M.endHold) return;
    if (M.phase === 'judge') return M.toast('请先判定');
    if (!M.human || M.phase !== 'play' || M.human.skillPoints <= 0) return;
    // 两次手动使用之间至少间隔一次完整音效。
    if (!M.skillPointReady()) return;
    M.clearPublicPlays();
    M.prePlaySkillWindow = false;
    const E = SR.events;
    if (!E || !E.useSkillPoint) return;
    let used = false;
    try { used = E.useSkillPoint(M.state, M.human); } catch (e) { return M.fail(e); }
    if (used) M.startSkillPointCooldown();
    M.render();
    if (M.state.over) M.finish();
  };

  // 角色技能图标：按技能名映射，秘技与天赋使用各自的专属图案。
  const SKILL_ICON_ART = {
    '命途抉择': 'assets/skills/path_choice.svg',
    '星核共鸣': 'assets/skills/stellaron.svg',
    '云骑枪术': 'assets/skills/cloud_spear.svg',
    '龙吟九天': 'assets/skills/dragon_roar.svg',
    '六相冰弓': 'assets/skills/six_phase_bow.svg',
    '元气满满': 'assets/skills/vigor.svg',
    '拓星启行': 'assets/skills/trailblaze.svg',
    '乘胜追击': 'assets/skills/pursuit.svg',
    '引力坍缩': 'assets/skills/gravity.svg',
    '拟似黑洞': 'assets/skills/black_hole.svg',
    '秩序恩典': 'assets/skills/grace.svg',
    '乐园之门': 'assets/skills/paradise_gate.svg'
  };

  M.skillIconHtml = function (name, extraClass) {
    const src = SKILL_ICON_ART[name];
    if (!src) return '<span class="skill-icon-glyph">✦</span>';
    return `<img class="skill-icon-img${extraClass ? ' ' + extraClass : ''}" src="${src}?v=20261031z8" alt="" draggable="false">`;
  };

  // 跳过手动判定进入出牌时，原本在判定阶段使用的“回合开始”技能仍可在首次出牌前使用。
  M.inJudgeSkillWindow = function (phase) {
    return phase === 'judge' || (phase === 'play' && M.prePlaySkillWindow);
  };

  M.characterSkillButtons = function (p, phase) {
    if (!p) return '';
    const c = characterOf(p);
    if (!c) return '';
    const buttons = [];
    const push = (name, effect, dataSkill, active, disabled, disabledText, iconName, sub) => {
      const cls = active ? ' active' : ' passive';
      // 不使用原生 disabled：右键仍需能查看技能效果。
      buttons.push(`<button class="skill-button${cls}${disabled ? ' disabled-skill' : ''}" data-action="characterSkill" data-skill="${esc(dataSkill || 'info')}" data-skill-name="${esc(name)}" data-skill-effect="${esc(effect || '')}" title="${esc(effect || '')}" aria-disabled="${disabled ? 'true' : 'false'}">
        <span class="skill-icon">${M.skillIconHtml(iconName)}</span>
        <span class="skill-text"><b>${esc(name)}</b><small>${esc(disabled ? `${disabledText || '不可用'} · 右键查看` : (sub || '右键查看'))}</small></span>
      </button>`);
    };
    const secret = c.secret || {};
    const talent = c.talent || {};
    let activeSecret = false;
    let disabled = false;
    let disabledText = '';
    let skillId = 'info';
    if (p.characterId === 'march7') {
      skillId = 'march7';
      activeSecret = phase === 'play' && p.shieldUsedTurn < 2 && p.hand.length > 0;
      disabled = phase === 'play' && !activeSecret;
      disabledText = p.shieldUsedTurn >= 2 ? '本回合已用完' : '手牌不足';
    } else if (p.characterId === 'himeko') {
      skillId = 'himeko';
      activeSecret = phase === 'play' && !p.himekoUsedTurn && p.hand.length >= 2 && p.anDaUsed < 1 + (p.extraAnDa || 0);
      disabled = phase === 'play' && !activeSecret;
      disabledText = p.himekoUsedTurn ? '本回合已用' : (p.anDaUsed >= 1 + (p.extraAnDa || 0) ? '安打次数已用' : '手牌不足');
    } else if (p.characterId === 'welt') {
      skillId = 'welt';
      activeSecret = M.inJudgeSkillWindow(phase) && p.flags.humanWeltTurn !== p.turnSerial;
      disabled = !activeSecret && (p.flags.humanWeltTurn === p.turnSerial || !M.inJudgeSkillWindow(phase));
      disabledText = p.flags.humanWeltTurn === p.turnSerial ? '本回合已用' : '只能在行动开始时使用';
    } else if (p.characterId === 'sunday') {
      skillId = 'sunday';
      activeSecret = M.inJudgeSkillWindow(phase) && p.graceUses < 3;
      disabled = p.graceUses >= 3 || !M.inJudgeSkillWindow(phase);
      disabledText = p.graceUses >= 3 ? '本局已用完' : '只能在行动开始时使用';
    } else if (p.characterId && p.characterId.indexOf('trailblazer') === 0 && p.path === 'harmony') {
      skillId = 'harmony';
      activeSecret = M.inJudgeSkillWindow(phase) && p.flags.humanHarmonyUsedTurn !== p.turnSerial && p.hand.length > 0;
      disabled = p.flags.humanHarmonyUsedTurn === p.turnSerial || !p.hand.length || !M.inJudgeSkillWindow(phase);
      disabledText = p.flags.humanHarmonyUsedTurn === p.turnSerial ? '本回合已用' : (!p.hand.length ? '手牌不足' : '只能在行动开始时使用');
    }
    push(secret.name || '角色秘技', secret.effect || '', skillId, activeSecret, disabled, disabledText, secret.name, activeSecret ? '主动 · 右键查看' : '右键查看');
    push(talent.name || '角色天赋', talent.effect || '', 'info', false, false, '', talent.name, '天赋 · 右键查看');
    return `<div class="skill-row">${buttons.join('')}</div>`;
  };

  M.useWeltGravity = async function () {
    if (M.endHold) return;
    const p = M.human;
    if (!p || p.characterId !== 'welt' || !M.inJudgeSkillWindow(M.phase) || p.flags.humanWeltTurn === p.turnSerial) return;
    const list = M.state.players.filter(x => x.alive && x.id !== p.id && !G.isProtected(x));
    if (!list.length) return M.toast('没有可指定目标。');
    const tid = await M.askInPage({
      type: 'options', title: '引力坍缩', body: '选择直到其下一次行动开始前不能使用【闪身步】的角色。',
      cancelable: true,
      seatTargets: list.map(x => x.id),
      options: list.map(x => ({ label: `${x.name} ${x.hp}/${x.maxHp}`, value: x.id }))
    });
    const target = G.getPlayer(M.state, tid);
    if (!target) return;
    p.flags.humanWeltTurn = p.turnSerial;
    target.noDodgeBy = { walterId: p.id };
    G.addStatus(target, 'weightless', '失重');
    G.log(M.state, `${p.name} 发动【引力坍缩】，${target.name} 获得【失重】，直到其下一次行动开始前不能使用【闪身步】。`);
    M.render();
  };

  M.useSundayGrace = async function () {
    if (M.endHold) return;
    const p = M.human;
    if (!p || p.characterId !== 'sunday' || !M.inJudgeSkillWindow(M.phase) || p.graceUses >= 3) return;
    const list = M.state.players.filter(x => x.alive && !G.isProtected(x));
    if (!list.length) return;
    const tid = await M.askInPage({
      type: 'options', title: '秩序恩典', body: '选择摸一张牌的角色。',
      cancelable: true,
      seatTargets: list.map(x => x.id),
      options: list.map(x => ({ label: `${x.name} ${x.hp}/${x.maxHp}`, value: x.id }))
    });
    const target = G.getPlayer(M.state, tid);
    if (!target) return;
    p.graceUses += 1;
    G.draw(M.state, target, 1);
    if (target.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(M.state, p, target, 0.5);
    G.log(M.state, `${p.name} 发动【秩序恩典】，${target.name} 摸一张牌（${p.graceUses}/3）。`);
    M.render();
  };

  M.useHarmonySkill = async function () {
    if (M.endHold) return;
    const p = M.human;
    if (!p || p.path !== 'harmony' || !M.inJudgeSkillWindow(M.phase) || p.flags.humanHarmonyUsedTurn === p.turnSerial || !p.hand.length) return;
    const uid = await M.askInPage({
      type: 'options', title: '同谐', body: '弃一张牌，本回合获得一张额外安打。',
      cancelable: true,
      options: p.hand.map(c => ({ label: `${c.name} ${c.element || ''}${c.rank || ''}`, value: c.uid }))
    });
    const card = p.hand.find(c => c.uid === uid);
    if (!card) return;
    G.discardCard(M.state, p, card);
    p.flags.humanHarmonyUsedTurn = p.turnSerial;
    p.extraAnDa = 1;
    G.log(M.state, `${p.name} 的【同谐】生效，本回合可额外使用一张【再见安打】。`);
    M.render();
  };

  M.onCharacterSkill = function (skill) {
    if (M.pauseReveal || M.endHold) return;
    // 判定阶段先完成判定；瓦尔特/星期日/同谐的“回合开始”技能按规则可在判定前使用。
    if (M.phase === 'judge' && skill !== 'welt' && skill !== 'sunday' && skill !== 'harmony') {
      return M.toast('请先判定');
    }
    if (skill === 'march7') return M.onSkill('march7');
    if (skill === 'himeko') return M.onSkill('himeko');
    if (skill === 'welt') return M.useWeltGravity().catch(M.fail);
    if (skill === 'sunday') return M.useSundayGrace().catch(M.fail);
    if (skill === 'harmony') return M.useHarmonySkill().catch(M.fail);
    M.showCharacterDetail(M.human);
  };

  M.onSkill = function (skill) {
    if (M.pauseReveal || M.endHold) return;
    if (M.phase === 'judge') return M.toast('请先判定');
    if (M.phase !== 'play' || !M.human) return;
    if (skill === 'march7') {
      M.pending = { skill: 'march7', stage: 'target' };
      M.render();
    } else if (skill === 'himeko') {
      if (M.human.himekoUsedTurn || M.human.hand.length < 2) return M.toast('本回合无法使用【拓星启行】。');
      M.pending = { skill: 'himeko', stage: 'target' };
      M.render();
    }
  };

  M.onSkillTarget = async function (targetId) {
    if (M.pauseReveal || M.endHold) return;
    const pending = M.pending;
    if (!pending) return;
    M.pending = null;
    const tid = targetId;
    const skill = pending.skill;
    const chainsawUids = skill === 'chainsaw' ? (pending.cards || []).slice() : [];
    if (!G.getPlayer(M.state, tid)) return;
    M.clearPublicPlays();
    let ok = false;
    try {
      ok = await M.runWithChoices(() => {
        const target = G.getPlayer(M.state, tid);
        if (skill === 'march7') return G.playShield(M.state, M.human, target);
        if (skill === 'himeko') return G.playHimekoSkill(M.state, M.human, target);
        if (skill === 'chainsaw') {
          const cards = chainsawUids
            .map(uid => M.human.hand.find(c => c.uid === uid))
            .filter(Boolean);
          return G.playChainsawAnDa(M.state, M.human, target, cards);
        }
        return false;
      });
    } catch (e) { return M.fail(e); }
    M.clearPublicPlays();
    if (!ok) M.toast('技能未生效。');
    M.render();
    if (M.state.over) return M.finish();
  };

  // 进入弃牌阶段：超过手牌上限时等待玩家手动弃牌，否则直接结束回合。
  // 记忆冰封只跳过“出牌阶段”，弃牌阶段仍必须结算。
  M.enterDiscardPhase = function () {
    if (!M.human || !M.state || M.state.over) return M.afterHumanAction();
    const limit = G.handLimit(M.human);
    M.phase = 'discard';
    M.pending = null;
    M.prePlaySkillWindow = false;
    M.discardMode = false;
    M.selectedDiscard = new Set();
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    if (M.human.hand.length > limit) {
      M.discardMode = true;
      M.render();
      return;
    }
    M.finishHumanTurn();
  };

  M.endPlay = function () {
    if (M.pauseReveal || M.endHold || !M.human || M.phase !== 'play') return;
    M.clearPublicPlays();
    M.enterDiscardPhase();
  };

  M.confirmDiscard = function () {
    if (M.pauseReveal || M.endHold || M.finishingHumanTurn || !M.human || M.phase !== 'discard' || !M.discardMode) return;
    const limit = G.handLimit(M.human);
    const need = Math.max(0, M.human.hand.length - limit);
    if (M.selectedDiscard.size < need) return M.toast(`还需要弃置 ${need - M.selectedDiscard.size} 张牌。`);
    // 有效点击立即关闭弃牌按钮，不添加延迟；重复事件不能再次结算。
    M.discardMode = false;
    M.phase = 'endingTurn';
    M.render();
    for (const uid of Array.from(M.selectedDiscard)) {
      const c = findCardByUid(uid);
      if (c && M.human.hand.includes(c)) G.discardCard(M.state, M.human, c);
    }
    M.selectedDiscard.clear();
    if (M.human.hand.length > limit) {
      M.discardMode = true;
      M.phase = 'discard';
      M.render();
      M.toast(`仍需弃置 ${M.human.hand.length - limit} 张牌`);
      return;
    }
    M.discardMode = false;
    M.finishHumanTurn();
  };

  M.finishHumanTurn = async function () {
    if (!M.human || !M.state || M.finishingHumanTurn ||
        !['play', 'discard', 'endingTurn'].includes(M.phase)) return;
    M.finishingHumanTurn = true;
    M.phase = 'endingTurn';
    M.discardMode = false;
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    M.render();
    const pid = M.human.id;
    try {
      await M.runWithChoices(() => {
        const state = M.state;
        const p = G.getPlayer(state, pid);
        if (!p) return;
        state.phase = 'discard';
        p.skipPlay = false;
        if (p.alive && !state.over && SR.events && SR.events.onActionEndDot) {
          SR.events.onActionEndDot(state, p);
        }
        G.checkWin(state);
      });
      // 共用回合推进：插入行动不消耗正在等待的正常行动者位置。
      M.phase = 'waitingTurn';
      M.afterHumanAction();
    } catch (e) { return M.fail(e); }
    finally { M.finishingHumanTurn = false; }
  };

  // ---------- 淘汰选择 / 静默结算 ----------
  M.askAfterDeath = function (context, onSpectate) {
    if (!M.human || M.human.alive || !M.state || M.state.over) return;
    if (M.deathChoiceShown) return;
    // 玩家阵亡后不再展示 AI 聊天；静默模拟/观战与结算都不应出现新消息。
    M.clearAiChat();
    M.deathChoiceShown = true;
    M.deathHoldSeen = true;
    M.deathContext = context || M.deathContext;
    M.deathResume = onSpectate || null;
    M.clearTimer();
    M.phase = 'ending';
    M.showEndHold('你已被击败，即将结算…');
    M.endHoldTimer = setTimeout(() => {
      M.endHoldTimer = null;
      M.hideEndHold(false);
      if (!M.state || M.state.over) return M.finish();
      M.openModal('你已被淘汰', '<div class="detail-line">你可以继续观战，或直接静默结算到分出胜负。</div>', [
        { label: '观战', action: () => { M.spectating = true; M.closeModal(); M.resumeAfterDeath(); } },
        { label: '直接结算', primary: true, action: () => { M.spectating = true; M.closeModal(); M.silentFinish(); } }
      ]);
    }, 4250);
  };

  M.resumeAfterDeath = function () {
    if (!M.state || M.state.over) return M.finish();
    const resume = M.deathResume;
    M.deathResume = null;
    if (resume) return resume();
    if (M.bootsInserted) {
      M.bootsInserted = false;
      M.deathContext = null;
      M.wait(M.nextTurn, 350);
      return;
    }
    if (M.deathContext === 'human') M.turnIndex++;
    M.deathContext = null;
    M.wait(M.nextTurn, 350);
  };

  M.silentFinish = function () {
    M.clearTimer();
    if (!M.state) return;
    const state = M.state;
    M.suppressCombatFx = true;
    try {
      // 若在 AI 回合中途直接结算，当前 AI 的已发生部分不再重复执行。
      if (M.phase === 'ai' && M.current && state.actionOrder[M.turnIndex] === M.current.id) {
        M.turnIndex++;
      }
      // 先完成当前轮的剩余行动。
      for (let i = M.turnIndex; i < state.actionOrder.length && !state.over; i++) {
        const id = state.actionOrder[i];
        const p = G.getPlayer(state, id);
        if (!p || !p.alive || G.hasStatus(p, 'zhuhuo')) continue;
        G.runAction(state, p);
      }
      if (!state.over) G.endRound(state);
      while (!state.over && state.round < maxRounds) {
        state.round++;
        G.startRound(state);
        if (!state.over) G.runBootsRound(state);
        if (!state.over) G.endRound(state);
      }
      if (!state.over) {
        state.over = true;
        state.draw = true;
        state.winner = { faction: 'draw', members: [], names: [] };
        G.log(state, `达到 ${maxRounds} 轮上限，判为平局。`);
      }
    } catch (e) { return M.fail(e); }
    M.finish();
  };

  // ---------- 结果 ----------
  M.finish = function () {
    // 该轮内分出胜负时，专属音乐、画面与 AI 聊天同样立即停止。
    M.clearAiChat();
    M.stopAhaScene();
    M.stopHuahuoMusic();
    M.stopLeishenForResult();
    M.syncChatEventItems();
    if (!M.state || M.phase === 'result' || M.finishPending) return;
    M.clearTimer();
    M.clearSkillPointFx();
    M.clearAhaSlot();
    M.closeChat();
    M.stopMagicVoice();
    M.stopPathCollisionVoice();
    M.closeModal();
    M.inlineChoice = null;
    const state = M.state;
    // 永劫轮回特殊胜利：用同长的深红全屏提示替代普通结算前画面。
    if (state.winner && state.winner.special === 'evernight') {
      M.finishPending = true;
      M.phase = 'ending';
      M.showEvernightSpecial();
      M.endHoldTimer = setTimeout(() => {
        M.endHoldTimer = null;
        M.finishPending = false;
        M.hideEvernightNotice();
        M.endHold = false;
        M.showResult();
      }, 4250);
      return;
    }
    // 玩家此前已被淘汰并展示过 4.25 秒原界面时，最终结果不再重复等待。
    if (M.deathHoldSeen && M.human && !M.human.alive) {
      M.showResult();
      return;
    }
    M.finishPending = true;
    M.phase = 'ending';
    M.showEndHold('对局结束，即将结算…');
    M.endHoldTimer = setTimeout(() => {
      M.endHoldTimer = null;
      M.finishPending = false;
      M.hideEndHold(false);
      M.showResult();
    }, 4250);
  };

  M.showResult = function () {
    if (!M.state) return;
    M.resumeLeishenBgmOnResult();
    if (M.phase === 'result') return;
    M.stopAhaScene();
    M.stopHuahuoMusic();
    M.clearTimer();
    M.clearSkillPointFx();
    M.hideEvernightNotice();
    M.hideEndHold(false);
    const fieldReveal = $('fieldReveal'); if (fieldReveal) fieldReveal.hidden = true;
    M.closeModal();
    M.inlineChoice = null;
    M.phase = 'result';
    const state = M.state;
    let title;
    if (state.draw || !state.winner) title = '平局';
    else if (state.winner.special === 'evernight') title = `救世主：${(state.winner.names && state.winner.names[0]) || '未知'}`;
    else title = `${factionLabel(state.winner.faction)} 获胜`;
    const human = M.human || state.players.find(p => p.isHuman);
    const alive = state.players.filter(p => p.alive).map(p => p.name).join('、') || '无';
    const body = `
      <div class="detail-line"><strong>获胜方</strong> ${esc(title)}</div>
      <div class="detail-line"><strong>你的身份</strong> ${esc(human ? human.identityName : '—')}</div>
      <div class="detail-line"><strong>存活角色</strong> ${esc(alive)}</div>
      <div class="detail-line"><strong>总回合数</strong> ${state.round}</div>`;
    $('resultTitle').textContent = title;
    $('resultContent').innerHTML = body;
    showScreen('result');
    M.addRecord({
      date: new Date().toLocaleString(),
      result: title,
      humanIdentity: human ? human.identityName : '—',
      survivors: state.players.filter(p => p.alive).map(p => p.name),
      playerCount: state.players.length,
      rounds: state.round
    });
  };

  M.fail = function (err) {
    console.error(err);
    M.clearTimer();
    M.clearEndHold();
    M.inlineChoice = null;
    M.openModal('运行出错', esc(err && err.stack || err), [{ label: '返回开始', action: () => { M.closeModal(); showScreen('start'); } }]);
  };

  // ---------- 渲染 ----------
  M.setStatus = function (text) {
    const el = $('gameStatus');
    if (el) el.textContent = text || '';
  };

  M.renderFieldReveal = function () {
    const el = $('fieldReveal');
    if (!el) return;
    const f = M.state && M.state.fieldEffect;
    const show = !!(M.pauseReveal && M.pauseReveal.kind === 'field' && f);
    if (!show) { el.hidden = true; return; }
    const name = $('fieldRevealName');
    const desc = $('fieldRevealDesc');
    if (name) name.textContent = f.name || '场地效果';
    if (desc) desc.textContent = M.statusText(f.description || f.effect || '');
    el.hidden = false;
  };

  M.render = function () {
    if (!M.state) return;
    const s = M.state;
    const h = M.human;
    const round = $('roundLabel');
    const turn = $('turnLabel');
    if (round) round.textContent = `第 ${s.round} 轮`;
    if (turn) {
      const cur = M.current || (s.currentId ? G.getPlayer(s, s.currentId) : null);
      turn.textContent = cur ? `${M.seatDisplayName(cur)} 行动` : '准备行动';
    }
    const center = $('tableCenter');
    if (center) {
      const f = s.fieldEffect;
      // 六人局座位会压到牌桌中央；把追忆/洞穴改为紧凑横排并置于座位之上，
      // 同时把中央公示下移，保证洞穴寓言在行动与救援提示期间都可见。
      const compactRomance = !!(f && f.id === 3 && s.reminiscence != null && s.players.length >= 6);
      const gameScreen = $('screen-game');
      if (gameScreen) gameScreen.classList.toggle('romance-compact', compactRomance);
      if (f && f.id === 3 && s.reminiscence != null) {
        center.innerHTML = M.romanceCountersHtml(s);
      } else {
        // 场地效果名字固定在圆的正中心；详细说明只在轮次开始的公示中出现。
        center.innerHTML = f
          ? `<div class="table-center-name" title="${esc(M.statusText(f.description || ''))}"><strong>${esc(f.name)}</strong></div>`
          : '<div class="table-center-name"><strong>星穹列车</strong></div>';
      }
    }
    M.renderSeats();
    M.renderPublicReveal();
    M.renderHumanPanel();
    M.renderFieldReveal();
    M.positionSeatReveals();
    M.positionChatPanel();
    M.syncChatButtons();
    M.syncChatEventItems();
    M.syncAhaSlotDom();
    M.renderRomanceFx();
    M.syncEvernightNotice();
    M.syncAhaPortraitBounds();
  };

  // 浪漫古士：牌桌中央的追忆/洞穴寓言层数与上限。数值溢出时按实际显示，不截断。
  M.romanceCountersHtml = function (s) {
    const remi = Math.max(0, Number(s.reminiscence) || 0);
    const remiCap = (s.reminiscence24Used || remi >= 24) ? 12 : 24;
    const cave = Math.max(0, Number(s.cave) || 0);
    return `<div class="romance-counts">
      <div class="romance-count remi">
        <img class="romance-icon remi" src="assets/cards/reminiscence_heart.png" alt="">
        <span class="romance-count-text"><b>追忆</b><span>${remi} / ${remiCap}</span></span>
      </div>
      <div class="romance-count cave">
        <img class="romance-icon cave" src="assets/cards/cave_allegory.png" alt="">
        <span class="romance-count-text"><b>洞穴寓言</b><span>${cave} / 13</span></span>
      </div>
    </div>`;
  };

  // 追忆：从中央爱心向未淘汰、未隔离玩家头像发射粉色水晶爱心；洞穴：红色全屏冲击波。
  M.renderRomanceFx = function () {
    const old = document.getElementById('romanceFxLayer');
    const pause = M.pauseReveal;
    if (!pause || (pause.kind !== 'reminiscence-hearts' && pause.kind !== 'cave-shockwave')) {
      if (old) old.remove();
      return;
    }
    if (old) return;
    const layer = document.createElement('div');
    layer.id = 'romanceFxLayer';
    layer.className = 'romance-fx-layer' + (pause.kind === 'cave-shockwave' ? ' cave' : '');
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const icon = document.querySelector(pause.kind === 'cave-shockwave'
      ? '.table-center .romance-icon.cave'
      : '.table-center .romance-icon.remi');
    const table = document.getElementById('tableCenter');
    const base = icon ? icon.getBoundingClientRect() : (table ? table.getBoundingClientRect() : null);
    if (!base) return;
    const cx = base.left + base.width / 2;
    const cy = base.top + base.height / 2;
    layer.style.setProperty('--cx', `${cx}px`);
    layer.style.setProperty('--cy', `${cy}px`);
    if (pause.kind === 'cave-shockwave') {
      layer.innerHTML = `<span class="cave-shockwave" style="--cx:${cx}px;--cy:${cy}px"></span>
        <span class="cave-shockwave second" style="--cx:${cx}px;--cy:${cy}px"></span>`;
      return;
    }
    const targets = (M.state.players || []).filter(p => p.alive && !G.isProtected(p));
    let n = 0;
    for (const p of targets) {
      const avatar = document.querySelector(`[data-seat-pid="${p.id}"] .seat-avatar`);
      if (!avatar) continue;
      const ar = avatar.getBoundingClientRect();
      const dx = (ar.left + ar.width / 2) - cx;
      const dy = (ar.top + ar.height / 2) - cy;
      const heart = document.createElement('img');
      heart.className = 'reminiscence-heart-projectile';
      heart.src = 'assets/cards/reminiscence_heart.png';
      heart.alt = '';
      heart.style.left = `${cx}px`;
      heart.style.top = `${cy}px`;
      heart.style.setProperty('--dx', `${dx}px`);
      heart.style.setProperty('--dy', `${dy}px`);
      heart.style.animationDelay = `${n * 40}ms`;
      layer.appendChild(heart);
      n += 1;
    }
  };

  M.seatPosition = function (index, n) {
    const humanIndex = Math.max(0, M.state.players.findIndex(p => p.isHuman));
    const angle = Math.PI / 2 + (index - humanIndex) * (Math.PI * 2 / n);
    const compact = typeof window !== 'undefined' && window.innerWidth < 820;
    let top = 50 + Math.sin(angle) * 29;
    // 5/6 人局 PC 端：左右两侧各有一名上家和下家。椭圆原始纵向间距
    // 小于状态框高度，会叠在一起；将侧边座位分别推到 25%/75% 的纵向带。
    // 顶部中央（6 人）与玩家自己的底部座位也略微收进，给装备/判定/状态
    // 行留出高度，优先保证 PC 端座位框互不重叠。
    if (!compact && (n === 5 || n === 6)) {
      if (Math.abs(Math.cos(angle)) > 0.3) {
        top = Math.sin(angle) > 0 ? 75 : 25;
      } else if (Math.sin(angle) > 0.9) {
        top = 77;
      } else if (n === 6 && Math.sin(angle) < -0.9) {
        top = 25;
      }
    }
    return {
      left: 50 + Math.cos(angle) * (compact ? 33 : 39),
      top
    };
  };

  M.revealFace = function (card, extraClass) {
    if (!card) return '';
    const copy = Object.assign({}, card, { uid: card.uid || 'public-reveal' });
    return `<div class="reveal-card ${extraClass || ''}" title="${esc(card.name || '')}">${M.cardFace(copy)}</div>`;
  };

  M.publicPlayMap = function () {
    const s = M.state;
    if (!s) return {};
    const map = Object.assign({}, s.publicPlays || {});
    // publicPlay 始终是最近一次出牌；兼容旧状态或测试直接写入的最新中国牌。
    if (s.publicPlay && s.publicPlay.playerId) {
      const id = s.publicPlay.playerId;
      if (!map[id] || (s.publicPlay.seq || 0) >= (map[id].seq || 0)) map[id] = s.publicPlay;
    }
    return map;
  };

  // 新行为开始时隐藏上一批公示牌；同一行为内的出牌与响应可以并列显示。
  M.clearPublicPlays = function () {
    if (!M.state) return;
    M.state.publicPlay = null;
    M.state.publicPlays = {};
    M.state.publicJudge = null;
    M.state.lastAnnounceUid = null;
    M.state.announcedUids = {};
  };

  M.renderSeatReveal = function (p, index, n) {
    const play = M.publicPlayMap()[p.id];
    if (!play || play.group || !p) return '';
    const pos = M.seatPosition(index, n);
    const side = pos.left > 55 ? 'side-left' : 'side-right';
    const kind = M.state.currentId && M.state.currentId !== p.id ? '响应' : '出牌';
    const cards = play.cards || [];
    const faces = cards.map(c => M.revealFace(c)).join('');
    return `<div class="seat-reveal ${side}">
      <span class="reveal-label">${kind}</span>
      <div class="reveal-cards${cards.length > 2 ? ' many' : ''}">${faces}</div>
    </div>`;
  };

  // 公示牌靠近屏幕边缘时整体平移，保证牌面不会被裁掉。
  M.positionSeatReveals = function () {
    const table = document.querySelector('.table-wrap');
    if (!table) return;
    const tr = table.getBoundingClientRect();
    if (!tr.width || !tr.height) return;
    document.querySelectorAll('.seat-reveal').forEach(el => {
      el.style.setProperty('--reveal-dx', '0px');
      el.style.setProperty('--reveal-dy', '0px');
      const r = el.getBoundingClientRect();
      const pad = 4;
      let dx = 0;
      let dy = 0;
      if (r.left < tr.left + pad) dx = tr.left + pad - r.left;
      else if (r.right > tr.right - pad) dx = tr.right - pad - r.right;
      if (r.top < tr.top + pad) dy = tr.top + pad - r.top;
      else if (r.bottom > tr.bottom - pad) dy = tr.bottom - pad - r.bottom;
      el.style.setProperty('--reveal-dx', `${Math.round(dx)}px`);
      el.style.setProperty('--reveal-dy', `${Math.round(dy)}px`);
    });
  };

  M.renderPublicReveal = function () {
    const el = $('centerReveal');
    if (!el) return;
    const s = M.state;
    if (!s) { el.hidden = true; el.innerHTML = ''; return; }
    const groups = Object.values(M.publicPlayMap())
      .filter(x => x && x.group)
      .sort((a, b) => (b.seq || 0) - (a.seq || 0));
    const group = groups[0];
    const judged = s.publicJudge;
    const pause = M.pauseReveal;
    const blocks = [];
    if (group) {
      const actor = G.getPlayer(s, group.playerId);
      const label = `群体效果${actor ? ' · ' + actor.name : ''}`;
      const groupCards = group.cards || [];
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">${esc(label)}</span>
        <div class="reveal-cards${groupCards.length > 3 ? ' many' : ''}">${groupCards.map(c => M.revealFace(c)).join('')}</div></div>`);
    }
    if (judged && judged.card) {
      const actor = G.getPlayer(s, judged.actorId);
      const label = `判定 · ${judged.reason || ''}${actor ? ' · ' + actor.name : ''}`;
      const outcomeData = judged.outcome ||
        (SR.judge && SR.judge.outcomeFor ? SR.judge.outcomeFor(judged.reason, judged.card) : null);
      const outcome = outcomeData
        ? `<span class="reveal-outcome ${esc(outcomeData.tone || 'info')}" title="${esc(outcomeData.text)}"><span class="outcome-full">${esc(outcomeData.text)}</span><span class="outcome-short">${esc(outcomeData.short || outcomeData.text)}</span></span>`
        : '';
      blocks.push(`<div class="center-reveal-block"><div class="reveal-head"><span class="reveal-label">${esc(label)}</span>${outcome}</div>
        <div class="reveal-cards">${M.revealFace(judged.card)}</div></div>`);
    }
    if (pause && pause.kind === 'aha' && !pause.silent) {
      const target = G.getPlayer(s, pause.playerId);
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">阿哈真没面子${target ? ' · ' + target.name : ''}</span>
        <div class="reveal-message">${esc(pause.text || '阿哈效果结算中…')}</div></div>`);
    }
    if (pause && pause.kind === 'pure') {
      const target = G.getPlayer(s, pause.playerId);
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">纯美骑士客串${target ? ' · ' + target.name : ''}</span>
        <div class="reveal-message">${esc(pause.text || '请选择一张牌…')}</div>
        ${pause.card ? `<div class="reveal-cards">${M.revealFace(pause.card)}</div>` : ''}</div>`);
    }
    if (pause && pause.kind === 'damage') {
      const target = G.getPlayer(s, pause.playerId);
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">伤害结算</span>
        <div class="reveal-message">${esc(pause.text || `${target ? target.name : '该角色'} 受到伤害。`)}</div></div>`);
    }
    if (pause && pause.kind === 'rescue') {
      const target = G.getPlayer(s, pause.playerId);
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">濒死求援</span>
        <div class="reveal-message">${esc(target ? target.name : '该角色')} 进入濒死，等待其他角色救援…</div></div>`);
    }
    if (pause && pause.kind === 'mimic') {
      const target = G.getPlayer(s, pause.playerId);
      blocks.push(`<div class="center-reveal-block"><span class="reveal-label">拟似黑洞</span>
        <div class="reveal-message">${esc(target ? target.name : '该角色')} 被【拟似黑洞】救回${target ? `（${target.hp}/${target.maxHp}）` : ''}。</div></div>`);
    }
    if (blocks.length) {
      el.innerHTML = blocks.join('');
      el.hidden = false;
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  };

  M.identityKnown = function (p) {
    return !!(p && (p.isHuman || !p.alive || p.identity === 'navigator'));
  };

  M.renderSeats = function () {
    const layer = $('seatLayer');
    if (!layer) return;
    const s = M.state;
    const n = s.players.length;
    const gameScreen = $('screen-game');
    if (gameScreen) gameScreen.classList.toggle('multi-player', n >= 5);
    const targetIds = new Set(M.pending ? M.pendingTargets().map(t => t.id) : []);
    if (M.inlineChoice && M.inlineChoice.seatTargets) {
      for (const id of M.inlineChoice.seatTargets) targetIds.add(id);
    }
    // 5/6 人局使用更紧凑的 PC 座位信息排版，给侧边上下两家留出安全间距。
    layer.classList.toggle('multi-seat', n >= 5);
    layer.innerHTML = s.players.map((p, i) => {
      const pos = M.seatPosition(i, n);
      const targetable = targetIds.has(p.id);
      const identity = M.identityKnown(p) ? p.identityName : '身份未知';
      const frozen = !!(p.alive && (p.statuses || []).some(x => x.id === 'incineration'));
      const isTrailblazer = !!(p.characterId && p.characterId.indexOf('trailblazer') === 0);
      const mimicFx = !!(M.pauseReveal && M.pauseReveal.kind === 'mimic' && M.pauseReveal.playerId === p.id);
      const statusFx = p && M.statusFx && M.statusFx[p.id];
      const gravityFx = !!(statusFx && statusFx.kind === 'gravity');
      const holyFx = !!(statusFx && statusFx.kind === 'holy');
      const preservationFx = !!(statusFx && statusFx.kind === 'preservation');
      const medicineFx = !!(statusFx && statusFx.kind === 'medicine');
      const moyinFx = !!(p.alive && M.pauseReveal && M.pauseReveal.kind === 'moyin');
      const vineVariant = moyinFx ? 'moyin' : (medicineFx ? 'medicine' : '');
      const elationMask = !!(M.state && Array.isArray(M.state.elationMasks) && M.state.elationMasks.includes(p.id));
      const insightValue = M.insightValue(p);
      const insightWand = !!(M.pauseReveal && M.pauseReveal.kind === 'insight-wand' && M.pauseReveal.playerId === p.id);
      const insightShatter = !!(statusFx && statusFx.kind === 'insight-shatter');
      const effectResist = !!(statusFx && statusFx.kind === 'effect-resist');
      const dotShock = !!(statusFx && statusFx.kind === 'dot-shock');
      const skillPointFx = M.skillPointFx && M.skillPointFx.playerId === p.id && !p.isHuman
        ? M.skillPointFx : null;
      const ahaSlot = M.ahaSlot && M.ahaSlot.playerId === p.id ? M.ahaSlot : null;
      const march7ShieldBg = (p.shield || 0) > 0;
      const equips = M.equipmentSlotsHtml(p, c => M.cardMini(c), 'seat');
      const judge = p.judge.length
        ? p.judge.map(x => M.cardMini(x)).join('')
        : '<span class="seat-tag">无判定</span>';
      const statuses = ((p.shield || 0) > 0 ? `<span class="seat-tag shield-tag" data-status-id="cute_justice" data-pid="${esc(p.id)}">护盾 ${p.shield}</span>` : '') +
        (p.statuses.length
          ? p.statuses.map(x => `<span class="seat-tag" data-status-id="${esc(x.id)}" data-pid="${esc(p.id)}">${esc(M.statusDisplayName(x, p))}</span>`).join('')
          : (p.shield || 0) > 0 ? '' : '<span class="seat-tag">无状态</span>');
      const reveal = M.renderSeatReveal(p, i, n);
      return `<article class="seat ${p.isHuman ? 'human-seat' : ''} ${p.alive ? '' : 'dead'} ${M.current && M.current.id === p.id ? 'current' : ''} ${targetable ? 'targetable' : ''} ${frozen ? 'frozen' : ''} ${isTrailblazer ? 'trailblazer-seat' : ''} ${mimicFx ? 'mimic-blackhole' : ''} ${gravityFx ? 'gravity-suppressed' : ''} ${holyFx ? 'holy-blessed' : ''} ${preservationFx ? 'preservation-shielded' : ''} ${medicineFx ? 'medicine-healing' : ''} ${moyinFx ? 'moyin-healing' : ''} ${march7ShieldBg ? 'march7-shield-bg' : ''} ${reveal ? 'has-reveal' : ''}"
        data-seat-pid="${esc(p.id)}" data-seat-target="${targetable ? esc(p.id) : ''}" style="left:${pos.left}%;top:${pos.top}%">
        ${mimicFx ? '<span class="black-hole-fx" aria-hidden="true"></span>' : ''}
        ${gravityFx ? '<span class="gravity-field-fx" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
        ${holyFx ? '<span class="holy-light-fx" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
        ${preservationFx ? '<span class="preservation-shield-fx" aria-hidden="true"><i></i></span>' : ''}
        ${vineVariant ? M.medicineVineHtml(vineVariant) : ''}
        ${ahaSlot ? M.ahaSlotHtml(ahaSlot) : ''}
        ${march7ShieldBg ? M.cloverBgHtml() : ''}
        ${frozen ? '<span class="frost-fx" aria-hidden="true"><i>❄</i><i>❄</i><i>❄</i></span>' : ''}
        <div class="seat-head">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            <span class="seat-avatar-wrap${dotShock ? ' dot-shock' : ''}">${M.avatarHtml(p)}${M.hasMemoryOpening(p) ? M.dreamBubbleHtml() : ''}${elationMask ? M.elationMaskHtml() : ''}${insightWand ? M.insightWandHtml() : (insightValue != null ? M.insightDiamondHtml(insightValue) : '')}${insightShatter ? M.insightShatterHtml() : ''}${effectResist ? '<span class="effect-resist-fx" aria-hidden="true">效果抵抗</span>' : ''}${dotShock ? '<span class="dot-shock-fx" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${M.current && M.current.id === p.id ? '<span class="seat-action-badge">行动中</span>' : ''}${M.chatToggleHtml(p, 'seat')}</span>
            <span class="seat-name${isTrailblazer ? ' trailblazer-name' : ''}" title="${esc(p.name)}">${esc(M.seatDisplayName(p))}</span>
          </div>
          <span class="seat-identity" data-identity-pid="${esc(p.id)}">${esc(identity)}</span>
        </div>
        <div class="seat-hp">${M.hpHearts(p.hp, p.maxHp, 'seat-hearts')}</div>
        <div class="seat-line seat-hand-line"><span class="seat-hand-label">手牌${M.handCountBadgeHtml((p.hand || []).length)}</span><span class="seat-hand-content">${M.seatHandHtml(p)}${p.alive ? '' : ' · 已阵亡'}</span></div>
        <div class="seat-line seat-card-line"><span class="seat-line-label">装备：</span><span class="seat-card-list">${equips}</span></div>
        <div class="seat-line seat-card-line"><span class="seat-line-label">判定：</span><span class="seat-card-list">${judge}</span></div>
        <div class="seat-line seat-status-line">状态：${statuses}${skillPointFx ? `<span class="seat-skill-point-anchor">${M.skillPointFxHtml(skillPointFx, 'seat-skill-point-fx')}</span>` : ''}</div>
        ${reveal}
      </article>`;
    }).join('');
  };

  const ELEMENT_ICONS = {
    '物理': 'assets/elements/physical.png',
    '火': 'assets/elements/fire.png',
    '冰': 'assets/elements/ice.png',
    '雷': 'assets/elements/lightning.png',
    '风': 'assets/elements/wind.png',
    '量子': 'assets/elements/quantum.png',
    '虚数': 'assets/elements/imaginary.png'
  };

  M.elementIcon = function (element) {
    return (ELEMENT_ICONS[element] || 'assets/elements/physical.png') + '?v=20261031z8';
  };

  const CARD_IMAGES = {
    '奇巧零食': 'assets/cards/snack.png',
    '普通战利品': 'assets/cards/loot_5.png',
    '精致战利品': 'assets/cards/loot_10.png',
    '珍贵战利品': 'assets/cards/loot_20.png',
    '贵重战利品': 'assets/cards/loot_30.png',
    '华丽战利品': 'assets/cards/loot_40.png',
    '战利品': 'assets/cards/loot_5.png',
    '很硬的甲': 'assets/cards/hard_armor.png',
    '绝对热量': 'assets/cards/absolute_heat.png',
    '光能盾牌': 'assets/cards/light_shield.png',
    '以牙还牙甲': 'assets/cards/tooth_armor.png',
    '高周波电锯': 'assets/cards/chainsaw.png',
    '反重力皮靴': 'assets/cards/boots.png',
    '火力风暴潮': 'assets/cards/firestorm.png',
    '斩首行动': 'assets/cards/decap.png',
    '银河球棒': 'assets/cards/galactic_bat.png',
    '再见安打': 'assets/cards/goodbye_hit.png',
    '闪身步': 'assets/cards/flash_step.png',
    '黄紫衬衫': 'assets/cards/yellow_purple_shirt.png',
    '菇菇嘎嘎': 'assets/cards/gugu_gaga.png',
    '随蝴蝶一起消散吧': 'assets/cards/butterfly_disperse.png',
    '入梦池': 'assets/cards/dream_pool.png',
    '命途对撞': 'assets/cards/path_collision.png',
    '纯美骑士客串': 'assets/cards/pure_knight.png',
    '击云': 'assets/cards/cloud_piercer.png',
    '侵晨': 'assets/cards/dawn.png',
    '伊甸之星': 'assets/cards/eden_star.png',
    '终末裁决': 'assets/cards/final_verdict.png',
    '跃迁引擎': 'assets/cards/warp_engine.png',
    '相位突进': 'assets/cards/phase_dash.png',
    '药王慈怀': 'assets/cards/aeon_abundance.png',
    '寰宇蝗灾': 'assets/cards/aeon_propagation.png',
    '帝弓光矢': 'assets/cards/aeon_hunt.png',
    '同谐共鸣': 'assets/cards/aeon_harmony.png',
    '第IX机关': 'assets/cards/aeon_nihility.png',
    '欢愉诡计': 'assets/cards/aeon_elation.png',
    '记忆冰封': 'assets/cards/aeon_remembrance.png'
  };

  // 自带完整背景的卡图：隐藏通用科技网格与扫描线。
  const ART_CLEAN_CARDS = new Set(['命途对撞', '纯美骑士客串', '闪身步']);

  // 按用户指定：4 字及以内不换行；有空格的位置换行；无空格不换行。
  const CARD_NAME_LINES = {
    '随蝴蝶一起消散吧': ['随蝴蝶', '一起消散吧'],
    '纯美骑士客串': ['纯美骑士', '客串'],
    '普通战利品': ['普通', '战利品'],
    '精致战利品': ['精致', '战利品'],
    '珍贵战利品': ['珍贵', '战利品'],
    '华丽战利品': ['华丽', '战利品'],
    '贵重战利品': ['贵重', '战利品']
  };

  // 【星核猎手】随机使用四张牌面之一；按卡牌实例 uid 缓存，同一局内保持稳定。
  const STELLARON_HUNTER_ARTS = [
    'assets/cards/stellaron_hunter_cat.png',
    'assets/cards/stellaron_hunter_kafka.png',
    'assets/cards/stellaron_hunter_catgirl.png',
    'assets/cards/stellaron_hunter_silverwolf.png'
  ];

  M.stellaronHunterArt = function (card) {
    const key = card && card.uid ? String(card.uid) : 'name:星核猎手';
    let url = M.starHunterArtCache.get(key);
    if (!url) {
      url = STELLARON_HUNTER_ARTS[Math.floor(Math.random() * STELLARON_HUNTER_ARTS.length)];
      M.starHunterArtCache.set(key, url);
    }
    return url;
  };

  // 星神牌使用星神立绘；其余卡牌统一使用货币战争装备风线条底。
  const CARD_AEON_ART = {
    '药王慈怀': true,
    '寰宇蝗灾': true,
    '帝弓光矢': true,
    '同谐共鸣': true,
    '第IX机关': true,
    '欢愉诡计': true,
    '记忆冰封': true
  };

  // 透明/无自带背景的卡图：按主体主题色叠加专属线条背景。
  const CARD_ART_THEMES = {
    '银河球棒': 'bat',
    '再见安打': 'comet',
    '黄紫衬衫': 'regal',
    '菇菇嘎嘎': 'spore',
    '击云': 'jade',
    '侵晨': 'dawn',
    '终末裁决': 'verdict',
    '跃迁引擎': 'warp',
    '相位突进': 'phase',
    '药王慈怀': 'abundance',
    '寰宇蝗灾': 'propagation',
    '帝弓光矢': 'hunt',
    '同谐共鸣': 'harmony',
    '第IX机关': 'nihility',
    '欢愉诡计': 'elation',
    '记忆冰封': 'remembrance'
  };

  M.cardImage = function (card) {
    const url = (card && card.name === '星核猎手')
      ? M.stellaronHunterArt(card)
      : ((card && CARD_IMAGES[card.name]) || '');
    return url ? url + '?v=20261031z8' : '';
  };

  M.cardNameLines = function (name) {
    if (SR.i18n && SR.i18n.locale === 'en-US') return SR.i18n.cardNameLines(name);
    return CARD_NAME_LINES[name] || [String(name || '')];
  };

  M.typeName = function (type) {
    return ({ basic: '基本牌', equip: '装备牌', trick: '锦囊牌' })[type] || '牌';
  };

  M.statusDisplayName = function (x, player) {
    const id = typeof x === 'string' ? x : (x && x.id);
    const name = typeof x === 'string' ? '' : (x && x.name);
    if (id === 'dot') return 'dot';
    if (id === 'dot_girl') return 'dot女子不会输';
    if (id === 'interpretation' && x && x.value != null) return `解读 ${x.value}`;
    if (id === 'skill_point') {
      const points = player && Number.isFinite(Number(player.skillPoints))
        ? Math.max(0, Math.floor(Number(player.skillPoints)))
        : 0;
      return `${name || '别逗你花姐笑了'} ${points}`;
    }
    return name || id || '状态';
  };

  M.statusText = function (text) {
    const s = String(text == null ? '' : text);
    if (SR.i18n && SR.i18n.locale === 'en-US') return s;
    return s.replace(/\bAI\b/g, '电脑');
  };



  // 仿扑克牌：左上/右下为元素图标 + 点数，中间为牌名/类型/卡图。
  M.cardFace = function (card, opts) {
    const o = opts || {};
    const mini = !!o.mini;
    const sel = o.selected ? ' selected' : '';
    const dis = o.disabled ? ' disabled' : '';
    const icon = M.elementIcon(card.element);
    const art = M.cardImage(card);
    const hasArt = !!art;
    const nameLines = M.cardNameLines(card.name);
    const nameLength = Array.from(String(card.name || '')).length;
    const longName = nameLines.length > 1;
    const midName = !longName && nameLength === 5;
    const artTheme = CARD_ART_THEMES[card.name];
    const customArt = (!!CARD_IMAGES[card.name] && !CARD_AEON_ART[card.name]) || card.name === '星核猎手';
    const cls = `play-card${mini ? ' card-mini' : ''}${o.hand ? ' card-button' : ''}${o.pickable ? ' inline-pickable' : ''}${hasArt ? ' has-art' : ''}${longName ? ' long-name' : ''}${midName ? ' mid-name' : ''}${sel}${dis}`;
    const tag = (o.hand || o.pickable) ? 'button' : 'span';
    const disabled = o.hand && o.disabled ? 'disabled' : '';
    let typeLabel = String(card.subtype || M.typeName(card.type));
    let mod = '';
    if (card.type === 'equip') {
      const m = typeLabel.match(/[+-]\d+/);
      if (m) {
        mod = m[0];
        typeLabel = typeLabel.replace(/\s*[+-]\d+/, '').trim();
      }
    }
    const corner = (where) => `<span class="card-corner ${where}">
      <span class="card-rank">${esc(card.rank || '')}</span>
      <img class="card-element" src="${icon}" alt="${esc(card.element || '')}">
    </span>`;
    return `<${tag} type="button" class="${cls}" data-card-uid="${esc(card.uid)}" data-element="${esc(card.element || '')}" ${disabled}>
      ${corner('top')}
      <span class="card-center">
        ${hasArt
          ? `<span class="card-art-wrap ${CARD_AEON_ART[card.name] ? 'aeon' : 'tech'} ${customArt ? 'custom-art' : ''}${artTheme ? ' art-themed art-theme-' + artTheme : ''}${ART_CLEAN_CARDS.has(card.name) ? ' art-clean' : ''}"><img class="card-art" src="${art}" alt="${esc(card.name)}"></span>`
          : `<img class="card-watermark" src="${icon}" alt="">`}
        <span class="card-name">${nameLines.map(esc).join('<br>')}</span>
        <span class="card-type">${esc(typeLabel)}</span>
      </span>
      ${corner('bottom')}
      ${mod ? `<span class="card-mod">${esc(mod)}</span>` : ''}
    </${tag}>`;
  };

  M.cardButton = function (card, opts) {
    return M.cardFace(card, Object.assign({ hand: true }, opts || {}));
  };

  M.cardBacks = function (count) {
    const n = Math.max(0, Number(count) || 0);
    if (!n) return '<span class="human-status">无手牌</span>';
    return `<span class="card-backs">${Array.from({ length: Math.min(n, 8) }, () => '<span class="card-back"></span>').join('')}${n > 8 ? `<span class="card-back-more">+${n - 8}</span>` : ''}</span>`;
  };

  // 手牌数圆形标识：座位状态栏放在“手牌”下方，玩家面板也复用。
  M.handCountBadgeHtml = function (count) {
    const n = Math.max(0, Number(count) || 0);
    return `<span class="hand-count-badge" aria-label="手牌 ${n} 张">${n}</span>`;
  };

  // 装备区固定三格：武器、防具、载具；空格显示虚线牌位。
  // slotActions 可给指定槽位追加操作按钮（目前用于高周波电锯）。
  M.equipmentSlotsHtml = function (p, faceFn, variant, slotActions) {
    const slots = [['weapon', '武器'], ['armor', '防具'], ['vehicle', '载具']];
    const cls = variant === 'human' ? 'human-equip-slots' : 'seat-equip-slots';
    const face = typeof faceFn === 'function' ? faceFn : (c => M.cardMini(c));
    return `<span class="equip-slots ${cls}">` + slots.map(([slot, label]) => {
      const card = p && p.equipment ? p.equipment[slot] : null;
      const slotHtml = `<span class="equip-slot ${card ? 'filled' : 'empty'} slot-${slot}" data-equip-slot="${slot}" title="${label}">${card ? face(card) : `<span class="equip-slot-placeholder">${label}</span>`}</span>`;
      const action = slotActions && slotActions[slot];
      return action ? `<span class="equip-slot-column">${slotHtml}${action}</span>` : slotHtml;
    }).join('') + '</span>';
  };

  M.chainsawUseLimit = function (p) {
    return G.hasEquip(p, '银河球棒') ? Infinity : 1 + (Number(p && p.extraAnDa) || 0);
  };

  // 高周波电锯：本次行动安打次数未达上限时，在武器槽下方提供装备技能按钮。
  M.chainsawActionHtml = function (p) {
    if (!p || !p.alive || !G.hasEquip(p, '高周波电锯')) return '';
    if (M.phase !== 'play' || M.pending || M.inlineChoice || M.chainsawMode || M.pauseReveal || M.endHold) return '';
    if (p.anDaUsed >= M.chainsawUseLimit(p)) return '';
    const disabled = p.hand.length < 2;
    return `<button class="equip-skill-button${disabled ? ' disabled' : ''}" data-action="chainsaw" title="两张手牌当【再见安打】使用" aria-disabled="${disabled}">发动<br>装备技能</button>`;
  };

  M.startChainsaw = function () {
    if (M.pauseReveal || M.endHold || !M.human || M.state.over) return;
    if (M.phase !== 'play') return;
    const p = M.human;
    if (!G.hasEquip(p, '高周波电锯')) return;
    if (p.anDaUsed >= M.chainsawUseLimit(p)) return M.toast('本次行动【再见安打】已到使用上限。');
    if (p.hand.length < 2) return M.toast('需要至少两张手牌才能发动【高周波电锯】。');
    if (!G.chainsawTargets(M.state, p).length) return M.toast('当前没有可攻击的目标。');
    M.chainsawMode = true;
    M.chainsawSelected = new Set();
    M.pending = null;
    M.inlineChoice = null;
    M.render();
  };

  M.confirmChainsawCards = function () {
    if (M.pauseReveal || M.endHold || !M.human || M.phase !== 'play' || !M.chainsawMode) return;
    const p = M.human;
    const uids = Array.from(M.chainsawSelected);
    if (uids.length !== 2) return M.toast('请选择两张手牌。');
    const cards = uids.map(findCardByUid).filter(c => c && p.hand.includes(c));
    if (cards.length !== 2) return M.toast('所选牌已不在手牌中，请重新选择。');
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    M.pending = { skill: 'chainsaw', stage: 'target', cards: uids };
    M.render();
  };

  M.cancelChainsaw = function () {
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    M.pending = null;
    M.render();
  };

  // 测试模式下座位区显示真实手牌；非测试模式仍显示牌背。
  M.seatHandHtml = function (p) {
    if (!p) return '';
    if (!M.revealAllHands) return M.cardBacks((p.hand || []).length);
    if (!(p.hand || []).length) return '<span class="human-status">无手牌</span>';
    return `<span class="seat-hand-list">${p.hand.map(c => M.cardMini(c)).join('')}</span>`;
  };

  M.cardMini = function (card) {
    return M.cardFace(card, { mini: true });
  };

  // ---------- 说明页卡面展示 ----------
  const CARD_GROUPS = [
    { label: '基本牌 · 攻击', back: '攻击', match: c => c.type === 'basic' && c.subtype === '攻击' },
    { label: '基本牌 · 闪避', back: '闪避', match: c => c.type === 'basic' && c.subtype === '闪避' },
    { label: '基本牌 · 治疗', back: '治疗', match: c => c.type === 'basic' && c.subtype === '治疗' },
    { label: '基本牌 · 强化', back: '强化', match: c => c.type === 'basic' && c.subtype === '强化' },
    { label: '普通锦囊', back: '普通锦囊', match: c => c.type === 'trick' && c.subtype === '普通' },
    { label: '延时锦囊', back: '延时锦囊', match: c => c.type === 'trick' && c.subtype === '延时' },
    { label: '战利品', back: '战利品', match: c => c.type === 'trick' && c.subtype === '战利品' },
    { label: '装备 · 武器', back: '武器', match: c => c.type === 'equip' && String(c.subtype || '').indexOf('武器') === 0 },
    { label: '装备 · 防具', back: '防具', match: c => c.type === 'equip' && c.subtype === '防具' },
    { label: '装备 · 载具', back: '载具', match: c => c.type === 'equip' && String(c.subtype || '').indexOf('载具') >= 0 }
  ];

  M.renderCardGallery = function () {
    const wrap = $('cardGallery');
    if (!wrap) return;
    // 展示一套牌的实际 91 张：先套用与牌堆相同的张数微调，再分组。
    const cards = ((SR.data && SR.data.cards) || []).slice();
    if (C && C.SET_ADJUST) {
      for (const name of Object.keys(C.SET_ADJUST.remove)) {
        for (let i = 0; i < C.SET_ADJUST.remove[name]; i++) C.removeOneByName(cards, name);
      }
      for (const name of Object.keys(C.SET_ADJUST.duplicate)) {
        const src = cards.find(c => c.name === name);
        if (src) for (let i = 0; i < C.SET_ADJUST.duplicate[name]; i++) cards.push(src);
      }
    }
    // 同一分组内按牌名首次出现的顺序排列，使同名牌（如两张随蝴蝶、两张第IX机关）
    // 紧挨在一起；同名牌内部保持原始元素/点数顺序。
    const firstIndex = new Map();
    cards.forEach((c, i) => {
      if (!firstIndex.has(c.name)) firstIndex.set(c.name, i);
    });
    const groups = CARD_GROUPS.map(g => Object.assign({}, g, {
      cards: cards.filter(g.match).sort((a, b) => {
        const ia = firstIndex.has(a.name) ? firstIndex.get(a.name) : 0;
        const ib = firstIndex.has(b.name) ? firstIndex.get(b.name) : 0;
        return ia - ib;
      })
    })).filter(g => g.cards.length);
    wrap.innerHTML = groups.map(g => `
      <section class="gallery-group">
        <div class="gallery-group-head"><span>${esc(g.label)}</span><em>${g.cards.length} 张</em></div>
        <div class="gallery-grid">
          <div class="gallery-back" title="统一牌背"></div>
          ${g.cards.map(c => `<div class="gallery-item" data-gallery-id="${esc(c.id)}">${M.cardFace(Object.assign({}, c, { uid: 'gallery-' + c.id }))}</div>`).join('')}
        </div>
      </section>`).join('');
    const count = groups.reduce((n, g) => n + g.cards.length, 0);
    const countEl = $('galleryCount');
    if (countEl) countEl.textContent = `共 ${count} 张（一套牌） · 统一牌背`;
  };

  // 将手牌下方的选择框限制在手牌面板内，避免窄屏或最后一张牌被裁切。
  M.positionInlineChoice = function () {
    const pop = document.querySelector('.inline-choice');
    if (!pop || pop.classList.contains('inline-static')) return;
    const wrap = pop.closest('.hand-card-wrap');
    const panel = $('humanPanel');
    if (!wrap || !panel) return;
    const wr = wrap.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const ow = pop.offsetWidth || 106;
    const pad = 6;
    let left = wr.width / 2 - ow / 2;
    const absLeft = wr.left + left;
    if (absLeft < pr.left + pad) left += (pr.left + pad - absLeft);
    const absRight = wr.left + left + ow;
    if (absRight > pr.right - pad) left -= (absRight - (pr.right - pad));
    pop.style.left = left + 'px';
    pop.style.transform = 'none';
    // 面板自身可滚动：把选择框滚入可视区域，不滚动整个页面。
    const or = pop.getBoundingClientRect();
    if (or.bottom > pr.bottom - pad) panel.scrollTop += or.bottom - (pr.bottom - pad);
    else if (or.top < pr.top + pad) panel.scrollTop -= (pr.top + pad) - or.top;
  };

  M.inlineAnchorVisible = function (c) {
    if (!c || !c.cardUid || !M.human) return false;
    const p = M.human;
    if ((p.hand || []).some(x => x.uid === c.cardUid)) return true;
    return ['weapon', 'armor', 'vehicle'].some(slot => p.equipment[slot] && p.equipment[slot].uid === c.cardUid);
  };

  M.inlineHandOptionIndex = function (uid) {
    const c = M.inlineChoice;
    if (!c || !uid) return -1;
    return (c.options || []).findIndex(o => !o.cancel && o.value === uid);
  };

  M.inlineHasHandOptions = function (c) {
    if (!c || !M.human) return false;
    return (c.options || []).some(o =>
      !o.cancel && (M.human.hand || []).some(h => h.uid === o.value)
    );
  };

  M.inlineChoiceHtml = function (staticMode) {
    const c = M.inlineChoice;
    if (!c) return '';
    const cls = `inline-choice${staticMode ? ' inline-static' : ''}${c.options.length > 2 ? ' wide' : ''}`;
    const seatHint = c.seatTargets && c.seatTargets.length ? '也可直接点击角色状态框。' : '';
    const bodyText = c.body
      ? `${c.body}${M.inlineHasHandOptions(c) ? '也可直接点击手牌。' : ''}${seatHint}`
      : (M.inlineHasHandOptions(c) ? '请直接点击手牌。' : seatHint);
    const body = bodyText
      ? `<span class="inline-choice-body">${esc(bodyText)}</span>`
      : '';
    const buttons = c.options.map((o, i) =>
      `<button type="button" data-inline-option="${i}" class="${o.primary ? 'primary' : ''}">${esc(o.label)}</button>`
    ).join('');
    return `<span class="${cls}" role="dialog" aria-label="${esc(c.title)}">
      <span class="inline-choice-title">${esc(c.title)}</span>
      ${body}
      <span class="inline-choice-actions">${buttons}</span>
    </span>`;
  };

  M.resolveInlineOption = function (index) {
    const c = M.inlineChoice;
    if (!c || !c.options || !c.options[index]) return;
    const opt = c.options[index];
    M.inlineChoice = null;
    M.render();
    c.resolve(opt.value);
  };

  M.resolveInlineChoice = function (value) {
    const c = M.inlineChoice;
    if (!c) return;
    M.inlineChoice = null;
    M.render();
    c.resolve(value);
  };

  // 战技点按钮与抽奖结果文字共用定位容器；最后 1 点用完时保留文字锚点。
  M.skillPointActionHtml = function (p, fx) {
    const cooling = !M.skillPointReady();
    const button = p.skillPoints > 0
      ? `<button class="action-button skill-point-button${cooling ? ' cooling' : ''}" data-action="skillPoint" ${cooling ? 'disabled' : ''} title="消耗战技点（剩余 ${p.skillPoints}）" aria-label="消耗战技点，剩余 ${p.skillPoints} 点">
          <span class="skill-point-medal">
            <img class="skill-point-badge-img" src="assets/ui/skill_point_badge.svg?v=20261031z8" alt="" draggable="false">
            <span class="skill-point-count">${p.skillPoints}</span>
          </span>
          <span class="skill-point-label">战技点</span>
        </button>`
      : '';
    if (!button && !fx) return '';
    return `<span class="skill-point-wrap${button ? '' : ' skill-point-wrap-ghost'}">${button}${fx ? M.skillPointFxHtml(fx, 'human-skill-point-fx') : ''}</span>`;
  };

  M.renderHumanPanel = function () {
    const panel = $('humanPanel');
    if (!panel || !M.human) return;
    const p = M.human;
    const limit = G.handLimit(p);
    const elationMask = !!(M.state && Array.isArray(M.state.elationMasks) && M.state.elationMasks.includes(p.id));
    const insightValue = M.insightValue(p);
    const insightWand = !!(M.pauseReveal && M.pauseReveal.kind === 'insight-wand' && M.pauseReveal.playerId === p.id);
    const insightShatter = !!(M.statusFx && M.statusFx[p.id] && M.statusFx[p.id].kind === 'insight-shatter');
    const effectResist = !!(M.statusFx && M.statusFx[p.id] && M.statusFx[p.id].kind === 'effect-resist');
    const dotShock = !!(M.statusFx && M.statusFx[p.id] && M.statusFx[p.id].kind === 'dot-shock');
    const skillFx = M.skillPointFx && M.skillPointFx.playerId === p.id && M.skillPointFx.isHuman
      ? M.skillPointFx : null;
    const equipFace = (c) => {
      const face = M.cardMini(c);
      if (!M.inlineChoice || M.inlineChoice.cardUid !== c.uid) return face;
      return `<span class="hand-card-wrap inline-open">${face}${M.inlineChoiceHtml()}</span>`;
    };
    const chainsawAction = M.chainsawActionHtml(p);
    const equips = M.equipmentSlotsHtml(p, equipFace, 'human', chainsawAction ? { weapon: chainsawAction } : null);
    const judge = p.judge.length
      ? p.judge.map(x => M.cardMini(x)).join('')
      : '<span class="human-status">无判定牌</span>';
    const statuses = ((p.shield || 0) > 0 ? `<span class="seat-tag shield-tag" data-status-id="cute_justice" data-pid="${esc(p.id)}">护盾 ${p.shield}</span>` : '') +
      (p.statuses.length
        ? p.statuses.map(x => `<span class="seat-tag" data-status-id="${esc(x.id)}" data-pid="${esc(p.id)}">${esc(M.statusDisplayName(x, p))}</span>`).join('')
        : (p.shield || 0) > 0 ? '' : '<span class="human-status">无状态</span>');

    let actions = '';
    let main = '';
    const handCards = (disabledNames) => p.hand.length
      ? p.hand.map(c => M.cardButton(c, { disabled: disabledNames && disabledNames.indexOf(c.name) >= 0 })).join('')
      : '<span class="human-status">无手牌</span>';
    const handFaces = () => p.hand.length
      ? p.hand.map(c => {
          const pickable = M.inlineHandOptionIndex(c.uid) >= 0;
          const face = M.cardFace(c, pickable ? { pickable: true } : undefined);
          if (!M.inlineChoice || M.inlineChoice.cardUid !== c.uid) return face;
          return `<span class="hand-card-wrap inline-open">${face}${M.inlineChoiceHtml()}</span>`;
        }).join('')
      : '<span class="human-status">无手牌</span>';
    const handLabel = `<div class="human-label human-hand-label">手牌${M.handCountBadgeHtml(p.hand.length)}</div>`;

    if (M.endHold) {
      main = `${handLabel}${p.alive ? handFaces() : M.cardBacks(p.hand.length)}`;
      actions = `<div class="human-status">${esc(M.endHoldMessage || '对局结算中，请稍候…')}</div>`;
    } else if (!p.alive) {
      main = `${handLabel}${M.cardBacks(p.hand.length)}`;
      actions = `<div class="human-status">你已阵亡。${M.spectating ? '正在观战/结算。' : '请选择观战或结算。'}</div>`;
    } else if (M.inlineChoice) {
      main = `${handLabel}${handFaces()}`;
      const anchored = M.inlineAnchorVisible(M.inlineChoice);
      actions = anchored
        ? `<div class="human-status">请在上方对应牌下完成选择。</div>`
        : M.inlineChoiceHtml(true);
    } else if (M.pauseReveal) {
      main = `${handLabel}${handFaces()}`;
      const waitText = ({
        rescue: '濒死求援中，请稍候…',
        damage: '伤害结算中，请稍候…',
        mimic: '【拟似黑洞】结算中，请稍候…',
        moyin: '【魔芋爽】轮末结算中，请稍候…',
        aha: '阿哈效果展示中，请稍候…',
        pure: '纯美骑士客串选牌展示中，请稍候…',
        field: '场地效果展示中，请稍候…',
        'insight-wand': '',
        'reminiscence-hearts': '',
        'cave-shockwave': '',
        'evernight-rebirth': ''
      })[M.pauseReveal.kind] ?? '公示牌展示中，请稍候…';
      actions = `<div class="human-status">${waitText}</div>`;
    } else if (M.chainsawMode) {
      const picked = M.chainsawSelected.size;
      main = `${handLabel}<div class="human-label">高周波电锯：选择两张手牌当【再见安打】（${picked}/2）</div>` +
        p.hand.map(c => M.cardButton(c, { selected: M.chainsawSelected.has(c.uid) })).join('');
      actions = `<button class="action-button primary" data-action="chainsawConfirm" ${picked === 2 ? '' : 'disabled'}>选择目标</button>
        <button class="action-button" data-action="chainsawCancel">取消</button>`;
    } else if (M.phase === 'judge') {
      const judgeCount = J.startJudgeCount ? J.startJudgeCount(p) : 0;
      main = `${handLabel}${handFaces()}`;
      actions = `<div class="human-label">角色技能</div>${M.characterSkillButtons(p, 'judge')}
        <div class="human-status">每次点击只判定一张；判定牌公示后进入弃牌堆。</div>
        <button class="action-button primary" data-action="judge">${judgeCount > 1 ? `判定（剩余 ${judgeCount} 张）` : '判定'}</button>`;
    } else if (M.phase === 'play') {
      main = `${handLabel}` + (M.pending ? handFaces() : handCards(['闪身步', '第IX机关']));
      if (M.pending) {
        const title = M.pending.card
          ? (M.pending.card.name === '欢愉诡计'
            ? `【欢愉诡计】选择${M.pending.stage === 'forced' ? '被强迫者' : '受害者'}`
            : `选择【${M.pending.card.name}】目标`)
          : (M.pending.skill === 'chainsaw'
            ? '【高周波电锯】选择安打目标'
            : (M.pending.skill === 'march7' ? '【六相冰弓】选择目标' : '【拓星启行】选择目标'));
        const targets = M.pendingTargets();
        actions = `<div class="human-label">${esc(title)}</div>` +
          (targets.length ? targets.map(x =>
            `<button class="target-button" data-target-id="${esc(x.id)}">${esc(x.name)} ${M.hpHearts(x.hp, x.maxHp, 'tiny-hearts')}</button>`
          ).join('') : '<span class="human-status">没有可选目标。</span>') +
          '<button class="action-button" data-action="cancel">取消</button>';
      } else {
        actions = M.characterSkillButtons(p, 'play') +
          M.skillPointActionHtml(p, skillFx) +
          ((p.dots || 0) > 0 ? (p.hand.filter(c => c.name === '药王慈怀' || c.name === '奇巧零食').map(c =>
            `<button class="action-button" data-action="dotRemove" data-card-uid="${esc(c.uid)}">${esc(c.name)}解除 1 层dot</button>`
          ).join('')) : '') +
          `<button class="action-button primary" data-action="endPlay">结束出牌</button>`;
      }
    } else if (M.phase === 'discard' && M.discardMode && !M.finishingHumanTurn) {
      const need = Math.max(0, p.hand.length - limit);
      main = `<div class="human-label">弃牌阶段：需要弃置 ${need} 张，已选 ${M.selectedDiscard.size} 张</div>` +
        p.hand.map(c => M.cardButton(c, { selected: M.selectedDiscard.has(c.uid) })).join('');
      actions = `<button class="action-button primary" data-action="confirmDiscard" ${M.selectedDiscard.size < need ? 'disabled' : ''}>确认弃牌</button>`;
    } else {
      main = `${handLabel}${handFaces()}`;
      actions = `<div class="human-status">等待当前行动结束…</div>`;
    }

    panel.innerHTML = `
      <div class="human-head">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="seat-avatar-wrap${dotShock ? ' dot-shock' : ''}">${M.avatarHtml(p)}${M.hasMemoryOpening(p) ? M.dreamBubbleHtml() : ''}${elationMask ? M.elationMaskHtml() : ''}${insightWand ? M.insightWandHtml() : (insightValue != null ? M.insightDiamondHtml(insightValue) : '')}${insightShatter ? M.insightShatterHtml() : ''}${effectResist ? '<span class="effect-resist-fx" aria-hidden="true">效果抵抗</span>' : ''}${dotShock ? '<span class="dot-shock-fx" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${M.chatToggleHtml(p, 'panel')}</span>
          <div>
            <div class="human-title">${esc(p.name)} · <span class="seat-identity" data-identity-pid="${esc(p.id)}">${esc(p.identityName)}</span></div>
            <div class="human-meta">${esc(characterOf(p) ? characterOf(p).faction : '')} · ${M.hpHearts(p.hp, p.maxHp, 'human-hearts')} · 手牌上限 ${limit} · 性别 ${esc(characterOf(p) ? characterOf(p).gender : '')}</div>
          </div>
        </div>
        <div class="human-meta">装备：${equips}</div>
      </div>
      <div class="human-body">
        <div class="human-column human-main">${main}</div>
        <div class="human-column human-side">
          <div class="human-inline"><span class="human-label">判定区</span><span class="human-inline-value">${judge}</span></div>
          <div class="human-inline"><span class="human-label">状态效果</span><span class="human-inline-value">${statuses}</span></div>
          <div class="human-action-row">${actions}</div>
        </div>
      </div>`;
  };

  // ---------- 右键详情 ----------
  M.showCardDetail = function (card) {
    if (!card) return;
    const typeName = M.typeName(card.type);
    const subtype = card.subtype ? ` · ${esc(card.subtype)}` : '';
    M.openModal(card.name, `<div class="detail-line"><strong>类型</strong> ${esc(typeName)}${subtype}</div>
      <div class="detail-line"><strong>元素/点数</strong> ${esc(card.element || '')} ${esc(card.rank || '')}</div>
      <div class="detail-line"><strong>作用</strong> ${esc(M.statusText(card.effect || '—'))}</div>`,
      [{ label: '关闭', action: M.closeModal }]);
  };

  M.showStatusDetail = function (id, pid) {
    const s = findStatus(id);
    const owner = pid && M.state ? G.getPlayer(M.state, pid) : null;
    M.openModal(s ? M.statusDisplayName(s, owner) : '状态说明', s
      ? `<div class="detail-line"><strong>来源</strong> ${esc(M.statusText(s.source || ''))}</div>
         <div class="detail-line"><strong>类型</strong> ${esc(M.statusText(s.type || ''))}</div>
         <div class="detail-line"><strong>效果</strong> ${esc(M.statusText(s.effect || ''))}</div>
         <div class="detail-line"><strong>持续</strong> ${esc(M.statusText(s.duration || ''))}</div>`
      : '<div class="detail-line">未找到该状态说明。</div>',
      [{ label: '关闭', action: M.closeModal }]);
  };

  M.showSkillDetail = function (name, effect) {
    M.openModal(name || '角色技能', `<div class="detail-line"><strong>效果</strong><br>${esc(effect || '—')}</div>`, [{ label: '关闭', action: M.closeModal }]);
  };

  M.showSkillDetailFromButton = function (button) {
    if (!button) return;
    M.showSkillDetail(button.dataset.skillName, button.dataset.skillEffect);
  };

  M.showCharacterDetail = function (p) {
    if (!p) return;
    const c = characterOf(p);
    const path = SR.data.paths.find(x => x.id === p.path);
    M.openModal(p.name || (c ? c.name : '角色资料'), c
      ? `<div class="detail-line"><strong>阵营</strong> ${esc(c.faction || '')} · <strong>性别</strong> ${esc(c.gender || '')} · <strong>体力</strong> ${M.hpHearts(c.hp, c.hp, 'character-hearts')}</div>
         <div class="detail-line"><strong>秘技</strong> <span class="detail-skill-icon">${c.secret ? M.skillIconHtml(c.secret.name) : ''}</span>${esc(c.secret ? c.secret.name : '')}<br>${esc(c.secret ? c.secret.effect : '')}</div>
         <div class="detail-line"><strong>天赋</strong> <span class="detail-skill-icon">${c.talent ? M.skillIconHtml(c.talent.name) : ''}</span>${esc(c.talent ? c.talent.name : '')}<br>${esc(c.talent ? c.talent.effect : '')}</div>
         ${path ? `<div class="detail-line"><strong>命途</strong> ${esc(path.name)}<br>${esc(path.effect)}</div>` : ''}`
      : '<div class="detail-line">角色资料不可用。</div>',
      [{ label: '关闭', action: M.closeModal }]);
  };

  M.showIdentityDetail = function (p) {
    if (!p) return;
    if (!M.identityKnown(p)) {
      M.openModal('身份牌', '<div class="detail-line">身份尚未公开。</div>', [{ label: '关闭', action: M.closeModal }]);
      return;
    }
    M.openModal(p.identityName, `<div class="detail-line"><strong>胜利条件</strong> ${esc(IDENTITY_WIN[p.identity] || '—')}</div>`,
      [{ label: '关闭', action: M.closeModal }]);
  };

  // ---------- 原生同步响应（响应发生在 AI 回合内部，无法暂停 DOM 事件循环） ----------
  M.installHumanHooks = function () {
    function human(p) { return !!(M.active && p && p.isHuman); }
    function baseCall(base, self, args) { return base.apply(self, args); }

    function askYesNo(req, base, self, args) {
      if (!M.choiceCollector) return baseCall(base, self, args);
      return M.requestAnswer(req, null);
    }

    function optionsOfCards(cards) {
      return (cards || []).map(c => ({
        label: `${c.name} ${c.element || ''}${c.rank || ''}`,
        value: c.uid
      }));
    }

    function cardByUid(cards, uid) {
      return (cards || []).find(c => c.uid === uid) || null;
    }

    function anchorCard(req, player, card, anchor) {
      req.playerId = player && player.id;
      req.cardUid = card ? card.uid : null;
      req.anchor = anchor || (card ? 'hand' : 'status');
      return req;
    }

    const PURPOSE_NAMES = {
      loot: '战利品',
      harmony: '同谐',
      discard: '弃置牌',
      '纯美': '纯美骑士客串',
      gugu: '菇菇嘎嘎',
      shield: '六相冰弓',
      elation: '欢愉诡计',
      remembrance: '记忆'
    };
    function purposeName(purpose, fallback) {
      return PURPOSE_NAMES[purpose] || fallback || '选择牌';
    }

    const hook = (name, fn) => {
      const base = AI[name];
      if (typeof base !== 'function') return;
      AI[name] = function () {
        const args = Array.prototype.slice.call(arguments);
        const player = args[1] || args[0];
        if (human(player)) return fn.call(this, base, args);
        return base.apply(this, args);
      };
    };

    hook('chooseResponseCard', function (base, args) {
      const player = args[1], name = args[2];
      return askYesNo(anchorCard({
        type: 'yesno',
        title: `响应【${name}】`,
        body: `是否打出【${name}】响应？`,
        yesLabel: '打出', noLabel: '不打出'
      }, player, M.handCard(player, name), 'hand'), base, this, args);
    });
    hook('chooseDodge', function (base, args) {
      const target = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '闪身步', body: `${target.name}：是否打出【闪身步】抵消？`, yesLabel: '打出', noLabel: '不打出'
      }, target, M.handCard(target, '闪身步'), 'hand'), base, this, args);
    });
    hook('chooseHuangZi', function (base, args) {
      const target = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '黄紫衬衫', body: `${target.name}：是否发动【黄紫衬衫】判定？`
      }, target, M.equipCard(target, 'armor'), 'equipment'), base, this, args);
    });
    hook('chooseRemembrance', function (base, args) {
      const target = args[1], card = args[2];
      return askYesNo(anchorCard({
        type: 'yesno', title: '记忆', body: `${target.name}：是否发动【记忆】取消【${card.name}】？`, yesLabel: '发动', noLabel: '不发动'
      }, target, null, 'status'), base, this, args);
    });
    hook('chooseLightShield', function (base, args) {
      const target = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '光能盾牌', body: `${target.name}：是否发动【光能盾牌】弃两张牌防止伤害？`, yesLabel: '发动', noLabel: '不发动'
      }, target, M.equipCard(target, 'armor'), 'equipment'), base, this, args);
    });
    hook('chooseIXForTrick', function (base, args) {
      const player = args[1], card = args[2];
      return askYesNo(anchorCard({
        type: 'yesno', title: '第IX机关', body: `${player.name}：是否使用【第IX机关】取消【${card.name}】？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseIXForJudgment', function (base, args) {
      const player = args[1], actor = args[2], reason = args[3];
      return askYesNo(anchorCard({
        type: 'yesno', title: '第IX机关', body: `${player.name}：是否使用【第IX机关】跳过${actor.name}的【${reason}】判定？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseIXForIX', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '第IX机关连锁', body: `${player.name}：是否使用【第IX机关】继续连锁？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseIXForAha', function (base, args) {
      const player = args[1];
      // 没有【第IX机关】时不弹无意义的确认框，直接进入阿哈结算与展示。
      if (!player || !(player.hand || []).some(c => c.name === '第IX机关')) return false;
      return askYesNo(anchorCard({
        type: 'yesno', title: '阿哈真没面子', body: `${player.name}：是否使用【第IX机关】取消自己的阿哈效果？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseIXForMoyin', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '魔阴身', body: `${player.name}：是否使用【第IX机关】解除【魔阴身】？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseIXForDot', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '取消dot', body: `${player.name}：是否使用【第IX机关】取消dot？`, yesLabel: '使用', noLabel: '不使用'
      }, player, M.handCard(player, '第IX机关'), 'hand'), base, this, args);
    });
    hook('chooseMemoryPool', function (base, args) {
      const player = args[1];
      if (!M.choiceCollector || !player || !player.isHuman) return base.apply(this, args);
      const card = (player.hand || []).find(c => c.name === '入梦池');
      if (!card) return base.apply(this, args);
      return M.requestAnswer(anchorCard({
        type: 'yesno',
        inline: 'memoryPool',
        title: '入梦池',
        body: `${player.name}：是否使用【入梦池】？`,
        yesLabel: '使用',
        noLabel: '不使用'
      }, player, card, 'hand'), () => base.apply(this, args));
    });
    hook('chooseHarmony', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '同谐', body: `${player.name}：是否发动【同谐】弃一张牌换取额外安打？`, yesLabel: '发动', noLabel: '不发动'
      }, player, null, 'status'), base, this, args);
    });
    hook('chooseMimicBlackHole', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '拟似黑洞', body: `${player.name}：是否发动【拟似黑洞】救援濒死角色？`, yesLabel: '发动', noLabel: '不发动'
      }, player, null, 'status'), base, this, args);
    });
    hook('chooseRescue', function (base, args) {
      const rescuer = args[1], target = args[2], choices = args[3] || [];
      if (!M.choiceCollector) return base.apply(this, args);
      if (!choices.length) return null;
      const uid = M.requestAnswer({
        type: 'options',
        title: `救援 ${target.name}`,
        body: `${rescuer.name}：选择用于救援的牌，或取消。`,
        options: [{ label: '不救', value: '__no__' }].concat(
          choices.map(c => ({ label: `${c.name} ${c.element || ''}${c.rank || ''}`, value: c.uid }))
        )
      }, null);
      if (uid === '__no__') return null;
      return cardByUid(choices, uid) || choices[0];
    });

    function chooseTarget(state, player, filter, title, base, self, args) {
      if (!M.choiceCollector) return base.apply(self, args);
      const list = state.players.filter(p => p.alive && !G.isProtected(p) && filter(p));
      if (!list.length) return null;
      const id = M.requestAnswer({
        type: 'options',
        title: title || '选择目标',
        body: '请选择目标。',
        seatTargets: list.map(p => p.id),
        options: list.map(p => ({ label: `${p.name} ${p.hp}/${p.maxHp}`, value: p.id }))
      }, null);
      return list.find(p => p.id === id) || list[0];
    }
    hook('chooseWeightlessTarget', function (base, args) {
      const state = args[0], player = args[1];
      return chooseTarget(state, player, p => p.id !== player.id, '【引力坍缩】选择目标', base, this, args);
    });
    hook('chooseGraceTarget', function (base, args) {
      const state = args[0], player = args[1];
      return chooseTarget(state, player, () => true, '【秩序恩典】选择目标', base, this, args);
    });
    hook('chooseStealCard', function (base, args) {
      const state = args[0], player = args[1], target = args[2], cardName = args[3] || '';
      if (!M.choiceCollector) return base.apply(this, args);
      const butterfly = cardName === '随蝴蝶一起消散吧';
      const title = butterfly ? '随蝴蝶一起消散吧' : '星核猎手';
      const verb = butterfly ? '失去' : '获得';
      const equipOptions = [];
      for (const slot of ['weapon', 'armor', 'vehicle']) {
        const eq = target.equipment && target.equipment[slot];
        if (eq) equipOptions.push({ label: `装备：${eq.name}`, value: `equipment:${slot}` });
      }
      const handCount = (target.hand && target.hand.length) || target.handCount || 0;
      const hasHand = handCount > 0;
      if (!hasHand && !equipOptions.length) return null;
      const getBody = `选择从 ${target.name} 处获得手牌还是装备牌。手牌将由系统随机获得。`;
      const loseBody = `选择 ${target.name} 失去手牌还是装备牌。手牌将由系统随机失去。`;
      // 手牌与装备都存在时先选手牌/装备类别；只有一类可用时直接进入该类别的选择。
      if (hasHand && equipOptions.length) {
        const first = M.requestAnswer({
          type: 'options',
          title,
          body: butterfly ? loseBody : getBody,
          options: [
            { label: `手牌（${handCount} 张，随机${verb}）`, value: 'hand' },
            { label: '装备牌（自行选择）', value: 'equipment' }
          ]
        }, null);
        if (first === 'hand') return { zone: 'hand' };
        if (first !== 'equipment') return null;
      } else if (hasHand) {
        return { zone: 'hand' };
      }
      if (!equipOptions.length) return null;
      const val = M.requestAnswer({
        type: 'options',
        title,
        body: butterfly ? `选择 ${target.name} 失去的装备。` : `选择从 ${target.name} 处获得的装备。`,
        options: equipOptions
      }, null);
      const slot = String(val || '').split(':')[1];
      return slot ? { zone: 'equipment', slot } : null;
    });
    hook('chooseDecapTargets', function (base, args) {
      const player = args[1], targets = args[2] || [];
      if (!M.choiceCollector) return base.apply(this, args);
      const seen = new Set();
      const pool = [];
      for (const t of targets) {
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        pool.push(t);
      }
      if (!pool.length) return [];
      const use = M.requestAnswer(anchorCard({
        type: 'yesno',
        title: '斩首行动 · 装备技能',
        body: `${player.name}：是否发动【斩首行动】选择其他目标？至多选择两名，伤害按选择顺序结算。`,
        yesLabel: '发动', noLabel: '不发动'
      }, player, M.equipCard(player, 'weapon'), 'equipment'), null);
      if (!use) return [];
      const firstId = M.requestAnswer({
        type: 'options', title: '斩首行动', body: '选择第一名额外目标（伤害按选择顺序结算），或选择不追加。',
        options: [{ label: '不追加', value: '__none__' }].concat(
          pool.map(t => ({ label: `${t.name} ${t.hp}/${t.maxHp}`, value: t.id }))
        )
      }, null);
      if (firstId === '__none__') return [];
      const first = pool.find(x => x.id === firstId);
      if (!first) return [];
      const rest = pool.filter(t => t.id !== first.id);
      if (!rest.length) return [first];
      const secondId = M.requestAnswer({
        type: 'options', title: '斩首行动', body: '可再选择第二名额外目标（不能与第一名相同），或完成选择。',
        options: [{ label: '完成选择', value: '__none__' }].concat(
          rest.map(t => ({ label: `${t.name} ${t.hp}/${t.maxHp}`, value: t.id }))
        )
      }, null);
      const second = rest.find(x => x.id === secondId);
      return second ? [first, second] : [first];
    });
    hook('chooseCard', function (base, args) {
      const cards = args[2] || [], purpose = args[3];
      if (!M.choiceCollector) return base.apply(this, args);
      if (!cards.length) return null;
      const cancelable = purpose === 'shield';
      const uid = M.requestAnswer({
        type: 'options', title: purposeName(purpose, '选择一张牌'), body: '请选择一张牌。',
        cancelable,
        options: optionsOfCards(cards)
      }, null);
      if (cancelable && uid == null) return null;
      return cardByUid(cards, uid) || cards[0];
    });
    hook('chooseOneCard', function (base, args) {
      const cards = args[2] || [], purpose = args[3];
      if (!M.choiceCollector) return base.apply(this, args);
      if (!cards.length) return null;
      const uid = M.requestAnswer({
        type: 'options', title: purposeName(purpose, '选择一张牌'), body: '请选择一张牌。',
        options: optionsOfCards(cards)
      }, null);
      return cardByUid(cards, uid) || cards[0];
    });
    hook('chooseCards', function (base, args) {
      if (!M.choiceCollector) return base.apply(this, args);
      const cards = args[2] || [], count = args[3] || 0, purpose = args[4];
      const picked = [];
      const pool = cards.slice();
      for (let i = 0; i < count && pool.length; i++) {
        const uid = M.requestAnswer({
          type: 'options', title: purposeName(purpose, '选择牌'), body: `请选择第 ${i + 1}/${count} 张牌。`,
          options: optionsOfCards(pool)
        }, null);
        const c = cardByUid(pool, uid) || pool[0];
        if (!c) break;
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
      return picked;
    });
    hook('chooseDiscardCards', function (base, args) {
      if (!M.choiceCollector) return base.apply(this, args);
      const cards = args[2] || [], count = args[3] || 0;
      const picked = [];
      const pool = cards.slice();
      for (let i = 0; i < count && pool.length; i++) {
        const uid = M.requestAnswer({
          type: 'options', title: '弃置牌', body: `请选择第 ${i + 1}/${count} 张要弃置的牌。`,
          options: optionsOfCards(pool)
        }, null);
        const c = cardByUid(pool, uid) || pool[0];
        if (!c) break;
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
      return picked;
    });
    hook('chooseGugu', function (base, args) {
      const target = args[1];
      if (!M.choiceCollector) return base.apply(this, args);
      const discard = askYesNo(anchorCard({
        type: 'yesno', title: '菇菇嘎嘎', body: `${target.name}：是否弃一张牌？选择“否”则让来源摸一张牌。`, yesLabel: '弃牌', noLabel: '让来源摸牌'
      }, target, null, 'status'), base, this, args);
      return discard ? 'discard' : 'draw';
    });
    hook('chooseIdenExtra', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '伊甸之星 · 装备技能', body: `${player.name}：是否再次使用一张【再见安打】？`, yesLabel: '再次使用', noLabel: '不追加'
      }, player, M.equipCard(player, 'weapon'), 'equipment'), base, this, args);
    });
    hook('chooseIdenCard', function (base, args) {
      const player = args[1];
      if (!M.choiceCollector || !player) return base.apply(this, args);
      const pool = (player.hand || []).filter(c => c.name === '再见安打');
      if (!pool.length) return null;
      const options = optionsOfCards(pool);
      options.push({ label: '取消', value: '__cancel__' });
      const uid = M.requestAnswer({
        type: 'options',
        title: '伊甸之星 · 选择安打',
        body: `${player.name}：选择再次打出的【再见安打】；选择取消则不追加。`,
        options
      }, null);
      if (uid === '__cancel__' || uid == null) return null;
      return cardByUid(pool, uid) || null;
    });
    hook('chooseQinChen', function (base, args) {
      const player = args[1];
      return askYesNo(anchorCard({
        type: 'yesno', title: '侵晨 · 装备技能', body: `${player.name}：是否发动【侵晨】，弃两张手牌令此【再见安打】依然造成伤害？`, yesLabel: '发动', noLabel: '不发动'
      }, player, M.equipCard(player, 'weapon'), 'equipment'), base, this, args);
    });
    hook('chooseQinChenCards', function (base, args) {
      const player = args[1];
      if (!M.choiceCollector || !player || !Array.isArray(player.hand) || player.hand.length < 2) {
        return base.apply(this, args);
      }
      const pool = player.hand.slice();
      const picked = [];
      for (let i = 0; i < 2; i++) {
        const options = optionsOfCards(pool);
        options.push({ label: '取消', value: '__cancel__' });
        const uid = M.requestAnswer({
          type: 'options',
          title: '侵晨 · 选择手牌',
          body: `选择第 ${i + 1}/2 张手牌发动【侵晨】；选择取消则不发动。`,
          options
        }, null);
        if (uid === '__cancel__' || uid == null) return [];
        const c = cardByUid(pool, uid);
        if (!c) return [];
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
      return picked;
    });
    hook('chooseHimekoCards', function (base, args) {
      const player = args[1];
      if (!M.choiceCollector || !player || !Array.isArray(player.hand) || player.hand.length < 2) {
        return base.apply(this, args);
      }
      const pool = player.hand.slice();
      const picked = [];
      for (let i = 0; i < 2; i++) {
        const options = optionsOfCards(pool);
        options.push({ label: '取消', value: '__cancel__' });
        const uid = M.requestAnswer({
          type: 'options',
          title: '拓星启行 · 选择手牌',
          body: `选择第 ${i + 1}/2 张手牌用于【拓星启行】；选择取消则不发动。`,
          options
        }, null);
        if (uid === '__cancel__' || uid == null) return [];
        const c = cardByUid(pool, uid);
        if (!c) return [];
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
      return picked;
    });
    hook('chooseLightShieldCards', function (base, args) {
      const target = args[1];
      const cards = Array.isArray(args[2]) ? args[2].slice() : [];
      if (!M.choiceCollector || !target || cards.length < 2) return base.apply(this, args);
      const pool = cards.slice();
      const picked = [];
      for (let i = 0; i < 2; i++) {
        const options = optionsOfCards(pool);
        options.push({ label: '取消', value: '__cancel__' });
        const uid = M.requestAnswer({
          type: 'options',
          title: '光能盾牌 · 选择牌',
          body: `选择第 ${i + 1}/2 张牌发动【光能盾牌】（手牌或装备）；选择取消则不发动。`,
          options
        }, null);
        if (uid === '__cancel__' || uid == null) return [];
        const c = cardByUid(pool, uid);
        if (!c) return [];
        picked.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
      return picked;
    });
  };


  // ---------- 初始化 ----------
  M.acceptDisclaimer = function () {
    M.disclaimerAccepted = true;
    showScreen('start');
    // 首次点击同时解锁音乐与 Web Audio；声明页确认前不自动播放 BGM。
    M.ensureMusic();
  };

  M.bindEvents = function () {
    const agreeBtn = $('disclaimerAgreeBtn');
    if (agreeBtn) agreeBtn.addEventListener('click', M.acceptDisclaimer);
    $('startGameBtn').addEventListener('click', () => { M.ensureMusic(); showScreen('select'); });
    $('rulesBtn').addEventListener('click', () => {
      M.applyRulesText();
      M.renderCardGallery();
      showScreen('info');
    });
    $('settingsBtn').addEventListener('click', () => showScreen('settings'));
    $('recordsBtn').addEventListener('click', () => { M.renderRecords(); showScreen('records'); });
    document.querySelectorAll('.back-btn').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.back || 'start')));
    $('waitBtn').addEventListener('click', () => showScreen('start'));
    $('beginGameBtn').addEventListener('click', M.createGame);
    $('character').addEventListener('change', M.renderCharacterInfo);
    $('musicToggle').addEventListener('change', M.onMusicToggle);
    const volume = $('musicVolume');
    if (volume) volume.addEventListener('input', M.onMusicVolume);
    $('soundToggle').addEventListener('change', M.onSoundToggle);
    $('languageSelect').addEventListener('change', M.onLanguageSelect);
    $('playAgainBtn').addEventListener('click', () => { M.reset(); showScreen('select'); });
    $('restBtn').addEventListener('click', () => { M.reset(); showScreen('start'); });

    const gallery = $('cardGallery');
    if (gallery) {
      gallery.addEventListener('click', e => {
        const item = e.target.closest('[data-gallery-id]');
        if (!item) return;
        const card = ((SR.data && SR.data.cards) || []).find(c => c.id === item.dataset.galleryId);
        if (card) M.showCardDetail(card);
      });
    }

    $('modalClose').addEventListener('click', () => {
      const fn = M.modalCloseHandler;
      M.closeModal();
      if (fn) fn();
    });

    window.addEventListener('resize', () => {
      if (M.inlineChoice) M.positionInlineChoice();
      M.positionSeatReveals();
      M.positionChatPanel();
      M.syncAhaPortraitBounds();
    });
    const humanPanelEl = $('humanPanel');
    if (humanPanelEl) humanPanelEl.addEventListener('scroll', () => {
      if (M.chat.open) M.positionChatPanel();
    });
    document.addEventListener('pointerdown', M.onChatOutsidePointer, true);
    document.addEventListener('click', M.onChatSuppressClick, true);
    document.addEventListener('click', M.onChatToggleClick);

    $('seatLayer').addEventListener('click', e => {
      if (M.endHold) return;
      if (e.target.closest('[data-chat-toggle]')) return;
      const seat = e.target.closest('.seat.targetable[data-seat-target]');
      if (!seat) return;
      const id = seat.dataset.seatTarget;
      if (!id) return;
      if (M.pending) {
        if (M.pending.skill) M.onSkillTarget(id);
        else M.onTarget(id);
        return;
      }
      // 目标技能/效果的下拉选项也可通过左键角色状态框直接完成。
      if (M.inlineChoice && M.inlineChoice.seatTargets) {
        const index = (M.inlineChoice.options || []).findIndex(o => !o.cancel && o.value === id);
        if (index >= 0) M.resolveInlineOption(index);
      }
    });

    const panel = $('humanPanel');
    panel.addEventListener('click', e => {
      if (M.endHold) return;
      const opt = e.target.closest('[data-inline-option]');
      if (opt) {
        M.resolveInlineOption(Number(opt.dataset.inlineOption));
        return;
      }
      const inline = e.target.closest('[data-inline-choice]');
      if (inline) {
        M.resolveInlineChoice(inline.dataset.inlineChoice === 'use');
        return;
      }
      const picked = e.target.closest('.play-card.inline-pickable[data-card-uid]');
      if (picked) {
        const index = M.inlineHandOptionIndex(picked.dataset.cardUid);
        if (index >= 0) M.resolveInlineOption(index);
        return;
      }
      const target = e.target.closest('[data-target-id]');
      if (target) {
        if (M.pending && M.pending.skill) M.onSkillTarget(target.dataset.targetId);
        else M.onTarget(target.dataset.targetId);
        return;
      }
      const cardFace = e.target.closest('.play-card');
      if (cardFace && M.phase === 'judge' && !M.pauseReveal && !M.endHold) {
        M.toast('请先判定');
        return;
      }
      const card = e.target.closest('[data-card-uid]');
      if (card && card.classList.contains('card-button') && !card.disabled) { M.onHandCard(card.dataset.cardUid); return; }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'judge') M.humanJudge();
      else if (action.dataset.action === 'endPlay') M.endPlay();
      else if (action.dataset.action === 'confirmDiscard') M.confirmDiscard();
      else if (action.dataset.action === 'chainsaw') M.startChainsaw();
      else if (action.dataset.action === 'chainsawConfirm') M.confirmChainsawCards();
      else if (action.dataset.action === 'chainsawCancel') M.cancelChainsaw();
      else if (action.dataset.action === 'cancel') { M.pending = null; M.render(); }
      else if (action.dataset.action === 'skill') {
        if (M.phase === 'judge') M.toast('请先判定');
        else M.onSkill(action.dataset.skill);
      }
      else if (action.dataset.action === 'characterSkill') {
        // 判定阶段允许规则指定的回合开始技能；其他技能先提示完成判定。
        if (M.phase === 'judge' && !action.classList.contains('active')) M.toast('请先判定');
        else if (action.classList.contains('disabled-skill')) M.showSkillDetailFromButton(action);
        else M.onCharacterSkill(action.dataset.skill);
      }
      else if (action.dataset.action === 'skillPoint') {
        if (M.phase === 'judge') M.toast('请先判定');
        else M.onSkillPoint();
      }
      else if (action.dataset.action === 'dotRemove') M.onDotRemove(action.dataset.cardUid);
    });
    panel.addEventListener('contextmenu', e => {
      const skill = e.target.closest('[data-action="characterSkill"]');
      if (skill) { e.preventDefault(); M.showSkillDetailFromButton(skill); return; }
      const card = e.target.closest('[data-card-uid]');
      if (card) { e.preventDefault(); M.showCardDetail(findCardByUid(card.dataset.cardUid)); return; }
      const identity = e.target.closest('[data-identity-pid]');
      if (identity) { e.preventDefault(); M.showIdentityDetail(G.getPlayer(M.state, identity.dataset.identityPid)); return; }
      const status = e.target.closest('[data-status-id]');
      if (status) { e.preventDefault(); M.showStatusDetail(status.dataset.statusId, status.dataset.pid); return; }
      const avatar = e.target.closest('[data-pid]');
      if (avatar) { e.preventDefault(); M.showCharacterDetail(G.getPlayer(M.state, avatar.dataset.pid)); }
    });
    const seatLayer = $('seatLayer');
    seatLayer.addEventListener('contextmenu', e => {
      // 状态标签本身也带 data-pid，必须先于头像判断，否则右键状态会打开角色资料。
      const status = e.target.closest('[data-status-id]');
      if (status) { e.preventDefault(); M.showStatusDetail(status.dataset.statusId, status.dataset.pid); return; }
      const avatar = e.target.closest('[data-pid]');
      if (avatar) { e.preventDefault(); M.showCharacterDetail(G.getPlayer(M.state, avatar.dataset.pid)); return; }
      const identity = e.target.closest('[data-identity-pid]');
      if (identity) { e.preventDefault(); M.showIdentityDetail(G.getPlayer(M.state, identity.dataset.identityPid)); return; }
      const card = e.target.closest('[data-card-uid]');
      if (card) { e.preventDefault(); M.showCardDetail(findCardByUid(card.dataset.cardUid)); }
    });
  };

  M.reset = function () {
    M.clearAiChat();
    M.clearTimer();
    M.clearEndHold();
    M.stopAhaScene();
    M.stopHuahuoMusic();
    M.stopLeishenMusic();
    M.leishenResultHold = null;
    M.closeChat();
    M.clearChatBubble();
    M.stopMagicVoice();
    M.stopPathCollisionVoice();
    if (M.chat.cooldownTimer) clearTimeout(M.chat.cooldownTimer);
    M.chat.cooldownTimer = null;
    M.chat.cooldownUntil = 0;
    M.chat.tab = 'emote';
    M.chat.pid = null;
    M.chat.eventVoiceKey = '';
    M.chat.eventEmoteKey = '';
    M.cardSfxSeq = null;
    M.deathHoldSeen = false;
    M.clearTurnBanner();
    M.clearCombatFx();
    M.suppressCombatFx = false;
    M._holyFxRoundKey = null;
    M._himekoLaserKey = null;
    M.closeModal();
    M.state = null;
    M.human = null;
    M.current = null;
    M.phase = 'idle';
    M.pending = null;
    M.inlineChoice = null;
    M.clearPause();
    M.prePlaySkillWindow = false;
    M.discardMode = false;
    M.selectedDiscard = new Set();
    M.chainsawMode = false;
    M.chainsawSelected = new Set();
    M.finishingHumanTurn = false;
    M.deathChoiceShown = false;
    M.spectating = false;
    M.deathContext = null;
    M.bootsInserted = false;
    M.turnIndex = 0;
    $('humanPanel').innerHTML = '';
    $('seatLayer').innerHTML = '';
    const centerReveal = $('centerReveal');
    if (centerReveal) { centerReveal.hidden = true; centerReveal.innerHTML = ''; }
    $('roundLabel').textContent = '';
    $('turnLabel').textContent = '';
    $('gameStatus').textContent = '';
  };

  M.init = function () {
    M.active = true;
    M.populateCharacters();
    M.renderCharacterInfo();
    M.initAudio();
    M.loadSettings();
    document.addEventListener('pointerdown', () => { if (M.disclaimerAccepted) M.ensureMusic(); }, { once: true });
    M.bindEvents();
    M.installHumanHooks();
    M.installVisualHooks();
    M.preloadDanhengSpear();
    M.preloadElationMask();
    M.preloadAhaCharacters();
    // 先显示非官方同人声明，玩家确认后才进入开始页并启动音乐。
    showScreen('disclaimer');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
