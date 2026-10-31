/* 星穹铁道身份局 - 核心规则与流程
 * 3-6 人身份局：基础牌、装备、锦囊、判定、濒死、胜负、场地效果钩子。
 * 规则以 rules.md / 星穹铁道-规则表.docx 为准；未确认内容不在此猜测。
 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const G = SR.game = SR.game || {};
  const U = SR.util;
  const C = SR.cards;

  G.IDENTITY_NAMES = {
    navigator: '领航员',
    loyalist: '无名客',
    rebel: '虚卒',
    traitor: '内鬼'
  };

  G.FACTION_NAMES = {
    navigator: '领航员&无名客',
    loyalist: '无名客',
    rebel: '虚卒',
    traitor: '内鬼',
    none: '救世主',
    draw: '平局'
  };

  G.factionLabel = function (faction) {
    return G.FACTION_NAMES[faction] || faction;
  };

  G.IDENTITY_DISTRIBUTION = {
    3: ['navigator', 'rebel', 'traitor'],
    4: ['navigator', 'loyalist', 'rebel', 'traitor'],
    5: ['navigator', 'loyalist', 'rebel', 'rebel', 'traitor'],
    6: ['navigator', 'loyalist', 'loyalist', 'rebel', 'rebel', 'traitor']
  };

  G.phaseNames = {
    judge: '判定阶段',
    draw: '摸牌阶段',
    play: '出牌阶段',
    discard: '弃牌阶段'
  };

  G.log = function (state, text) {
    const entry = { round: state.round, text: String(text) };
    state.log.push(entry);
    if (state.options && state.options.verbose) console.log(`[R${state.round}] ${text}`);
  };

  G.getPlayer = function (state, id) {
    return state.players.find(p => p.id === id) || null;
  };

  G.alivePlayers = function (state) {
    return state.players.filter(p => p.alive);
  };

  G.hasStatus = function (p, id) {
    return !!(p && p.statuses && p.statuses.some(s => s.id === id));
  };

  G.addStatus = function (p, id, name, extra) {
    if (!p || G.hasStatus(p, id)) return;
    p.statuses.push(Object.assign({ id, name }, extra || {}));
  };

  G.removeStatus = function (p, id) {
    if (!p) return;
    p.statuses = p.statuses.filter(s => s.id !== id);
  };

  // 护盾按层记录：每层 1 点、各自计时。兼容旧状态里只有 shield/shieldTurns 的写法。
  G.ensureShieldLayers = function (p) {
    if (!p) return [];
    if (!Array.isArray(p.shieldLayers)) p.shieldLayers = [];
    p.shieldLayers = p.shieldLayers
      .filter(l => l && Number.isFinite(Number(l.turns)))
      .map(l => ({ turns: Math.max(0, Math.floor(Number(l.turns))) }));
    const total = Math.max(0, Math.min(2, Math.floor(Number(p.shield) || 0)));
    while (p.shieldLayers.length > total) p.shieldLayers.pop();
    const fallback = Math.max(1, Math.floor(Number(p.shieldTurns) || 2));
    while (p.shieldLayers.length < total) p.shieldLayers.push({ turns: fallback });
    return p.shieldLayers;
  };

  G.syncShieldLayers = function (p) {
    if (!p) return 0;
    if (!Array.isArray(p.shieldLayers)) p.shieldLayers = [];
    while (p.shieldLayers.length > 2) p.shieldLayers.pop();
    p.shield = p.shieldLayers.length;
    p.shieldTurns = p.shieldLayers.reduce((max, l) => Math.max(max, Number(l.turns) || 0), 0);
    if (p.shield > 0) {
      G.addStatus(p, 'cute_justice', '可爱即是正义');
    } else {
      p.shieldTurns = 0;
      G.removeStatus(p, 'cute_justice');
    }
    return p.shield;
  };

  // 新增一层护盾；达到上限时只刷新最早到期的一层，不重置其他层。
  G.gainShield = function (p, count) {
    if (!p) return 0;
    G.ensureShieldLayers(p);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    for (let i = 0; i < n; i++) {
      if (p.shieldLayers.length < 2) {
        p.shieldLayers.push({ turns: 2 });
      } else {
        let idx = 0;
        for (let j = 1; j < p.shieldLayers.length; j++) {
          if (p.shieldLayers[j].turns < p.shieldLayers[idx].turns) idx = j;
        }
        p.shieldLayers[idx].turns = 2;
      }
    }
    return G.syncShieldLayers(p);
  };

  G.isProtected = function (p) {
    return G.hasStatus(p, 'zhuhuo') || G.hasStatus(p, 'memory_opening');
  };

  G.actionOrderFrom = function (state, startId) {
    const base = state.actionOrder.slice();
    const i = base.indexOf(startId);
    if (i < 0) return base.slice();
    return base.slice(i).concat(base.slice(0, i));
  };

  G.roundOrderFromNavigator = function (state) {
    const base = state.actionOrder.slice();
    const i = base.indexOf(state.navigatorId);
    if (i < 0) return base.slice();
    return base.slice(i).concat(base.slice(0, i));
  };

  // 群体效果统一按“从领航员起的行动顺序”逐个角色完整结算。
  // 若群体效果结算中又触发了另一个群体效果，先完成当前效果，再按触发顺序补算。
  G.groupOrder = function (state) {
    const ids = (state.actionOrder && state.actionOrder.length)
      ? state.actionOrder
      : state.players.map(p => p.id);
    return ids.map(id => G.getPlayer(state, id)).filter(p => p && p.alive);
  };

  G.withGroupEffect = function (state, fn) {
    state.groupDepth = (state.groupDepth || 0) + 1;
    try {
      return fn();
    } finally {
      state.groupDepth -= 1;
      if (state.groupDepth === 0) G.flushGroupEffects(state);
    }
  };

  G.flushGroupEffects = function (state) {
    while ((state.groupQueue || []).length && !state.over) {
      const key = state.groupQueue.shift();
      if (key === 'cave') {
        if (SR.events && SR.events.checkCave) SR.events.checkCave(state);
      } else if (key === 'reminiscence') {
        if (SR.events && SR.events.checkReminiscence) SR.events.checkReminiscence(state);
      }
    }
  };

  G.dealDamageToTargets = function (state, source, targets, amount, type, options) {
    // B1：多目标伤害逐目标结算；按本轮当前行动顺序（永劫轮回时反向）。
    return G.withGroupEffect(state, function () {
      const ordered = G.groupOrder(state).filter(t => (targets || []).includes(t));
      const results = [];
      for (const target of ordered) {
        if (state.over || !target.alive) continue;
        results.push(G.dealDamage(state, source, target, amount, type, options));
      }
      return results;
    });
  };

  G.distance = function (state, a, b) {
    if (!a || !b || !a.alive || !b.alive) return Infinity;
    const alive = state.players.filter(p => p.alive).sort((x, y) => x.seat - y.seat);
    if (alive.length <= 1) return Infinity;
    const ia = alive.findIndex(p => p.id === a.id);
    const ib = alive.findIndex(p => p.id === b.id);
    if (ia < 0 || ib < 0) return Infinity;
    const n = alive.length;
    const raw = Math.min((ia - ib + n) % n, (ib - ia + n) % n);
    let d = raw;
    if (b.equipment.vehicle && b.equipment.vehicle.subtype.indexOf('+1') >= 0) d += 1;
    if (a.equipment.vehicle && a.equipment.vehicle.subtype.indexOf('-1') >= 0) d -= 1;
    return Math.max(1, d);
  };

  G.attackRange = function (p) {
    // 基础攻击范围 1；武器 +n 表示在此基础上增加 n 点。
    let range = 1 + ((p.equipment.weapon && C.getWeaponRange(p.equipment.weapon)) || 0);
    if (p.characterId === 'himeko') range += 1; // 乘胜追击
    return range;
  };

  G.inRange = function (state, a, b) {
    return G.distance(state, a, b) <= G.attackRange(a);
  };

  G.handLimit = function (p) {
    return Math.max(0, p.hp + (p.handLimitMod || 0));
  };

  G.getEquip = function (p, slot) {
    return p.equipment[slot] || null;
  };

  G.hasEquip = function (p, name) {
    return Object.values(p.equipment).some(c => c && c.name === name);
  };

  // 抽牌/检索前先把弃牌堆洗回：避免牌堆非空但数量或类型不满足要求。
  G.ensureDeckCount = function (state, count) {
    const need = Math.max(0, Number(count) || 0);
    if (state.deck.length >= need || !state.discard.length) return;
    const n = state.discard.length;
    state.deck = U.shuffle(state.deck.concat(state.discard.splice(0)), state.rng);
    for (const c of state.deck) c.zone = 'deck';
    G.log(state, `牌堆不足 ${need} 张，弃牌堆 ${n} 张洗回牌堆后继续。`);
  };

  G.drawOne = function (state, player, zone) {
    G.ensureDeckCount(state, 1);
    if (!state.deck.length) return null;
    const card = state.deck.pop();
    card.ownerId = player ? player.id : null;
    card.zone = zone || 'hand';
    if (player && card.zone === 'hand') player.hand.push(card);
    return card;
  };

  G.draw = function (state, player, count) {
    const want = count || 1;
    G.ensureDeckCount(state, want);
    let n = 0;
    for (let i = 0; i < want; i++) {
      const c = G.drawOne(state, player, 'hand');
      if (!c) break;
      n++;
      G.log(state, `${player.name} 摸到 ${C.cardText(c)}。`);
    }
    return n;
  };

  G.searchCards = function (state, predicate, count, randomize) {
    const want = Math.max(0, Number(count) || 0);
    if (!want) return [];
    // 先检查牌堆中符合要求的数量；不足时立刻把弃牌堆全部洗回，再检索。
    let available = 0;
    for (const c of state.deck) if (predicate(c)) available++;
    if (available < want && state.discard.length) {
      const n = state.discard.length;
      state.deck = U.shuffle(state.deck.concat(state.discard.splice(0)), state.rng);
      for (const c of state.deck) c.zone = 'deck';
      G.log(state, `牌堆符合要求的牌不足 ${want} 张，弃牌堆 ${n} 张洗回牌堆后继续检索。`);
    }
    const out = [];
    let idxs = [];
    for (let i = 0; i < state.deck.length; i++) {
      if (predicate(state.deck[i])) idxs.push(i);
    }
    if (randomize) idxs = U.shuffle(idxs, state.rng);
    // 从后往前删，避免索引错位
    idxs.sort((a, b) => b - a);
    while (idxs.length && out.length < want) {
      const i = idxs.shift();
      const card = state.deck.splice(i, 1)[0];
      card.zone = 'reveal';
      out.push(card);
    }
    return out;
  };

  G.gainCard = function (state, player, card, reason) {
    if (!card) return;
    G.moveCard(state, card, player, 'hand');
    G.log(state, `${player.name} 获得 ${C.cardText(card)}${reason ? '（' + reason + '）' : ''}。`);
  };

  // 获得“遗物”：规则要求置入自己装备区；对应格已有装备（或装备区已满）时改为入手。
  G.gainRelic = function (state, player, card, reason) {
    if (!card) return;
    const slot = C.getSlot(card);
    if (slot && !player.equipment[slot]) {
      G.moveCard(state, card, player, 'equipment');
      G.log(state, `${player.name} 获得遗物 ${C.cardText(card)}，置入${slot === 'weapon' ? '武器' : slot === 'armor' ? '防具' : '载具'}区。`);
    } else {
      G.gainCard(state, player, card, reason || '遗物（装备区已满）');
    }
  };

  G.chooseCards = function (state, player, cards, count, purpose) {
    if (SR.ai && SR.ai.chooseCards) return SR.ai.chooseCards(state, player, cards, count, purpose);
    return cards.slice(0, count);
  };

  // 黄紫衬衫：需要打出【闪身步】时的判定。返回 true 表示本次响应已被视为闪身步。
  G.tryShirtDodge = function (state, target, source) {
    if (!target || !G.hasEquip(target, '黄紫衬衫')) return false;
    const use = SR.ai && SR.ai.chooseHuangZi ? SR.ai.chooseHuangZi(state, target, source) : true;
    if (!use) return false;
    const judged = SR.judge && SR.judge.judge ? SR.judge.judge(state, target, '黄紫衬衫') : null;
    if (judged && ['物理', '火', '风'].includes(judged.element)) {
      G.log(state, `${target.name} 的【黄紫衬衫】判定成功，视为打出【闪身步】。`);
      return true;
    }
    G.log(state, `${target.name} 的【黄紫衬衫】判定失败，不能视为【闪身步】。`);
    return false;
  };

  // 【帝弓光矢】等效果要求“打出闪身步”时，同样允许黄紫衬衫替代；
  // 玩家先询问衬衫，AI 仍保持先闪身步、后衬衫的顺序。
  G.askDodgeResponse = function (state, player, options) {
    const finish = (used) => {
      if (SR.ai && SR.ai.observeNamedResponse) SR.ai.observeNamedResponse(state, player, '闪身步', used);
      return used;
    };
    if (!player || !player.alive || G.isProtected(player)) return finish(false);
    if (player.flags && player.flags.noDodge) return finish(false);
    if (player.noDodgeBy || G.hasStatus(player, 'weightless')) {
      G.log(state, `${player.name} 处于【失重】，不能使用【闪身步】。`);
      return finish(false);
    }
    const hasShirt = G.hasEquip(player, '黄紫衬衫');
    const shirtFirst = !!(hasShirt && player.isHuman && state.options && state.options.manualHuman);
    if (shirtFirst && G.tryShirtDodge(state, player, null)) return finish(true);
    const card = player.hand.find(c => c.name === '闪身步');
    if (card) {
      const use = SR.ai && SR.ai.chooseResponseCard
        ? SR.ai.chooseResponseCard(state, player, '闪身步', options)
        : true;
      if (use) {
        G.moveCard(state, card, null, 'discard');
        G.log(state, `${player.name} 打出 ${C.cardText(card)}（${(options && options.reason) || '响应'}）。`);
        G.noteActivePlay(state, player, [card]);
        return finish(true);
      }
    }
    if (!shirtFirst && G.tryShirtDodge(state, player, null)) return finish(true);
    return finish(false);
  };

  G.askUseNamedCard = function (state, player, name, options) {
    if (name === '闪身步') return G.askDodgeResponse(state, player, options);
    const card = player.hand.find(c => c.name === name);
    if (!card) {
      if (SR.ai && SR.ai.observeNamedResponse) SR.ai.observeNamedResponse(state, player, name, false);
      return false;
    }
    const use = SR.ai && SR.ai.chooseResponseCard
      ? SR.ai.chooseResponseCard(state, player, name, options)
      : true;
    if (SR.ai && SR.ai.observeNamedResponse) SR.ai.observeNamedResponse(state, player, name, use);
    if (!use) return false;
    G.moveCard(state, card, null, 'discard');
    const duelNote = options && options.duel ? '（仅用于满足【命途对撞】，不造成伤害）' : '';
    G.log(state, `${player.name} 打出 ${C.cardText(card)}${duelNote}。`);
    G.noteActivePlay(state, player, [card]);
    return true;
  };

  G.removeFromZones = function (state, card) {
    const remove = (arr) => {
      const i = arr.indexOf(card);
      if (i >= 0) arr.splice(i, 1);
    };
    for (const p of state.players) {
      remove(p.hand);
      remove(p.judge);
      for (const slot of ['weapon', 'armor', 'vehicle']) {
        if (p.equipment[slot] === card) {
          p.equipment[slot] = null;
          if (card.name === '绝对热量') {
            G.heal(state, p, 1, '失去【绝对热量】');
          }
        }
      }
    }
    remove(state.deck);
    remove(state.discard);
    if (state.reveal) remove(state.reveal);
  };

  G.moveCard = function (state, card, player, zone) {
    if (!card) return null;
    G.removeFromZones(state, card);
    card.ownerId = player ? player.id : null;
    card.zone = zone;
    if (zone === 'hand') {
      player.hand.push(card);
    } else if (zone === 'judge') {
      player.judge.push(card);
    } else if (zone === 'equipment') {
      const slot = C.getSlot(card);
      if (!slot) throw new Error(`not equipment: ${card.name}`);
      if (player.equipment[slot]) {
        const old = player.equipment[slot];
        G.moveCard(state, old, null, 'discard');
      }
      player.equipment[slot] = card;
      card.slot = slot;
    } else if (zone === 'discard') {
      state.discard.push(card);
    } else if (zone === 'deck') {
      state.deck.push(card);
    } else if (zone === 'reveal') {
      if (!state.reveal) state.reveal = [];
      state.reveal.push(card);
    } else {
      throw new Error(`unknown zone ${zone}`);
    }
    return card;
  };

  G.discardCard = function (state, player, card) {
    G.moveCard(state, card, null, 'discard');
    G.log(state, `${player ? player.name + ' ' : ''}弃置 ${C.cardText(card)}。`);
  };

  G.heal = function (state, player, amount, reason) {
    if (!player || !player.alive) return 0;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    const healed = player.hp - before;
    if (healed > 0) {
      G.log(state, `${player.name} 回复 ${healed} 点体力（${reason || '回复'}）。`);
      if (SR.events && SR.events.onHeal) SR.events.onHeal(state, player, healed);
      if (!state.healTriggeredRound) {
        state.healTriggeredRound = true;
        const sunday = state.players.find(p => p.characterId === 'sunday' && p.alive);
        if (sunday) {
          G.draw(state, sunday, 1);
          G.log(state, `${sunday.name} 的【乐园之门】触发，摸一张牌（本轮首次回复）。`);
          if (SR.manual && typeof SR.manual.showHolyFx === 'function') {
            SR.manual.showHolyFx(sunday, state);
          }
        }
      }
      // 药王慈怀治疗时，在受治疗者状态框播放藤蔓与银杏叶生长特效。
      if (reason === '药王慈怀' && SR.manual && typeof SR.manual.showMedicineFx === 'function') {
        SR.manual.showMedicineFx(player);
      }
    }
    return healed;
  };

  G.chooseAICard = function (state, player, cards, purpose) {
    if (SR.ai && SR.ai.chooseCard) return SR.ai.chooseCard(state, player, cards, purpose);
    return cards[0] || null;
  };

  G.createGame = function (options) {
    const opts = options || {};
    const data = SR.data;
    const rng = U.rng(opts.seed == null ? ((Date.now() ^ 0x9e3779b9) >>> 0) : opts.seed);
    const playerCount = opts.playerCount || 3;
    if (!G.IDENTITY_DISTRIBUTION[playerCount]) throw new Error('playerCount 3-6 only');

    // 角色：人类可选，其余随机；开拓者男女不同时在场
    const chars = data.characters.slice();
    let humanChar = null;
    if (opts.characterId) humanChar = chars.find(c => c.id === opts.characterId) || null;
    if (!humanChar && opts.humanCharacterId) humanChar = chars.find(c => c.id === opts.humanCharacterId) || null;
    if (!humanChar) {
      // 随机选人时把“开拓者”视作一个角色（男女合计 1 份），再以 1/2 决定性别；
      // 这样开拓者总出现率与其他角色相同，不会因两张性别牌变成双倍概率。
      const base = chars.filter(c => c.id.indexOf('trailblazer') !== 0);
      const pick = U.pick(base.concat([null]), rng);
      humanChar = pick || (rng() < 0.5 ? chars.find(c => c.id === 'trailblazer_m') : chars.find(c => c.id === 'trailblazer_f'));
    }
    const used = new Set([humanChar.id]);
    if (humanChar.id === 'trailblazer_m') {
      used.add('trailblazer_f');
    } else if (humanChar.id === 'trailblazer_f') {
      used.add('trailblazer_m');
    } else {
      // 玩家没有选择开拓者时，只让随机性别的一位开拓者进入 AI 池；
      // 另一位排除，保证男女不同时在场，且开拓者总概率与其他角色相同。
      const tb = rng() < 0.5 ? 'trailblazer_m' : 'trailblazer_f';
      used.add(tb === 'trailblazer_m' ? 'trailblazer_f' : 'trailblazer_m');
    }
    const aiChars = U.shuffle(chars.filter(c => !used.has(c.id)), rng);
    const chosen = [humanChar].concat(aiChars.slice(0, playerCount - 1));
    if (chosen.length < playerCount) throw new Error('not enough characters');

    const identityList = U.shuffle(G.IDENTITY_DISTRIBUTION[playerCount].slice(), rng);
    const seats = U.shuffle(Array.from({ length: playerCount }, (_, i) => i), rng);

    const players = chosen.map((ch, i) => {
      const id = `P${i + 1}`;
      const identity = identityList[i];
      let path = ch.id.indexOf('trailblazer') === 0
        ? ((i === 0 && opts.pathId && data.paths.some(x => x.id === opts.pathId))
            ? opts.pathId
            : U.pick(data.paths, rng).id)
        : null;
      // 保险：每位开拓者（含 AI）每局都必须拥有命途。
      if (ch.id.indexOf('trailblazer') === 0 && !path && data.paths.length) {
        path = U.pick(data.paths, rng).id;
      }
      const pathData = path ? data.paths.find(x => x.id === path) : null;
      // 开拓者的角色名本身已含性别，例如“开拓者（男）”；命途以点号接在同一行。
      const baseDisplayName = ch.name;
      const displayName = pathData ? `${baseDisplayName}.${pathData.name}` : ch.name;
      return {
        id,
        seat: seats[i],
        name: displayName,
        characterId: ch.id,
        character: ch,
        identity,
        identityName: G.IDENTITY_NAMES[identity],
        isHuman: i === 0,
        isNavigator: identity === 'navigator',
        maxHp: ch.hp,
        hp: ch.hp,
        hand: [],
        equipment: { weapon: null, armor: null, vehicle: null },
        judge: [],
        shield: 0,
        shieldLayers: [],
        statuses: [],
        path,
        alive: true,
        turnActive: false,
        turnSerial: 0,
        anDaUsed: 0,
        snackUsed: false,
        snackBuff: false,
        skipPlay: false,
        skipAction: false,
        handLimitMod: 0,
        shieldTurns: 0,
        memoryOpeningUsedTurn: false,
        remembranceUsedTurn: false,
        himekoUsedTurn: false,
        shieldUsedTurn: 0,
        graceUses: 0,
        mimicUsed: false,
        extraAnDa: 0,
        destructionPenalty: false,
        preservationPenalty: false,
        noDodgeBy: null,
        interpretation: 0,
        dots: 0,
        skillPoints: 0,
        divineGains: 0,
        damageTakenRound: 0,
        flags: {}
      };
    });
    players.sort((a, b) => a.seat - b.seat);

    const navigator = players.find(p => p.identity === 'navigator');
    navigator.maxHp += 1;
    navigator.hp = navigator.maxHp;

    const state = {
      seed: opts.seed == null ? null : opts.seed,
      rng,
      players,
      humanId: (players.find(p => p.isHuman) || players[0]).id,
      navigatorId: navigator.id,
      deck: [],
      discard: [],
      reveal: [],
      publicPlay: null,
      publicPlays: {},
      publicJudge: null,
      publicSeq: 0,
      round: 0,
      actionOrder: [],
      actionIndex: 0,
      currentId: null,
      phase: 'setup',
      fieldEffect: null,
      over: false,
      winner: null,
      draw: false,
      log: [],
      options: opts,
      turnCounter: 0,
      pending: [],
      boots: null,
      aiActions: { hostile: {}, help: {} },
      aiMinds: {},
      aiPublic: { dodge: {}, noDodge: {}, noAnDa: {}, attacks: {}, rescues: {}, responses: {} },
      aiLog: [],
      aiRejected: [],
      humanDied: false,
      humanDeathLogIndex: null,
      healTriggeredRound: false,
      normalWinSuppressed: false,
      lastFieldId: null,
      eventHistory: [],
      reminiscence: null,
      cave: null,
      reminiscence24Used: false,
      magicCounts: {},
      magicRewarded: {},
      magicRewardEnded: false,
      groupDepth: 0,
      groupQueue: [],
      lastHpLossRound: 0,
      aggressionStartRound: null,
      aggressionLevel: 0,
      aggressionMultiplier: 1,
      paceLevel: 0,
      damageMultiplier: 1,
      gainMultiplier: 1,
      defenseMultiplier: 1
    };

    const filter = opts.deckFilter || null;
    state.deck = C.makeDeck(data, rng, filter);
    state.actionOrder = G.actionOrderFrom({ actionOrder: players.map(p => p.id) }, navigator.id);
    G.log(state, `开局：${players.length} 人局，身份随机分配；${navigator.name} 为领航员（公开），体力上限 +1。`);
    for (const p of players) {
      G.log(state, `${p.name}：体力 ${p.hp}/${p.maxHp}。`);
    }
    // 发牌：从领航员起按行动顺序，每人 4 张
    for (const id of state.actionOrder) {
      G.draw(state, G.getPlayer(state, id), 4);
    }
    state.round = 1;
    state.actionIndex = 0;
    state.currentId = null;
    state.phase = 'roundStart';
    return state;
  };

  G.pickFieldEffect = function (state) {
    if (state.options.forceEvent) {
      return SR.data.events.find(e => e.id === Number(state.options.forceEvent)) || null;
    }
    if (!state.options.enableEvents) return null;
    const pool = SR.data.events.filter(e => e.id !== state.lastFieldId);
    return U.pick(pool, state.rng);
  };

  G.startFieldEffect = function (state, ev) {
    if (!ev) return;
    state.fieldEffect = ev;
    state.lastFieldId = ev.id;
    state.eventHistory.push(ev.id);
    G.log(state, `本轮场地效果：${ev.name}。`);
    // 场地效果更新时先放大公示约 3 秒；手动界面期间完全锁定操作。
    G.pause(state, { kind: 'field', duration: 2250, reason: ev.name, eventId: ev.id });
    if (ev.id !== 9 && SR.events && SR.events.onStart) SR.events.onStart(state, ev);
    if (ev.id === 9) {
      state.normalWinSuppressed = true;
      for (const p of state.players) {
        if (p.alive) G.addStatus(p, 'evernight', '永劫轮回');
      }
      // 正常顺序的反向：原本最后行动者先手，领航员最后
      state.actionOrder = state.actionOrder.slice().reverse();
      G.log(state, '【永劫轮回】：本轮行动顺序反向，普通胜负挂起，濒死改为进入【逐火】。');
    }
  };

  G.enterZhuhuo = function (state, player, reason) {
    if (!player || !player.alive) return;
    // 只有持有【永劫轮回】的玩家才能进入【逐火】。
    if (!G.hasStatus(player, 'evernight')) {
      G.log(state, `${player.name} 没有【永劫轮回】，不能进入【逐火】。`);
      return;
    }
    if (G.hasStatus(player, 'zhuhuo')) return;
    // 【永劫轮回】转化为【逐火】；入梦池玩家同样可以转化。
    G.removeStatus(player, 'evernight');
    G.addStatus(player, 'zhuhuo', '逐火');
    G.log(state, `${player.name} 的【永劫轮回】转化为【逐火】（${reason || '濒死'}）。`);
    G.checkEvernightWin(state);
  };

  G.checkEvernightWin = function (state) {
    if (state.over || !state.fieldEffect || state.fieldEffect.id !== 9) return null;
    const nonZhuhuo = state.players.filter(p => p.alive && !G.hasStatus(p, 'zhuhuo'));
    if (nonZhuhuo.length !== 1) return null;
    const winner = nonZhuhuo[0];
    state.over = true;
    state.winner = {
      faction: 'none',
      special: 'evernight',
      members: [winner.id],
      names: [winner.name]
    };
    for (const p of state.players) {
      if (p.id !== winner.id) {
        p.alive = false;
        p.hp = 0;
        p.statuses = [];
      }
    }
    G.log(state, `【永劫轮回】特殊胜利：仅剩 ${winner.name} 不处于【逐火】，${winner.name} 直接获胜；其余玩家全部淘汰，无获胜阵营。`);
    return state.winner;
  };

  // 收束机制：当仅剩 2 人且连续 3 轮没有实际体力下降，或轮数 >15 时，
  // 所有角色的进攻评分每轮 +10%，最多 2 倍；一旦启动不会回落，避免防御回复死局。
  G.refreshAggression = function (state) {
    const aliveN = state.players.filter(p => p.alive).length;
    const sinceLoss = state.round - (state.lastHpLossRound || 0);
    const twoPlayerStalemate = aliveN === 2 && sinceLoss >= 3;
    if (state.aggressionStartRound == null && (state.round > 15 || twoPlayerStalemate)) {
      state.aggressionStartRound = state.round;
      G.log(state, `【AI 收束】${twoPlayerStalemate ? '仅剩 2 人且连续 3 轮无体力下降' : '轮数超过 15'}，所有角色进攻性开始每轮 +10%（最高 2 倍）。`);
    }
    if (state.aggressionStartRound != null) {
      state.aggressionLevel = Math.max(0, Math.min(10, state.round - state.aggressionStartRound + 1));
      state.aggressionMultiplier = 1 + state.aggressionLevel * 0.1;
    } else {
      state.aggressionLevel = 0;
      state.aggressionMultiplier = 1;
    }
  };

  // 轮次微调：11 轮起每轮小幅提高伤害/进攻权重，降低收益与防御权重，
  // 10 轮内保持原样；这是 AI 评分的缓慢收束，不直接改规则伤害。
  G.refreshPacing = function (state) {
    const level = Math.max(0, Math.min(10, state.round - 10));
    state.paceLevel = level;
    state.damageMultiplier = 1 + level * 0.02;
    state.gainMultiplier = 1 - level * 0.015;
    state.defenseMultiplier = 1 - level * 0.02;
  };

  G.startRound = function (state) {
    state.phase = 'roundStart';
    state.lastAnnounceUid = null;
    state.announcedUids = {};
    state.publicPlay = null;
    state.publicPlays = {};
    state.publicJudge = null;
    state.actionOrder = G.actionOrderFrom({ actionOrder: state.players.map(p => p.id) }, state.navigatorId);
    state.actionIndex = 0;
    state.currentId = null;
    state.healTriggeredRound = false;
    for (const p of state.players) p.damageTakenRound = 0;
    G.log(state, `===== 第 ${state.round} 轮开始 =====`);
    if (state.round >= 2) {
      const ev = G.pickFieldEffect(state);
      if (ev) G.startFieldEffect(state, ev);
    }
    G.startBoots(state);
    G.refreshAggression(state);
    G.refreshPacing(state);
  };

  G.bootsHolders = function (state) {
    return state.players.filter(p => p.alive && G.hasEquip(p, '反重力皮靴'))
      .sort((a, b) => state.actionOrder.indexOf(a.id) - state.actionOrder.indexOf(b.id));
  };

  G.startBoots = function (state) {
    state.boots = [];
    const holders = G.bootsHolders(state);
    for (const holder of holders) {
      const judged = SR.judge && SR.judge.judge ? SR.judge.judge(state, holder, '反重力皮靴') : null;
      const ok = judged && ['物理', '冰', '虚数', '量子'].includes(judged.element);
      state.boots.push({
        holderId: holder.id,
        active: !!ok,
        used: false,
        normalSlotPassed: false
      });
      if (ok) {
        G.log(state, `${holder.name} 的【反重力皮靴】判定成功，本轮获得一次插入行动机会。`);
      } else {
        G.log(state, `${holder.name} 的【反重力皮靴】判定失败，本轮按正常顺序行动。`);
      }
    }
  };

  G.bootsEntry = function (state, id) {
    return (state.boots || []).find(b => b.holderId === id) || null;
  };

  G.bootsCanAsk = function (state, b) {
    if (!b || !b.active || b.used) return false;
    const holder = G.getPlayer(state, b.holderId);
    return !!(holder && holder.alive && G.hasEquip(holder, '反重力皮靴') &&
      !G.hasStatus(holder, 'zhuhuo') && !G.hasStatus(holder, 'memory_opening'));
  };

  G.bootsTryInsert = function (state, upcoming, excludeId) {
    const entries = (state.boots || [])
      .filter(b => b.holderId !== excludeId && b.holderId !== upcoming.id && G.bootsCanAsk(state, b))
      .sort((a, b) => state.actionOrder.indexOf(a.holderId) - state.actionOrder.indexOf(b.holderId));
    for (const b of entries) {
      const holder = G.getPlayer(state, b.holderId);
      if (!holder) continue;
      const use = SR.ai && SR.ai.chooseBootsInsert
        ? SR.ai.chooseBootsInsert(state, holder, upcoming)
        : false;
      if (!use) continue;
      b.used = true;
      G.log(state, `${holder.name} 发动【反重力皮靴】，插入到 ${upcoming.name} 之前行动。`);
      G.runAction(state, holder);
      return true;
    }
    return false;
  };

  G.bootsEndRound = function (state) {
    state.boots = [];
  };

  G.endRound = function (state) {
    state.phase = 'roundEnd';
    const evernightRound = !!(state.fieldEffect && state.fieldEffect.id === 9);
    if (state.fieldEffect && !evernightRound && SR.events && SR.events.onEnd) {
      SR.events.onEnd(state, state.fieldEffect);
      if (state.over) return;
    }
    if (evernightRound) {
      G.withGroupEffect(state, function () {
        for (const p of G.groupOrder(state)) {
          if (!G.hasStatus(p, 'zhuhuo')) continue;
          G.removeStatus(p, 'zhuhuo');
          p.maxHp = Math.max(1, p.maxHp - 1);
          p.hp = 0;
          G.heal(state, p, 1, '逐火轮末恢复');
          G.log(state, `${p.name} 解除【逐火】，体力 1 / 上限 ${p.maxHp}。`);
        }
      });
      for (const p of state.players) G.removeStatus(p, 'evernight');
      state.fieldEffect = null;
      state.normalWinSuppressed = false;
    }
    G.bootsEndRound(state);
    G.log(state, `===== 第 ${state.round} 轮结束 =====`);
    // 永劫轮回轮末全屏提示；特殊胜利由结果前深红提示接管。
    if (evernightRound && !state.over) {
      G.pause(state, { kind: 'evernight-rebirth', duration: 3000, reason: '再创世' });
    }
  };

  G.endPreviousTurn = function (state, p) {
    if (!p.turnActive) return;
    G.log(state, `${p.name} 的上一回合结束（下一次行动前）。`);
    // P3-3/P3-4: “回合结束”= 下一次行动前；本回合效果在此过期。
    p.turnActive = false;
    p.turnEnded = true;
    // 本回合 buff/护盾在 startTurn 中按“下一次行动开始前”清理。
  };

  G.tryUseMemoryPool = function (state, p) {
    if (p.memoryOpeningUsedTurn) return false;
    const card = p.hand.find(c => c.name === '入梦池');
    if (!card) return false;
    const use = SR.ai && SR.ai.chooseMemoryPool ? SR.ai.chooseMemoryPool(state, p) : false;
    if (!use) return false;
    p.memoryOpeningUsedTurn = true;
    // 入梦池本身算一次主动出牌；即使被他人 IX 取消，也已经打出并进入弃牌堆。
    G.noteActivePlay(state, p, [card]);
    if (state.over || !p.alive) return false;
    // 入梦池是锦囊，可被他人 IX 取消；取消后不进入状态、不回复、不跳过本次行动。
    if (SR.judge && SR.judge.askIXForTrick && SR.judge.askIXForTrick(state, p, card, p)) {
      G.moveCard(state, card, null, 'discard');
      G.log(state, `${p.name} 的【入梦池】被第IX机关取消，不消耗本回合行动。`);
      return false;
    }
    G.moveCard(state, card, null, 'discard');
    // 新规则：使用后立刻判定；点数/序号为奇数才正常生效，偶数失效；判定牌进弃牌堆。
    const judged = SR.judge && SR.judge.judge ? SR.judge.judge(state, p, '入梦池') : null;
    const v = judged ? (judged.rank === 'A' ? 1 : judged.rank === 'J' ? 11 : judged.rank === 'Q' ? 12 : judged.rank === 'K' ? 13 : parseInt(judged.rank, 10)) : 0;
    if (v && v % 2 === 1) {
      G.addStatus(p, 'memory_opening', '记忆是梦的开场白');
      p.skipAction = true;
      G.log(state, `${p.name} 使用【入梦池】，判定为 ${C.cardText(judged)}（奇数），正常生效并跳过本次行动。`);
      return true;
    }
    G.log(state, `${p.name} 使用【入梦池】，判定为 ${judged ? C.cardText(judged) : '无牌'}（偶数/失败），本次失效。`);
    return false;
  };

  G.triggerTurnStartSkills = function (state, p) {
    // 手动模式：玩家的开始行动技能由界面按钮触发；AI 仍按原频率自动触发。
    const humanManual = !!(p.isHuman && state.options && state.options.manualHuman);
    // 瓦尔特：引力坍缩
    if (p.characterId === 'welt' && !humanManual) {
      const target = SR.ai && SR.ai.chooseWeightlessTarget
        ? SR.ai.chooseWeightlessTarget(state, p)
        : state.players.find(x => x.alive && x.id !== p.id);
      if (target && target.alive && !G.isProtected(target)) {
        target.noDodgeBy = { walterId: p.id };
        G.addStatus(target, 'weightless', '失重');
        G.log(state, `${p.name} 发动【引力坍缩】，${target.name} 获得【失重】，直到其下一次行动开始前不能使用【闪身步】。`);
      }
    }
    // 星期日：秩序恩典
    if (p.characterId === 'sunday' && p.graceUses < 3 && !humanManual) {
      const target = SR.ai && SR.ai.chooseGraceTarget
        ? SR.ai.chooseGraceTarget(state, p)
        : p;
      if (target && target.alive && !G.isProtected(target)) {
        p.graceUses += 1;
        G.draw(state, target, 1);
        if (target.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(state, p, target, 0.5);
        G.log(state, `${p.name} 发动【秩序恩典】，${target.name} 摸一张牌（${p.graceUses}/3）。`);
      }
    }
    // 同谐：弃一牌换一张额外安打
    if (p.path === 'harmony' && p.hand.length > 0 && !humanManual) {
      const use = SR.ai && SR.ai.chooseHarmony ? SR.ai.chooseHarmony(state, p) : false;
      if (use) {
        const c = G.chooseAICard(state, p, p.hand, 'harmony');
        if (c) {
          G.discardCard(state, p, c);
          p.extraAnDa = 1;
          G.log(state, `${p.name} 的【同谐】生效，本回合可额外使用一张【再见安打】。`);
        }
      }
    }
  };

  G.startTurn = function (state, p) {
    // 新行动开始：上一张公示牌（出牌/响应/判定）隐藏。
    state.lastAnnounceUid = null;
    state.announcedUids = {};
    state.publicPlay = null;
    state.publicPlays = {};
    state.publicJudge = null;
    p.turnSerial += 1;
    p.turnActive = true;
    p.turnEnded = false;
    p.anDaUsed = 0;
    p.snackUsed = false;
    p.snackBuff = false;
    p.skipPlay = false;
    p.skipAction = false;
    p.starCoreUsedTurn = false;
    p.elationUsedTurn = false;
    p.destructionUsedTurn = false;
    p.preservationUsedTurn = false;
    p.armorUsedTurn = false;
    p.flags.noDodge = false;
    p.extraAnDa = 0;
    p.destructionPenalty = false;
    p.preservationPenalty = false;
    p.himekoUsedTurn = false;
    p.remembranceUsedTurn = false;
    p.shieldUsedTurn = 0;
    p.memoryOpeningUsedTurn = false;
    p.statuses = p.statuses.filter(s => !['discipline_flash', 'cannot_protect', 'incineration'].includes(s.id));

    // 记忆是梦的开场白：下次自己的回合开始，先回复 1（若低于上限），再解除。
    if (G.hasStatus(p, 'memory_opening')) {
      if (p.hp < p.maxHp) G.heal(state, p, 1, '记忆是梦的开场白');
      G.removeStatus(p, 'memory_opening');
      p.skipAction = false;
      G.log(state, `${p.name} 解除【记忆是梦的开场白】，可正常行动。`);
    }

    // 护盾每层独立计时：每次目标回合开始，所有层各减 1，只移除到期的层。
    if (p.shield > 0 || (Array.isArray(p.shieldLayers) && p.shieldLayers.length)) {
      G.ensureShieldLayers(p);
      const before = p.shieldLayers.length;
      for (const layer of p.shieldLayers) layer.turns -= 1;
      p.shieldLayers = p.shieldLayers.filter(layer => layer.turns > 0);
      const expired = before - p.shieldLayers.length;
      G.syncShieldLayers(p);
      if (expired > 0) {
        if (p.shield > 0) {
          G.log(state, `${p.name} 有 ${expired} 层护盾到期，剩余 ${p.shield} 点护盾。`);
        } else {
          G.log(state, `${p.name} 的护盾到期消失。`);
        }
      }
    }

    // 失重：只持续到被施加者的下一次行动开始前，此处先于本回合任何行动解除。
    if (p.noDodgeBy || G.hasStatus(p, 'weightless')) {
      p.noDodgeBy = null;
      G.removeStatus(p, 'weightless');
      G.log(state, `${p.name} 的【失重】在本次行动开始前解除。`);
    }

    G.log(state, `${p.name} 的回合开始。`);
    G.triggerTurnStartSkills(state, p);
    G.tryUseMemoryPool(state, p);
  };

  G.runAction = function (state, p) {
    if (state.over || !p.alive) return;
    state.currentId = p.id;
    G.endPreviousTurn(state, p);

    if (!p.alive) return;
    if (G.hasStatus(p, 'zhuhuo')) {
      G.log(state, `${p.name} 处于【逐火】，跳过本次行动。`);
      return;
    }

    G.startTurn(state, p);
    if (state.over || !p.alive) return;

    // 新时序：所有“开始行动时”效果（含入梦池）之后，先终末裁决，再记忆冰封。
    if (SR.judge && SR.judge.resolveTerminalBeforeAction) {
      SR.judge.resolveTerminalBeforeAction(state, p);
      if (state.over || !p.alive) return;
    }
    if (SR.judge && SR.judge.resolveMemoryIceForActor) {
      SR.judge.resolveMemoryIceForActor(state, p);
      if (state.over || !p.alive) return;
    }

    if (p.skipAction) {
      G.log(state, `${p.name} 跳过本次行动。`);
      return;
    }

    state.phase = 'judge';
    if (SR.judge && SR.judge.resolveJudgePhase) SR.judge.resolveJudgePhase(state, p);
    if (state.over || !p.alive) return;

    state.phase = 'draw';
    G.draw(state, p, 2);

    state.phase = 'play';
    if (!p.skipPlay) {
      if (SR.ai && SR.ai.playPhase) SR.ai.playPhase(state, p);
    } else {
      G.log(state, `${p.name} 跳过出牌阶段。`);
    }

    if (p.alive && !state.over) {
      state.phase = 'discard';
      G.discardToLimit(state, p);
    }

    if (p.alive && !state.over && SR.events && SR.events.onActionEndDot) {
      SR.events.onActionEndDot(state, p);
    }

    // 行动结束：dot 在此结算（Phase 2）
    p.skipPlay = false;
    G.checkWin(state);
  };

  G.discardToLimit = function (state, p) {
    const limit = G.handLimit(p);
    while (p.hand.length > limit) {
      const card = G.chooseAICard(state, p, p.hand, 'discard');
      if (!card) break;
      G.discardCard(state, p, card);
    }
  };

  G.GROUP_EFFECT_NAMES = { '寰宇蝗灾': 1, '帝弓光矢': 1, '同谐共鸣': 1, '纯美骑士客串': 1 };

  G.isGroupEffectCard = function (card) {
    return !!(card && (G.GROUP_EFFECT_NAMES[card.name] || String(card.effect || '').indexOf('群体') >= 0));
  };

  // 100% 效果抵抗时，真正“被作用”的角色：单体取目标；群体取除使用者外的可作用角色；欢愉取两名目标。
  G.effectResistanceTargets = function (state, p, card, target, opts) {
    if (card && card.name === '欢愉诡计') {
      const out = [];
      for (const t of [opts && opts.forced, opts && opts.victim]) {
        if (t && t.alive && !out.includes(t)) out.push(t);
      }
      return out;
    }
    if (card && G.isGroupEffectCard(card)) {
      return G.actionOrderFrom(state, p.id).slice(1)
        .map(id => G.getPlayer(state, id))
        .filter(t => t && t.alive && !G.isProtected(t));
    }
    return target && target.alive ? [target] : [];
  };

  // 暂停点：只在手动对局中由界面等待，模拟/AI 无界面时不生效。
  G.pause = function (state, request) {
    if (SR.manual && typeof SR.manual.requestPause === 'function') {
      return SR.manual.requestPause(state, request || {});
    }
  };

  // AI 聊天触发序号：重放时由状态快照恢复，供界面层去重。
  G.nextChatEventSeq = function (state) {
    if (!state) return 0;
    state.chatEventSeq = (state.chatEventSeq || 0) + 1;
    return state.chatEventSeq;
  };

  // 先公示打出的牌并等待 3 秒，再继续结算；同一张牌只公示一次。
  G.announceActivePlay = function (state, p, cards, options) {
    if (!cards || !cards.length) return;
    const card = cards[0];
    if (!card) return;
    if (!state.announcedUids) state.announcedUids = {};
    if (state.announcedUids[card.uid]) return;
    state.announcedUids[card.uid] = true;
    state.lastAnnounceUid = card.uid;
    state.publicSeq = (state.publicSeq || 0) + 1;
    const entry = {
      playerId: p ? p.id : null,
      cards: cards.slice(),
      group: cards.some(G.isGroupEffectCard),
      seq: state.publicSeq
    };
    state.publicPlay = entry;
    if (!state.publicPlays) state.publicPlays = {};
    if (entry.playerId) state.publicPlays[entry.playerId] = entry;
    G.pause(state, {
      kind: 'play',
      duration: (options && options.duration) || 2250,
      playerId: entry.playerId,
      cardUid: card.uid
    });
  };

  // 所有打出的牌都是公开信息。记录最近一次出牌/响应供界面公示。
  G.noteActivePlay = function (state, p, cards) {
    if (cards && cards.length) {
      // 若调用方还没有在结算前公示，则在这里补一次公示；已公示的牌不会重复暂停。
      G.announceActivePlay(state, p, cards);
    }
    if (SR.events && SR.events.onActivePlay) SR.events.onActivePlay(state, p, cards);
  };

  // 记忆命途：每回合首次成为锦囊牌目标时，可弃一张牌取消。
  G.tryRemembranceCancel = function (state, target, card, source) {
    if (!target || !target.alive || target.path !== 'remembrance') return false;
    if (!card || card.polarity !== '负面') return false;
    if (target.remembranceUsedTurn || G.isProtected(target)) return false;
    const cards = target.hand.concat(Object.values(target.equipment).filter(Boolean));
    if (!cards.length) return false;
    const use = SR.ai && SR.ai.chooseRemembrance
      ? SR.ai.chooseRemembrance(state, target, card, source)
      : false;
    if (!use) return false;
    // 记忆弃置哪张牌由本人选择；AI 按保留价值选择，玩家由手动钩子选牌。
    const pick = G.chooseAICard(state, target, cards, 'remembrance');
    if (!pick || !cards.includes(pick)) return false;
    target.remembranceUsedTurn = true;
    G.discardCard(state, target, pick);
    G.log(state, `${target.name} 发动【记忆】，弃一张牌取消【${card.name}】。`);
    return true;
  };

  // 记忆命途对群体负面锦囊：只让本人不响应、不受效果，不取消整张牌。
  G.tryRemembranceGroupExempt = function (state, target, card) {
    if (!target || !target.alive || target.path !== 'remembrance') return false;
    if (!card || card.polarity !== '负面') return false;
    if (target.remembranceUsedTurn || G.isProtected(target)) return false;
    const cards = target.hand.concat(Object.values(target.equipment).filter(Boolean));
    if (!cards.length) return false;
    const use = SR.ai && SR.ai.chooseRemembrance
      ? SR.ai.chooseRemembrance(state, target, card, null)
      : false;
    if (!use) return false;
    const pick = G.chooseAICard(state, target, cards, 'remembrance');
    if (!pick || !cards.includes(pick)) return false;
    target.remembranceUsedTurn = true;
    G.discardCard(state, target, pick);
    G.log(state, `${target.name} 发动【记忆】，弃一张牌；不响应也不受【${card.name}】影响。`);
    return true;
  };

  G.validDuelTarget = function (state, p, target) {
    return !!(target && state.players.includes(target) && target.alive &&
      target.id !== p.id && target.characterId !== 'danheng' && !G.isProtected(target));
  };

  G.playTrick = function (state, p, card, options) {
    const opts = options || {};
    const target = opts.target && opts.target.alive ? opts.target : null;
    if (card.name === '命途对撞' && !G.validDuelTarget(state, p, target)) return false;
    // 100% 效果抵抗：除战利品/纯美/同谐外，其他锦囊可以打出但无效。
    if (state.fieldEffect && state.fieldEffect.id === 6 && card.polarity === '负面') {
      G.log(state, `${p.name} 的【${card.name}】是负面锦囊，被 100% 效果抵抗无效。`);
      const resisted = G.effectResistanceTargets(state, p, card, target, opts);
      if (SR.manual) {
        for (const t of resisted) {
          if (typeof SR.manual.showEffectResist === 'function') SR.manual.showEffectResist(t);
          if (typeof SR.manual.onAiLaojingResist === 'function') {
            SR.manual.onAiLaojingResist(state, t, G.nextChatEventSeq(state));
          }
        }
      }
      G.moveCard(state, card, null, 'discard');
      G.clearElationMasks(state);
      return true;
    }
    if (card.name === '第IX机关') {
      G.log(state, `【第IX机关】是响应牌，不能在出牌阶段主动使用。`);
      return false;
    }
    G.log(state, `${p.name} 使用【${card.name}】。`);
    if (SR.judge && SR.judge.askIXForTrick && SR.judge.askIXForTrick(state, p, card, target)) {
      G.moveCard(state, card, null, 'discard');
      G.log(state, `【${card.name}】被第IX机关取消。`);
      G.clearElationMasks(state);
      return true;
    }
    if (target && G.tryRemembranceCancel(state, target, card, p)) {
      G.moveCard(state, card, null, 'discard');
      G.clearElationMasks(state);
      return true;
    }
    G.moveCard(state, card, null, 'discard');

    // AI 只返回“手牌/装备槽”位置；具体手牌由引擎随机抽取，AI 不读取手牌内容。
    const resolveAIPick = (pick) => {
      if (!pick || !target) return null;
      if (pick.zone === 'equipment') return target.equipment[pick.slot] || null;
      if (pick.zone === 'hand') {
        if (!target.hand.length) return null;
        return target.hand[Math.floor(state.rng() * target.hand.length)];
      }
      return pick;
    };

    switch (card.name) {
      case '随蝴蝶一起消散吧': {
        if (!target || G.isProtected(target)) return true;
        if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1);
        const pick = resolveAIPick(SR.ai && SR.ai.chooseStealCard
          ? SR.ai.chooseStealCard(state, p, target, card.name) : null);
        if (pick) G.discardCard(state, target, pick);
        return true;
      }
      case '星核猎手': {
        if (!target || target.id === p.id || G.isProtected(target) || G.distance(state, p, target) > 1) {
          G.log(state, `【星核猎手】只能对距离 1 以内的其他角色使用。`);
          return true;
        }
        if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1);
        const pick = resolveAIPick(SR.ai && SR.ai.chooseStealCard
          ? SR.ai.chooseStealCard(state, p, target, card.name) : null);
        if (pick) {
          G.moveCard(state, pick, p, 'hand');
          G.log(state, `${p.name} 获得 ${target.name} 的 ${C.cardText(pick)}。`);
        }
        return true;
      }
      case '普通战利品': {
        const cs = G.searchCards(state, c => c.type === 'basic', 1, true);
        for (const c of cs) G.gainCard(state, p, c, '普通战利品');
        for (const c of state.reveal || []) {
          if (c.zone === 'reveal') G.moveCard(state, c, null, 'discard');
        }
        return true;
      }
      case '精致战利品': {
        const cs = G.searchCards(state, c => c.type === 'basic', 3, false);
        const chosen = G.chooseCards(state, p, cs, Math.min(2, cs.length), 'loot') || [];
        for (const c of chosen) G.gainCard(state, p, c, '精致战利品');
        for (const c of cs) if (!chosen.includes(c)) G.moveCard(state, c, null, 'discard');
        return true;
      }
      case '珍贵战利品': {
        const cs = G.searchCards(state, () => true, 3, false);
        const chosen = G.chooseCards(state, p, cs, Math.min(2, cs.length), 'loot') || [];
        for (const c of chosen) G.gainCard(state, p, c, '珍贵战利品');
        for (const c of cs) if (!chosen.includes(c)) G.moveCard(state, c, null, 'discard');
        return true;
      }
      case '华丽战利品': {
        const cs = G.searchCards(state, () => true, 3, false);
        const chosen = G.chooseCards(state, p, cs, Math.min(1, cs.length), 'loot') || [];
        for (const c of chosen) G.gainCard(state, p, c, '华丽战利品');
        for (const c of cs) if (!chosen.includes(c)) G.moveCard(state, c, null, 'discard');
        const relic = G.searchCards(state, c => c.type === 'equip', 1, true);
        for (const c of relic) G.gainRelic(state, p, c, '遗物');
        return true;
      }
      case '贵重战利品': {
        const cs = G.searchCards(state, c => c.type === 'trick', 3, false);
        const chosen = G.chooseCards(state, p, cs, Math.min(1, cs.length), 'loot') || [];
        for (const c of chosen) G.gainCard(state, p, c, '贵重战利品');
        for (const c of cs) if (!chosen.includes(c)) G.moveCard(state, c, null, 'discard');
        const relic = G.searchCards(state, c => c.type === 'equip', 1, true);
        for (const c of relic) G.gainRelic(state, p, c, '遗物');
        return true;
      }
      case '命途对撞': {
        if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1.2);
        let current = target;
        while (!state.over) {
          const hasCard = current.hand.some(c => c.name === '再见安打');
          const played = G.askUseNamedCard(state, current, '再见安打', {
            reason: '命途对撞',
            duel: true
          });
          if (!played) {
            G.log(state, hasCard
              ? `${current.name} 选择不出【再见安打】，受到 1 点伤害。`
              : `${current.name} 没有【再见安打】，受到 1 点伤害。`);
            // D3 的来源按规则固定为【命途对撞】的使用者，而不是最后打出安打的一方。
            G.dealDamage(state, p, current, 1, 'D3', { sourceName: '命途对撞' });
            break;
          }
          current = current === target ? p : target;
        }
        return true;
      }
      case '寰宇蝗灾': {
        G.withGroupEffect(state, function () {
          // 从打出者的下一位开始，按本轮当前行动顺序结算；打出者不在目标内。
          const order = G.actionOrderFrom(state, p.id)
            .slice(1)
            .map(id => G.getPlayer(state, id))
            .filter(x => x && x.alive && !G.isProtected(x));
          for (const t of order) {
            if (state.over) break;
            if (!t.alive) continue;
            if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, t, 0.7);
            let responded = false;
            if (!G.tryRemembranceGroupExempt(state, t, card)) {
              responded = G.askUseNamedCard(state, t, '再见安打', { reason: '寰宇蝗灾' });
              if (!responded) {
                G.log(state, `${t.name} 未打出【再见安打】，受到 1 点伤害。`);
                G.dealDamage(state, p, t, 1, 'D4', { sourceName: '寰宇蝗灾' });
              }
            }
            if (!responded && !state.over) {
              G.pause(state, { kind: 'group', duration: 2750, playerId: t.id });
            }
          }
        });
        return true;
      }
      case '帝弓光矢': {
        G.withGroupEffect(state, function () {
          // 从打出者的下一位开始，按本轮当前行动顺序结算；打出者不在目标内。
          const order = G.actionOrderFrom(state, p.id)
            .slice(1)
            .map(id => G.getPlayer(state, id))
            .filter(x => x && x.alive && !G.isProtected(x));
          for (const t of order) {
            if (state.over) break;
            if (!t.alive) continue;
            if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, t, 0.7);
            let responded = false;
            if (!G.tryRemembranceGroupExempt(state, t, card)) {
              responded = G.askUseNamedCard(state, t, '闪身步', { reason: '帝弓光矢' });
              if (!responded) {
                G.log(state, `${t.name} 未打出【闪身步】，受到 1 点伤害。`);
                G.dealDamage(state, p, t, 1, 'D5', { sourceName: '帝弓光矢' });
              }
            }
            if (!responded && !state.over) {
              G.pause(state, { kind: 'group', duration: 2750, playerId: t.id });
            }
          }
        });
        return true;
      }
      case '同谐共鸣': {
        G.withGroupEffect(state, function () {
          for (const t of G.groupOrder(state)) {
            if (!t.alive || G.isProtected(t)) continue;
            if (t.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(state, p, t, 0.4);
            G.heal(state, t, 1, '同谐共鸣');
            if (!state.over) G.pause(state, { kind: 'group', duration: 2750, playerId: t.id });
          }
        });
        return true;
      }
      case '欢愉诡计': {
        const forced = opts.forced && opts.forced.alive ? opts.forced : null;
        const victim = opts.victim && opts.victim.alive ? opts.victim : null;
        if (!forced || !victim || forced.id === p.id || victim.id === p.id ||
            G.isProtected(forced) || G.isProtected(victim) || forced.id === victim.id) {
          G.log(state, `【欢愉诡计】不能对自己使用，且两名目标必须不同。`);
          G.clearElationMasks(state);
          return true;
        }
        if (G.tryRemembranceCancel(state, forced, card, p) || G.tryRemembranceCancel(state, victim, card, p)) {
          G.clearElationMasks(state);
          return true;
        }
        if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, victim, 1.2);
        G.log(state, `${p.name} 令 ${forced.name} 对 ${victim.name} 使用【再见安打】。`);
        const anda = forced.hand.find(c => c.name === '再见安打');
        if (!anda) {
          G.log(state, `${forced.name} 没有【再见安打】，受到 1 点无来源、不可闪避伤害。`);
          G.dealDamage(state, null, forced, 1, 'D15', { noSource: true, unDodgeable: true });
          G.clearElationMasks(state);
          return true;
        }
        G.playAnDa(state, forced, anda, { target: victim, free: true, forced: true });
        G.clearElationMasks(state);
        return true;
      }
      case '纯美骑士客串': {
        G.withGroupEffect(state, function () {
          // 纯美骑士客串：从打出者开始，按本轮当前行动顺序选牌；
          // 死亡或处于不可被指定状态的角色不参与。
          const order = G.actionOrderFrom(state, p.id)
            .map(id => G.getPlayer(state, id))
            .filter(x => x && x.alive && !G.isProtected(x));
          // 亮牌数量保持原逻辑：按可参与结算的存活角色数决定。
          const count = G.groupOrder(state).filter(x => !G.isProtected(x)).length;
          const cs = G.searchCards(state, () => true, count, false);
          for (const t of order) {
            if (!t.alive || G.isProtected(t) || !cs.length) continue;
            const chosen = SR.ai && SR.ai.chooseOneCard
              ? SR.ai.chooseOneCard(state, t, cs, '纯美')
              : cs[0];
            const idx = cs.indexOf(chosen);
            if (idx >= 0) {
              cs.splice(idx, 1);
              G.log(state, `【纯美骑士客串】${t.name} 选择了 ${C.cardText(chosen)}。`);
              G.gainCard(state, t, chosen, '纯美骑士客串');
              if (!state.over) {
                G.pause(state, {
                  kind: 'pure',
                  duration: 2250,
                  playerId: t.id,
                  card: Object.assign({}, chosen),
                  text: `${t.name} 选择了 ${C.cardText(chosen)}。`
                });
              }
            }
          }
          for (const c of cs) G.moveCard(state, c, null, 'discard');
        });
        return true;
      }
      default:
        G.log(state, `未实现的锦囊：${card.name}。`);
        return true;
    }
  };

  // 【欢愉诡计】的假面是公开的短暂界面状态；两名目标共用同一份 id 列表，保证同时出现、同时解除。
  G.clearElationMasks = function (state) {
    if (state && Array.isArray(state.elationMasks) && state.elationMasks.length) state.elationMasks = [];
  };

  G.playCard = function (state, p, card, options) {
    if (!p.alive || state.over) return false;
    if (!p.hand.includes(card)) return false;
    if (state.phase !== 'play') {
      G.log(state, `${p.name} 试图在非出牌阶段使用 ${card.name}。`);
      return false;
    }
    if (card.name === '命途对撞' && !G.validDuelTarget(state, p, options && options.target)) return false;
    // 牌公示前先戴上假面：在“看到牌”的停顿里两名目标就已经能被看到。
    if (card.name === '欢愉诡计' && options && options.forced && options.victim &&
        options.forced.alive && options.victim.alive &&
        options.forced.id !== p.id && options.victim.id !== p.id &&
        options.forced.id !== options.victim.id &&
        !G.isProtected(options.forced) && !G.isProtected(options.victim) &&
        !(state.fieldEffect && state.fieldEffect.id === 6 && card.polarity === '负面')) {
      state.elationMasks = [options.forced.id, options.victim.id];
    }
    // 结算前先公示：目标要在看到牌 3 秒后才有响应机会。
    if (card.name !== '闪身步' && card.name !== '第IX机关') G.announceActivePlay(state, p, [card]);
    let result = false;
    if (C.isBasic(card)) {
      if (card.name === '再见安打') {
        // 安打会在 playAnDa 里记录主动出牌（含强迫/额外安打）
        return G.playAnDa(state, p, card, options);
      }
      if (card.name === '药王慈怀') result = G.playHeal(state, p, card, p, options);
      else if (card.name === '奇巧零食') result = G.playSnack(state, p, card, p, options);
      else if (card.name === '闪身步') {
        G.log(state, `${p.name} 不能在出牌阶段主动使用【闪身步】。`);
        return false;
      }
    } else if (C.isEquip(card)) {
      result = G.installEquipment(state, p, card);
    } else if (C.isDelayed(card)) {
      const target = options && options.target && options.target.alive ? options.target : null;
      if (!target) return false;
      result = G.playDelayed(state, p, card, target);
    } else if (C.isTrick(card)) {
      if (card.name === '入梦池') {
        G.log(state, `【入梦池】只能在回合开始时使用。`);
        return false;
      }
      result = G.playTrick(state, p, card, options);
    } else {
      G.log(state, `${p.name} 使用了未实现牌 ${card.name}。`);
      return false;
    }
    if (result) G.noteActivePlay(state, p, [card]);
    return result;
  };

  G.validAnDaTargets = function (state, p, card) {
    return state.players.filter(t =>
      t.alive && t.id !== p.id && !G.isProtected(t) && G.inRange(state, p, t)
    );
  };

  G.resolveExtraAnDaTargets = function (state, p, card, targets) {
    // 【斩首行动】的额外目标按玩家实际选择顺序结算；同一目标只结算一次。
    const seen = new Set();
    const ordered = [];
    for (const t of targets || []) {
      if (!t || !t.alive || t.id === p.id || G.isProtected(t) || seen.has(t.id)) continue;
      seen.add(t.id);
      ordered.push(t);
    }
    G.withGroupEffect(state, function () {
      for (const t of ordered) {
        if (state.over || !t.alive || G.isProtected(t)) continue;
        if (G.tryDodge(state, t, p, card)) {
          G.log(state, `${t.name} 打出【闪身步】，抵消了【斩首行动】的额外目标伤害。`);
          continue;
        }
        G.dealDamage(state, p, t, 1, 'D1', {
          element: card.element,
          isAnDa: true,
          realAnDa: true,
          card,
          sourceName: '斩首行动'
        });
      }
    });
  };

  G.canPlayAnDa = function (state, p, card) {
    if (!card || card.name !== '再见安打') return false;
    if (p.anDaUsed >= 1 + (p.extraAnDa || 0) && !G.hasEquip(p, '银河球棒')) return false;
    return G.validAnDaTargets(state, p, card).length > 0;
  };

  G.playAnDa = function (state, p, card, options) {
    const target = options && options.target;
    if (!target || !target.alive || target.id === p.id || G.isProtected(target)) return false;
    if (!G.inRange(state, p, target)) {
      G.log(state, `${target.name} 不在 ${p.name} 的攻击范围内。`);
      return false;
    }
    const free = !!(options && options.free);
    if (!free && p.anDaUsed >= 1 + (p.extraAnDa || 0) && !G.hasEquip(p, '银河球棒')) {
      G.log(state, `${p.name} 本回合的【再见安打】已用完。`);
      return false;
    }
    // 斩首行动：这张安打是最后手牌时，额外指定至多两个目标。
    let extraTargets = [];
    if (p.hand.length === 1 && G.hasEquip(p, '斩首行动')) {
      const candidates = state.players.filter(t =>
        t.alive && t.id !== p.id && t.id !== target.id && !G.isProtected(t) && G.inRange(state, p, t)
      );
      extraTargets = SR.ai && SR.ai.chooseDecapTargets
        ? SR.ai.chooseDecapTargets(state, p, candidates)
        : candidates.slice(0, 2);
      extraTargets = (extraTargets || []).filter(t => t && t.alive && t.id !== target.id && !G.isProtected(t));
    }
    if (!free) p.anDaUsed += 1;
    // 下一张真实安打已使用：即使被闪也消耗零食，追加攻击不继承。
    const snackBuff = !!p.snackBuff;
    p.snackBuff = false;
    G.moveCard(state, card, null, 'discard');
    G.log(state, `${p.name} 对 ${target.name} 使用【再见安打】（${card.element}${card.rank}）${free ? '（不计次数）' : ''}。`);
    if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1.2);
    G.noteActivePlay(state, p, [card]);
    if (!(options && options.forced) && SR.events && SR.events.divineGain) SR.events.divineGain(state, p);

    // 菇菇嘎嘎：对异性角色指定目标时，目标选择弃1手牌或让来源摸1
    if (G.hasEquip(p, '菇菇嘎嘎') && p.character.gender !== target.character.gender) {
      const choice = SR.ai && SR.ai.chooseGugu ? SR.ai.chooseGugu(state, target, p) : 'discard';
      if (choice === 'discard' && target.hand.length) {
        const c = G.chooseAICard(state, target, target.hand, 'gugu');
        if (c) {
          G.discardCard(state, target, c);
          G.log(state, `${p.name} 的【菇菇嘎嘎】令 ${target.name} 弃置一张手牌。`);
        }
      } else {
        G.draw(state, p, 1);
        G.log(state, `${p.name} 的【菇菇嘎嘎】令自己摸一张牌。`);
      }
    }

    if (G.tryDodge(state, target, p, card)) {
      G.log(state, `${target.name} 打出【闪身步】，抵消了【再见安打】。`);
      // 伊甸之星：可对同一目标再使用一张安打，不计次数；手动模式由玩家选择具体哪一张。
      if (G.hasEquip(p, '伊甸之星') && p.hand.some(c => c.name === '再见安打')) {
        const again = SR.ai && SR.ai.chooseIdenExtra ? SR.ai.chooseIdenExtra(state, p, target) : false;
        if (again) {
          const extra = SR.ai && SR.ai.chooseIdenCard
            ? SR.ai.chooseIdenCard(state, p)
            : p.hand.find(c => c.name === '再见安打');
          if (extra && extra.name === '再见安打' && p.hand.includes(extra)) {
            G.playAnDa(state, p, extra, { target, free: true, idenExtra: true });
          }
        }
        G.resolveExtraAnDaTargets(state, p, card, extraTargets);
        return true;
      }
      // 侵晨：弃两张牌令此安打依然造成伤害
      if (G.hasEquip(p, '侵晨') && p.hand.length >= 2) {
        const use = SR.ai && SR.ai.chooseQinChen ? SR.ai.chooseQinChen(state, p, target) : false;
        if (use) {
          const picked = SR.ai && SR.ai.chooseQinChenCards
            ? SR.ai.chooseQinChenCards(state, p)
            : p.hand.slice(0, 2);
          const seen = new Set();
          const cards = (picked || []).filter(c => {
            if (!c || seen.has(c.uid) || !p.hand.includes(c)) return false;
            seen.add(c.uid);
            return true;
          }).slice(0, 2);
          if (cards.length >= 2) {
            for (const c of cards) G.discardCard(state, p, c);
            G.log(state, `${p.name} 发动【侵晨】，弃两张牌令此【再见安打】依然造成伤害。`);
          } else {
            // 手动选择取消：视为不发动【侵晨】，安打仍被闪避。
            G.resolveExtraAnDaTargets(state, p, card, extraTargets);
            return true;
          }
        } else {
          G.resolveExtraAnDaTargets(state, p, card, extraTargets);
          return true;
        }
      } else {
        G.resolveExtraAnDaTargets(state, p, card, extraTargets);
        return true;
      }
    }

    let amount = 1;
    if (snackBuff) {
      amount += 1;
      G.log(state, `${p.name} 的【奇巧零食】增伤生效。`);
    }
    if (G.hasEquip(p, '火力风暴潮') && target.hand.length === 0) {
      amount += 1;
      G.log(state, `${p.name} 的【火力风暴潮】增伤生效。`);
    }
    if (p.path === 'destruction' && !p.destructionUsedTurn) {
      amount += 1;
      p.destructionUsedTurn = true;
      p.destructionPenalty = true;
      G.addStatus(p, 'discipline_flash', '戒律性闪变');
      G.log(state, `${p.name} 的【毁灭】增伤生效，本回合受到的伤害 +1。`);
    }
    G.dealDamage(state, p, target, amount, 'D1', {
      element: card.element,
      isAnDa: true,
      realAnDa: true,
      card
    });
    G.resolveExtraAnDaTargets(state, p, card, extraTargets);
    return true;
  };

  G.chainsawTargets = function (state, p) {
    if (!G.hasEquip(p, '高周波电锯') || p.hand.length < 2) return [];
    if (p.anDaUsed >= 1 + (p.extraAnDa || 0) && !G.hasEquip(p, '银河球棒')) return [];
    return state.players.filter(t => t.alive && t.id !== p.id && !G.isProtected(t) && G.inRange(state, p, t));
  };

  // 高周波电锯：两张手牌当虚拟【再见安打】；占安打次数，不触发只认真实安打的效果。
  // chosenCards 由手动界面传入；未传入时沿用 AI 的弃牌排序。
  G.playChainsawAnDa = function (state, p, target, chosenCards) {
    if (!target || !G.chainsawTargets(state, p).some(t => t.id === target.id)) return false;
    const source = Array.isArray(chosenCards)
      ? chosenCards
      : (SR.ai && SR.ai.chooseDiscardCards
        ? SR.ai.chooseDiscardCards(state, p, p.hand, 2)
        : p.hand.slice(0, 2));
    const seen = new Set();
    const cards = (source || []).filter(c => {
      if (!c || seen.has(c.uid) || !p.hand.includes(c)) return false;
      seen.add(c.uid);
      return true;
    }).slice(0, 2);
    if (cards.length < 2) return false;
    p.anDaUsed += 1;
    for (const c of cards) G.discardCard(state, p, c);
    G.log(state, `${p.name} 将两张手牌当【再见安打】使用，目标 ${target.name}（虚拟安打）。`);
    if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1.2);
    G.noteActivePlay(state, p, cards);
    if (G.tryDodge(state, target, p, { name: '再见安打', element: '物理', rank: 'A' })) {
      G.log(state, `${target.name} 打出【闪身步】，抵消了高周波电锯的虚拟安打。`);
      return true;
    }
    G.dealDamage(state, p, target, 1, 'D1', {
      element: '物理',
      isAnDa: true,
      realAnDa: false,
      sourceName: '高周波电锯'
    });
    return true;
  };

  G.shieldTargets = function (state, p) {
    if (p.characterId !== 'march7' || p.shieldUsedTurn >= 2 || p.hand.length < 1) return [];
    return state.players.filter(t => t.alive && !G.isProtected(t));
  };

  G.playShield = function (state, p, target) {
    if (!target || !G.shieldTargets(state, p).some(t => t.id === target.id)) return false;
    const card = G.chooseAICard(state, p, p.hand, 'shield');
    if (!card) return false;
    p.shieldUsedTurn += 1;
    // 给自己套盾时，向全场公示这张被消耗的牌；给其他角色套盾保持原流程。
    if (target.id === p.id) {
      G.announceActivePlay(state, p, [card], { duration: 2250 });
    }
    G.discardCard(state, p, card);
    G.gainShield(target, 1);
    G.log(state, `${p.name} 发动【六相冰弓】，弃一张牌，令 ${target.name} 获得 1 点护盾（${target.shield}/2，每层持续 2 回合）。`);
    if (target.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(state, p, target, 1);
    return true;
  };

  G.himekoTargets = function (state, p) {
    if (p.characterId !== 'himeko' || p.himekoUsedTurn || p.hand.length < 2) return [];
    if (p.anDaUsed >= 1 + (p.extraAnDa || 0)) return [];
    return state.players.filter(t => t.alive && t.id !== p.id && !G.isProtected(t) && G.inRange(state, p, t));
  };

  G.playHimekoSkill = function (state, p, target, chosenCards) {
    if (!target || !G.himekoTargets(state, p).some(t => t.id === target.id)) return false;
    const source = Array.isArray(chosenCards)
      ? chosenCards
      : (SR.ai && SR.ai.chooseHimekoCards
        ? SR.ai.chooseHimekoCards(state, p)
        : p.hand.slice(0, 2));
    const seen = new Set();
    const cards = (source || []).filter(c => {
      if (!c || seen.has(c.uid) || !p.hand.includes(c)) return false;
      seen.add(c.uid);
      return true;
    }).slice(0, 2);
    if (cards.length < 2) return false;
    p.himekoUsedTurn = true;
    p.anDaUsed += 1;
    for (const c of cards) G.discardCard(state, p, c);
    G.log(state, `${p.name} 发动【拓星启行】，弃两张手牌，对 ${target.name} 造成 1 点伤害（虚拟安打，计入安打次数）。`);
    if (SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1.1);
    G.announceActivePlay(state, p, cards);
    if (SR.manual && typeof SR.manual.showHimekoLaser === 'function') {
      SR.manual.showHimekoLaser(state, p, target);
    }
    if (G.tryDodge(state, target, p, { name: '拓星启行' })) {
      G.log(state, `${target.name} 打出【闪身步】，抵消【拓星启行】。`);
      // 姬子弃置的两张牌合计为一次主动出牌；即使被闪也算效果已结算。
      G.noteActivePlay(state, p, cards);
      return true;
    }
    G.dealDamage(state, p, target, 1, 'D2', {
      realAnDa: false,
      isAnDa: true,
      sourceName: '拓星启行'
    });
    // 姬子弃置的两张牌合计为一次主动出牌：追忆按张数、解读按点数和。
    G.noteActivePlay(state, p, cards);
    return true;
  };

  G.tryDodge = function (state, target, source, anDaCard) {
    let recorded = false;
    const record = (used) => {
      if (recorded) return;
      recorded = true;
      if (SR.ai && SR.ai.observeDodgeResult) SR.ai.observeDodgeResult(state, target, source, used);
    };
    if (!target.alive) return false;
    if (G.isProtected(target)) return false;
    if (target.flags.noDodge) {
      record(false);
      return false;
    }
    if (target.noDodgeBy || G.hasStatus(target, 'weightless')) {
      G.log(state, `${target.name} 处于【失重】，不能使用【闪身步】。`);
      record(false);
      return false;
    }
    const hasShirt = G.hasEquip(target, '黄紫衬衫');
    const shirtFirst = !!(hasShirt && target.isHuman && state.options && state.options.manualHuman);

    // 手动模式下玩家先选择是否用【黄紫衬衫】判定；未发动或失败后，再询问是否打出【闪身步】。
    // AI 仍维持“先闪身步、后衬衫”的原有决策顺序。
    if (shirtFirst && G.tryShirtDodge(state, target, source)) {
      record(true);
      return true;
    }

    const dodge = target.hand.find(c => c.name === '闪身步');
    if (dodge) {
      const use = SR.ai && SR.ai.chooseDodge ? SR.ai.chooseDodge(state, target, source, anDaCard) : true;
      if (use) {
        G.moveCard(state, dodge, null, 'discard');
        G.noteActivePlay(state, target, [dodge]);
        record(true);
        return true;
      }
    }
    if (hasShirt && !shirtFirst && G.tryShirtDodge(state, target, source)) {
      record(true);
      return true;
    }
    record(false);
    return false;
  };

  G.playHeal = function (state, p, card, target, options) {
    if (!target || !target.alive) return false;
    G.announceActivePlay(state, p, [card]);
    // dot 规则：拥有 dot 的玩家可消耗【药王慈怀】解除 1 层，仅作消耗，不产生治疗。
    if (options && options.removeDot && target.id === p.id && (p.dots || 0) > 0) {
      G.moveCard(state, card, null, 'discard');
      p.dots = Math.max(0, (p.dots || 0) - 1);
      if (!p.dots) G.removeStatus(p, 'dot');
      G.log(state, `${p.name} 使用【药王慈怀】解除 1 层【dot】（剩余 ${p.dots} 层，不回复体力）。`);
      return true;
    }
    const isDying = target.hp <= 0;
    if (!isDying) {
      if (target.id !== p.id) return false;
      if (target.hp >= target.maxHp) {
        G.log(state, `${target.name} 体力已满，不能使用【药王慈怀】。`);
        return false;
      }
    }
    G.log(state, `${p.name} 对 ${target.name} 使用【药王慈怀】。`);
    if (target.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(state, p, target, 1);
    G.moveCard(state, card, null, 'discard');
    G.heal(state, target, 1, '药王慈怀');
    return true;
  };

  G.playSnack = function (state, p, card, target, options) {
    if (!target || !target.alive) return false;
    G.announceActivePlay(state, p, [card]);
    // dot 规则：拥有 dot 的玩家可消耗【奇巧零食】解除 1 层，仅作消耗。
    if (options && options.removeDot && target.id === p.id && (p.dots || 0) > 0) {
      G.moveCard(state, card, null, 'discard');
      p.dots = Math.max(0, (p.dots || 0) - 1);
      if (!p.dots) G.removeStatus(p, 'dot');
      G.log(state, `${p.name} 使用【奇巧零食】解除 1 层【dot】（剩余 ${p.dots} 层，不回复体力）。`);
      return true;
    }
    const isDying = target.hp <= 0;
    if (isDying) {
      G.moveCard(state, card, null, 'discard');
      G.heal(state, target, 1, '奇巧零食（濒死）');
      G.log(state, `${p.name} 对 ${target.name} 使用【奇巧零食】（濒死，仅回血）。`);
      if (target.id !== p.id && SR.ai && SR.ai.observeHelp) SR.ai.observeHelp(state, p, target, 1);
      return true;
    }
    if (target.id !== p.id || p.snackUsed) return false;
    G.moveCard(state, card, null, 'discard');
    p.snackUsed = true;
    p.snackBuff = true;
    G.log(state, `${p.name} 使用【奇巧零食】，本回合下一张【再见安打】伤害 +1。`);
    return true;
  };

  G.installEquipment = function (state, p, card) {
    const slot = C.getSlot(card);
    if (!slot) return false;
    G.moveCard(state, card, p, 'equipment');
    p.statuses = p.statuses.filter(s => s.cardUid !== card.uid);
    G.log(state, `${p.name} 装备 ${C.cardText(card)}。`);
    return true;
  };

  G.playDelayed = function (state, p, card, target) {
    G.log(state, `${p.name} 对 ${target.name} 使用延时锦囊 ${card.name}。`);
    if (target.id !== p.id && SR.ai && SR.ai.observeHostile) SR.ai.observeHostile(state, p, target, 1);
    if (state.fieldEffect && state.fieldEffect.id === 6 && card.polarity === '负面') {
      if (target && SR.manual && typeof SR.manual.showEffectResist === 'function') {
        SR.manual.showEffectResist(target);
      }
      if (target && SR.manual && typeof SR.manual.onAiLaojingResist === 'function') {
        SR.manual.onAiLaojingResist(state, target, G.nextChatEventSeq(state));
      }
      G.moveCard(state, card, null, 'discard');
      G.log(state, `【${card.name}】是负面锦囊，被 100% 效果抵抗跳过判定并进入弃牌堆。`);
      return true;
    }
    if (SR.judge && SR.judge.askIXForTrick && SR.judge.askIXForTrick(state, p, card, target)) {
      G.moveCard(state, card, null, 'discard');
      G.log(state, `${card.name} 被第IX机关取消，进入弃牌堆。`);
      return true;
    }
    if (G.tryRemembranceCancel(state, target, card, p)) {
      G.moveCard(state, card, null, 'discard');
      return true;
    }
    G.moveCard(state, card, target, 'judge');
    return true;
  };

  G.tryPreventWithLightShield = function (state, target, amount) {
    if (!G.hasEquip(target, '光能盾牌')) return false;
    const cards = target.hand.concat(Object.values(target.equipment).filter(Boolean));
    if (cards.length < 2) return false;
    const use = SR.ai && SR.ai.chooseLightShield ? SR.ai.chooseLightShield(state, target, amount) : false;
    if (!use) return false;
    const chosen = SR.ai && SR.ai.chooseLightShieldCards
      ? SR.ai.chooseLightShieldCards(state, target, cards)
      : (SR.ai && SR.ai.chooseDiscardCards ? SR.ai.chooseDiscardCards(state, target, cards, 2) : cards.slice(0, 2));
    const seen = new Set();
    const picked = (chosen || []).filter(c => {
      if (!c || seen.has(c.uid) || !cards.includes(c)) return false;
      seen.add(c.uid);
      return true;
    }).slice(0, 2);
    if (picked.length < 2) return false;
    for (const c of picked) {
      G.discardCard(state, target, c);
    }
    G.log(state, `${target.name} 发动【光能盾牌】，弃两张牌防止本次伤害。`);
    return true;
  };

  // 同一次顶层伤害结算内的嵌套伤害（如洞穴寓言 D14）共享同一个事件号。
  // 濒死救援上限扣除按事件号去重，避免同一次伤害结算中反复扣上限。
  let damageEventDepth = 0;
  let damageEventSerial = 0;

  G.dealDamageInner = function (state, source, target, amount, type, options) {
    const opts = options || {};
    if (!target || !target.alive || state.over) return null;
    if (G.hasStatus(target, 'zhuhuo')) {
      G.log(state, `${target.name} 处于【逐火】，本次伤害不生效。`);
      return null;
    }
    if (G.hasStatus(target, 'memory_opening')) {
      G.log(state, `${target.name} 处于【记忆是梦的开场白】，本次伤害不生效。`);
      return null;
    }
    if (amount <= 0) return null;
    const ignoreArmor = !!opts.ignoreArmor || (source && G.hasEquip(source, '击云') && type === 'D1');
    const ignoreShield = !!opts.ignoreShield || (source && G.hasEquip(source, '击云') && type === 'D1');

    if (!ignoreArmor && G.hasEquip(target, '很硬的甲') && type === 'D1' &&
        ['雷', '风', '物理'].includes(opts.element)) {
      G.log(state, `${target.name} 的【很硬的甲】使 ${opts.element} 元素的【再见安打】无效。`);
      return { invalid: true };
    }

    let dmg = amount;
    if (source && source.path === 'preservation' && source.preservationPenalty && !['D6','D7','D12'].includes(type)) {
      dmg = Math.max(0, dmg - 1);
      G.log(state, `${source.name} 的【存护】反噬：本回合造成的伤害 -1。`);
    }
    if (target.path === 'destruction' && target.destructionPenalty && !['D6','D7','D12'].includes(type)) {
      dmg += 1;
      G.log(state, `${target.name} 的【毁灭】反噬：本回合受到的伤害 +1。`);
    }
    if (target.path === 'preservation' && type !== 'D12' && type !== 'D13' && !opts.unpreventable && !target.preservationUsedTurn) {
      dmg = Math.max(0, dmg - 1);
      target.preservationUsedTurn = true;
      target.preservationPenalty = true;
      G.addStatus(target, 'cannot_protect', '我什么都保护不了');
      G.log(state, `${target.name} 的【存护】减伤 1，本回合造成的伤害 -1。`);
      if (SR.manual && typeof SR.manual.showPreservationShield === 'function') {
        SR.manual.showPreservationShield(state, target);
      }
    }

    if (!ignoreArmor && type !== 'D11' && G.hasEquip(target, '绝对热量')) {
      dmg = Math.min(1, dmg);
      G.log(state, `${target.name} 的【绝对热量】将伤害封顶为 1。`);
    }

    if (dmg <= 0) {
      G.log(state, `本次伤害被减至 0。`);
      return { prevented: true };
    }

    if (!ignoreArmor && type !== 'D7' && type !== 'D12' && !opts.unpreventable && G.tryPreventWithLightShield(state, target, dmg)) {
      return { prevented: true };
    }

    let absorbed = 0;
    if (!ignoreShield && type !== 'D12' && target.shield > 0) {
      G.ensureShieldLayers(target);
      absorbed = Math.min(target.shield, dmg);
      // 先从最早到期的一层开始消耗；各层计时保持不变。
      let remaining = absorbed;
      while (remaining > 0 && target.shieldLayers.length) {
        let idx = 0;
        for (let j = 1; j < target.shieldLayers.length; j++) {
          if (target.shieldLayers[j].turns < target.shieldLayers[idx].turns) idx = j;
        }
        target.shieldLayers.splice(idx, 1);
        remaining -= 1;
      }
      dmg -= absorbed;
      G.syncShieldLayers(target);
      G.log(state, `${target.name} 的护盾吸收 ${absorbed} 点伤害（剩余护盾 ${target.shield}）。`);
    }

    let hpLoss = 0;
    if (dmg > 0) {
      target.hp -= dmg;
      hpLoss = dmg;
      G.log(state, `${target.name} 受到 ${dmg} 点伤害（${type}），体力 ${target.hp}/${target.maxHp}。`);
    } else {
      G.log(state, `${target.name} 的护盾吸收了全部伤害，仍视为受到伤害。`);
    }

    if (target) target.damageTakenRound = (target.damageTakenRound || 0) + absorbed + hpLoss;
    if (hpLoss > 0) state.lastHpLossRound = state.round;
    const result = { amount, absorbed, hpLoss, damaged: (absorbed > 0 || hpLoss > 0), prevented: false };

    // 以牙还牙甲：仅记录待结算，等目标完成濒死/求援/淘汰（或逐火转化）后再反伤。
    // 本次“伤害结算/特效前移”不改变以牙还牙甲的既有反伤时点。
    const armorPending = !opts.noChain && hpLoss > 0 && source && source.alive && source.id !== target.id &&
        !ignoreArmor && !['D6','D8','D9','D11','D12','D16'].includes(type) &&
        G.hasEquip(target, '以牙还牙甲') && !target.armorUsedTurn;
    if (armorPending) target.armorUsedTurn = true;

    const willResolveDying = target.hp <= 0 && target.alive;

    // 本次伤害的数值/特效先于濒死展示。目标存活时相关效果仍在下方按原顺序结算。
    if (result.damaged && SR.manual && typeof SR.manual.showDamageVisual === 'function') {
      SR.manual.showDamageVisual(state, source, target, result, type, opts);
    }

    // 来源侧的伤害后触发（魔阴身/星核共鸣/欢愉）属于本次伤害结算的一部分。
    // 若该伤害会使目标进入濒死，先结算这些效果，再进入濒死/求援/淘汰。
    if (willResolveDying && result.damaged) {
      G.afterDamageSource(state, source, target, type, opts, result);
    }

    // 给伤害数字/来源侧伤害后特效留出展示时间，再弹出濒死求援提示。
    if (willResolveDying && !state.over) {
      G.pause(state, {
        kind: 'damage',
        duration: 750,
        playerId: target.id,
        reason: '伤害结算',
        text: `${target.name} 受到 ${result.hpLoss} 点伤害。`
      });
    }

    if (willResolveDying && target.hp <= 0 && target.alive && !state.over) {
      if (state.fieldEffect && state.fieldEffect.id === 9) {
        G.enterZhuhuo(state, target, '永劫轮回濒死');
      } else {
        // 目标完成濒死/求援/淘汰后立即判定胜负；若已产生赢家，不再反伤。
        G.resolveDying(state, target, source, result);
      }
    }

    if (armorPending && !state.over) {
      const judged = SR.judge.judge(state, target, '以牙还牙甲');
      if (judged && [2, 4, 6, 8, 10].includes(parseInt(judged.rank, 10))) {
        G.log(state, `${target.name} 的【以牙还牙甲】反伤 ${hpLoss} 点给 ${source.name}。`);
        G.dealDamage(state, target, source, hpLoss, 'D7', {
          noChain: true,
          sourceName: '以牙还牙甲'
        });
      }
    }
    if (result.damaged && !state.over) {
      // 非濒死伤害沿用原顺序：先以牙还牙甲，再结算来源侧触发。
      if (!willResolveDying) {
        G.afterDamageSource(state, source, target, type, opts, result);
      }
      if (state.over) return result;
      // P0-2：目标死亡时，来源型触发仍生效；目标型触发不生效。
      G.afterDamageTarget(state, source, target, type, opts, result, !target.alive);
    }
    if (result.damaged && source && source.alive && source.id !== target.id &&
        target.alive && !state.over) {
      if (SR.manual && typeof SR.manual.onAiFriendlyFire === 'function') {
        SR.manual.onAiFriendlyFire(state, source, target, G.nextChatEventSeq(state));
      }
    }
    return result;
  };

  // 顶层伤害事件包装：嵌套的 D14/连锁伤害沿用同一个事件号。
  G.dealDamage = function (state, source, target, amount, type, options) {
    const top = damageEventDepth === 0;
    if (top) {
      damageEventSerial += 1;
      if (state) state.damageEventId = damageEventSerial;
    }
    damageEventDepth += 1;
    try {
      return G.dealDamageInner.apply(this, arguments);
    } finally {
      damageEventDepth -= 1;
    }
  };

  // 一个顶层伤害结算事件内，同一角色最多扣除一次救援上限。
  // 返回本次是否实际扣除了上限。
  G.applyRescueMaxHpPenalty = function (state, target) {
    if (!target) return false;
    const eventId = state && state.damageEventId;
    if (eventId && target.lastRescuePenaltyEventId === eventId) {
      G.log(state, `${target.name} 本次伤害结算已扣除过体力上限，避免重复扣除。`);
      return false;
    }
    target.maxHp = Math.max(1, target.maxHp - 1);
    if (eventId) target.lastRescuePenaltyEventId = eventId;
    return true;
  };

  // 伤害后触发分为两段：
  // 来源侧效果（魔阴身/星核共鸣/欢愉）属于本次伤害结算；若目标将进入濒死，先于濒死结算。
  // 目标侧效果（三月七/丹恒/dot/洞穴寓言）依赖目标是否被救回，仍在濒死/求援/淘汰后结算。
  G.afterDamageSource = function (state, source, target, type, opts, result) {
    if (state.over) return;
    const E = SR.events;
    // 1. 魔阴身：来源按实际体力损失回复（D2 可，D3/D4/D5/D7 不可）。
    if (E && E.moyinHeal) E.moyinHeal(state, source, target, type, opts, result);
    if (state.over) return;

    // 2. 星核共鸣：每回合首次造成伤害后摸一张；护盾吸收也算。
    if (source && source.alive && source.characterId &&
        source.characterId.indexOf('trailblazer') === 0 &&
        result.damaged && !source.starCoreUsedTurn) {
      source.starCoreUsedTurn = true;
      G.draw(state, source, 1);
      G.log(state, `${source.name} 的【星核共鸣】摸一张牌。`);
    }
    if (state.over) return;

    // 3. 欢愉：每回合首次造成伤害后判定。
    if (source && source.alive && source.path === 'elation' &&
        result.damaged && !source.elationUsedTurn) {
      source.elationUsedTurn = true;
      const judged = SR.judge.judge(state, source, '欢愉');
      if (judged) {
        const rank = judged.rank;
        const value = rank === 'A' ? 1 : (rank === 'J' ? 11 : rank === 'Q' ? 12 : rank === 'K' ? 13 : parseInt(rank, 10));
        if (value <= 4) {
          G.draw(state, source, 1);
          G.log(state, `${source.name} 的【欢愉】判定 A–4：摸一张牌。`);
        } else if (value <= 10) {
          if (source.hand.length) {
            const c = G.chooseAICard(state, source, source.hand, 'elation');
            if (c) G.discardCard(state, source, c);
          } else {
            G.dealDamage(state, null, source, 1, 'D16', { noSource: true });
            G.log(state, `${source.name} 的【欢愉】判定 5–10：无手牌，受到 1 点伤害。`);
          }
        } else {
          G.heal(state, source, 1, '欢愉');
        }
      }
    }
  };

  G.afterDamageTarget = function (state, source, target, type, opts, result, targetDead) {
    if (state.over) return;
    const E = SR.events;
    const targetEligible = !targetDead && target && target.alive && !G.isProtected(target);
    // 伤害后目标侧触发顺序（已确认）：
    // 三月七元气 > 丹恒云骑枪术 > dot 附着 > 洞穴寓言。
    // 【以牙还牙甲】已在濒死/淘汰后单独结算，不在此重复。

    // 4. 三月七元气：仅在实际扣除体力时触发；护盾吸收部分不算。
    //    逐层伤害分别结算，因此每一层只要扣了体力就各触发一次。
    if (targetEligible && target.characterId === 'march7' && result.hpLoss > 0) {
      G.draw(state, target, 1);
      G.log(state, `${target.name} 的【元气满满】摸一张牌。`);
    }
    if (state.over) return;

    // 5. 丹恒云骑枪术：真实安打造成伤害后，目标有手牌则随机弃一张。
    if (targetEligible && source && source.alive && source.characterId === 'danheng' &&
        type === 'D1' && opts.realAnDa && target.hand.length) {
      const c = target.hand[Math.floor(state.rng() * target.hand.length)];
      G.discardCard(state, target, c);
      G.log(state, `${source.name} 的【云骑枪术】令 ${target.name} 随机弃置一张手牌。`);
      if (SR.manual && typeof SR.manual.showDanhengSpear === 'function') {
        SR.manual.showDanhengSpear(state, source, target);
      }
    }
    if (state.over) return;

    // 6. dot 附着：目标死亡不附着；被救回则正常附着。
    if (targetEligible && E && E.dotAttach) E.dotAttach(state, source, target, type, opts, result);
    if (state.over) return;

    // 7. 洞穴寓言：每次伤害结算后检查（B4 已确认）。
    if (E && E.caveCheck) E.caveCheck(state, source, target, type, opts, result);
  };

  // 兼容旧调用：完整的两段伤害后触发。
  G.afterDamage = function (state, source, target, type, opts, result, targetDead) {
    G.afterDamageSource(state, source, target, type, opts, result);
    if (state.over) return;
    G.afterDamageTarget(state, source, target, type, opts, result, targetDead);
  };

  G.resolveDying = function (state, target, source, damageResult, options) {
    const deferWin = !!(options && options.deferWin);
    if (!target.alive) return;
    if (G.hasStatus(target, 'zhuhuo')) {
      G.log(state, `${target.name} 处于【逐火】，不进入普通濒死/淘汰流程。`);
      return;
    }
    if (G.hasStatus(target, 'memory_opening')) {
      G.log(state, `${target.name} 处于【记忆是梦的开场白】，不进入普通濒死/淘汰流程。`);
      return;
    }
    if (state.fieldEffect && state.fieldEffect.id === 9) {
      G.enterZhuhuo(state, target, '永劫轮回');
      return;
    }
    if (target.maxHp <= 1) {
      G.log(state, `${target.name} 体力上限为 1，无法被救援，直接阵亡。`);
      G.killPlayer(state, target, source, 'maxhp1', deferWin);
      return;
    }
    G.log(state, `${target.name} 进入濒死（${target.hp}/${target.maxHp}）。`);
    // 求援与其他人开始救助之间统一留出约 3 秒。
    G.pause(state, { kind: 'rescue', duration: 2250, playerId: target.id, reason: '求援' });
    const order = G.roundOrderFromNavigator(state);
    let rescued = false;
    let rescueSource = null;
    for (const id of order) {
      const rescuer = G.getPlayer(state, id);
      if (!rescuer || !rescuer.alive) continue;
      // 每个被询问者可以连续使用多张
      while (target.hp <= 0) {
        const choices = rescuer.hand.filter(c => c.name === '药王慈怀' || c.name === '奇巧零食');
        if (!choices.length) break;
        const card = SR.ai && SR.ai.chooseRescue
          ? SR.ai.chooseRescue(state, rescuer, target, choices)
          : null;
        if (!card) break;
        if (card.name === '药王慈怀') G.playHeal(state, rescuer, card, target);
        else G.playSnack(state, rescuer, card, target);
        rescueSource = rescuer;
      }
      if (target.hp > 0) {
        rescued = true;
        break;
      }
    }
    if (!rescued) {
      // 拟似黑洞：正常求援无人救后，询问瓦尔特；每局一次。
      const welt = state.players.find(p => p.characterId === 'welt' && p.alive && !p.mimicUsed);
      if (welt && target.maxHp > 1) {
        const use = SR.ai && SR.ai.chooseMimicBlackHole
          ? SR.ai.chooseMimicBlackHole(state, welt, target)
          : true;
        if (use) {
          welt.mimicUsed = true;
          for (const c of welt.hand.slice()) G.moveCard(state, c, null, 'discard');
          for (const slot of ['weapon', 'armor', 'vehicle']) {
            if (welt.equipment[slot]) G.moveCard(state, welt.equipment[slot], null, 'discard');
          }
          G.applyRescueMaxHpPenalty(state, target);
          target.hp = 0;
          G.heal(state, target, 2, '拟似黑洞');
          G.log(state, `${welt.name} 发动【拟似黑洞】，弃置所有手牌与装备，${target.name} 回复至 ${target.hp} 点体力（上限 ${target.maxHp}）。`);
          if (SR.events && SR.events.onHeal) SR.events.onHeal(state, target, target.hp);
          if (SR.manual && typeof SR.manual.onAiRescued === 'function') {
            SR.manual.onAiRescued(state, target, welt, G.nextChatEventSeq(state));
          }
          // 黑洞特效在目标状态栏展示 3 秒；仅手动界面会实际暂停。
          G.pause(state, { kind: 'mimic', duration: 2250, playerId: target.id, reason: '拟似黑洞' });
          return;
        }
      }
      G.killPlayer(state, target, source, 'dying', deferWin);
    } else {
      const penalized = G.applyRescueMaxHpPenalty(state, target);
      target.hp = 1;
      G.log(state, penalized
        ? `${target.name} 被救回，体力上限 -1，当前体力 1（${target.maxHp} 上限）。`
        : `${target.name} 被救回，当前体力 1（${target.maxHp} 上限；本次伤害结算已扣过上限）。`);
      if (SR.events && SR.events.onHeal) SR.events.onHeal(state, target, 1);
      if (SR.manual && typeof SR.manual.onAiRescued === 'function') {
        SR.manual.onAiRescued(state, target, rescueSource, G.nextChatEventSeq(state));
      }
    }
  };

  G.killPlayer = function (state, victim, killer, cause, deferWin) {
    if (!victim.alive) return;
    if (state.fieldEffect && state.fieldEffect.id === 9) {
      G.enterZhuhuo(state, victim, cause || '永劫轮回');
      return;
    }
    victim.alive = false;
    victim.hp = 0;
    G.log(state, `${victim.name} 阵亡（${cause || '伤害'}），身份为【${victim.identityName}】。`);
    if (victim.isHuman && !state.over) {
      state.humanDied = true;
      state.humanDeathLogIndex = state.log.length;
      G.log(state, `${victim.name} 已阵亡，剩余对局进入静默模拟。`);
    }
    for (const c of victim.hand.slice()) G.moveCard(state, c, null, 'discard');
    for (const slot of ['weapon', 'armor', 'vehicle']) {
      if (victim.equipment[slot]) G.moveCard(state, victim.equipment[slot], null, 'discard');
    }
    // 【终末裁决】不随目标死亡弃置：转移给行动顺序中的下一个存活角色继续判定。
    const terminals = victim.judge.filter(c => c.name === '终末裁决');
    for (const c of victim.judge.slice()) {
      if (c.name !== '终末裁决') G.moveCard(state, c, null, 'discard');
    }
    victim.judge = [];
    const nextId = G.actionOrderFrom(state, victim.id).find(id => {
      if (id === victim.id) return false;
      const q = G.getPlayer(state, id);
      return q && q.alive && !G.isProtected(q);
    });
    for (const t of terminals) {
      if (nextId) {
        const next = G.getPlayer(state, nextId);
        G.moveCard(state, t, next, 'judge');
        G.log(state, `【终末裁决】转移给 ${next.name}，继续在下个角色行动前判定。`);
      } else {
        G.moveCard(state, t, null, 'discard');
      }
    }
    victim.hand = [];
    victim.shield = 0;
    victim.shieldTurns = 0;
    victim.shieldLayers = [];
    victim.statuses = [];
    // 击败奖励/惩罚
    if (killer && killer.alive && killer.id !== victim.id) {
      if (victim.identity === 'rebel') {
        G.draw(state, killer, 3);
        G.log(state, `${killer.name} 击败虚卒，摸 3 张。`);
      }
      if (killer.identity === 'navigator' && victim.identity === 'loyalist') {
        for (const c of killer.hand.slice()) G.moveCard(state, c, null, 'discard');
        for (const slot of ['weapon', 'armor', 'vehicle']) {
          if (killer.equipment[slot]) G.moveCard(state, killer.equipment[slot], null, 'discard');
        }
        G.log(state, `${killer.name}（领航员）击败无名客，弃置所有手牌与装备区牌。`);
      }
    }
    if (!deferWin) G.checkWin(state);
  };

  G.checkWin = function (state) {
    if (state.over) return state.winner;
    if (state.normalWinSuppressed) return null;
    const alive = G.alivePlayers(state);
    const navigator = state.players.find(p => p.identity === 'navigator');
    const traitor = state.players.find(p => p.identity === 'traitor');
    const rebels = state.players.filter(p => p.identity === 'rebel');
    const loyalists = state.players.filter(p => p.identity === 'loyalist');

    const setWin = (faction, members) => {
      state.over = true;
      state.winner = { faction, members: members.map(p => p.id), names: members.map(p => p.name) };
      G.log(state, `胜负已分：${G.factionLabel(faction)} 获胜。`);
      return state.winner;
    };

    if (navigator && !navigator.alive) {
      if (traitor && traitor.alive && alive.length === 1 && alive[0].id === traitor.id) {
        return setWin('traitor', [traitor]);
      }
      return setWin('rebel', rebels);
    }
    if (navigator && navigator.alive) {
      const enemies = state.players.filter(p => p.identity === 'rebel' || p.identity === 'traitor');
      if (enemies.every(p => !p.alive)) {
        return setWin('navigator', [navigator].concat(loyalists));
      }
    }
    return null;
  };

  G.runBootsRound = function (state) {
    const order = state.actionOrder;
    let guard = 0;
    for (let i = 0; i < order.length && !state.over; i++) {
      const scheduled = G.getPlayer(state, order[i]);
      if (!scheduled || !scheduled.alive) continue;
      // 清理已经失效的皮靴记录。
      for (const b of state.boots || []) {
        const h = G.getPlayer(state, b.holderId);
        if (b.active && (!h || !h.alive || !G.hasEquip(h, '反重力皮靴'))) b.active = false;
      }
      const own = G.bootsEntry(state, scheduled.id);
      if (own && own.active && own.used) {
        G.log(state, `${scheduled.name} 已通过【反重力皮靴】行动，跳过正常行动时点。`);
        continue;
      }
      if (own && own.active && G.bootsCanAsk(state, own)) {
        const later = order.slice(i + 1).some(id => {
          const q = G.getPlayer(state, id);
          return q && q.alive;
        });
        if (!later) {
          own.used = true;
          G.log(state, `${scheduled.name} 是最后一个行动者，直接按正常时点行动。`);
          G.runAction(state, scheduled);
          guard++;
          if (state.over) break;
          continue;
        }
        const actNow = SR.ai && SR.ai.chooseBootsActNow
          ? SR.ai.chooseBootsActNow(state, scheduled)
          : true;
        if (actNow) {
          own.used = true;
          G.log(state, `${scheduled.name} 在本轮正常时点行动，结束【反重力皮靴】的插入机会。`);
          G.runAction(state, scheduled);
          guard++;
          if (state.over) break;
          continue;
        }
        own.normalSlotPassed = true;
        G.log(state, `${scheduled.name} 放弃本轮正常时点，继续等待【反重力皮靴】插入机会。`);
        if (G.bootsTryInsert(state, scheduled, scheduled.id)) {
          guard++;
          if (state.over) break;
        }
        continue;
      }
      // 该角色不是当前可询问的皮靴持有者：先让其他皮靴持有者尝试插入。
      if (G.bootsTryInsert(state, scheduled)) {
        guard++;
        if (state.over) break;
      }
      const p = G.getPlayer(state, order[i]);
      if (!p || !p.alive) continue;
      G.runAction(state, p);
      guard++;
      const pe = G.bootsEntry(state, p.id);
      if (pe && pe.active && !pe.used) pe.used = true;
      if (guard > 200000) throw new Error('runGame guard exceeded');
    }
    // 所有其他角色行动完仍未插入：按正常行动顺序强制行动。
    const leftovers = (state.boots || [])
      .filter(b => b.active && !b.used)
      .sort((a, b) => state.actionOrder.indexOf(a.holderId) - state.actionOrder.indexOf(b.holderId));
    for (const b of leftovers) {
      if (state.over) break;
      const holder = G.getPlayer(state, b.holderId);
      if (!holder || !holder.alive || !G.hasEquip(holder, '反重力皮靴') ||
          G.hasStatus(holder, 'zhuhuo') || G.hasStatus(holder, 'memory_opening')) continue;
      b.used = true;
      G.log(state, `所有其他角色行动完毕，${holder.name} 因【反重力皮靴】在本轮最后强制行动。`);
      G.runAction(state, holder);
      guard++;
    }
    return guard;
  };

  G.runGame = function (options) {
    const state = G.createGame(options);
    const maxRounds = (SR.data.rulesMeta && SR.data.rulesMeta.maxRounds) || 100;
    let guard = 0;
    while (!state.over && state.round <= maxRounds) {
      G.startRound(state);
      guard += G.runBootsRound(state);
      if (guard > 200000) throw new Error('runGame guard exceeded');
      if (!state.over) {
        G.endRound(state);
        state.round++;
      }
    }
    if (!state.over) {
      if (state.round > maxRounds) state.round = maxRounds;
      state.over = true;
      state.draw = true;
      state.winner = { faction: 'draw', members: [], names: [] };
      G.log(state, `达到 ${maxRounds} 轮上限，判为平局。`);
    }
    return state;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
