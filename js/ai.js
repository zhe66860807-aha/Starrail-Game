/* 星穹铁道身份局 - 中等强度身份推理 AI
 *
 * 设计原则（对应最新 AI 需求）：
 * 1. 决策函数只接收 publicState + myState；publicState 由代理包裹，
 *    访问他人身份、他人手牌、牌堆顺序、随机数状态等隐藏信息会直接抛错。
 * 2. 信念来自公开行动（攻击/帮助/救援/未响应）与公开身份，不读取真实隐藏身份。
 * 3. 先按身份概率估算威胁，再生成候选动作并用“收益-风险-暴露”评分，而不是写死出牌顺序。
 * 4. 身份策略只影响评分权重：领航员求生、无名客保领航员、虚卒攻领航员、内鬼控场。
 *    领航员方 = 领航员 + 无名客，二者胜负绑定。
 * 5. AI 行为不写入规则书；本文件只负责行为。
 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const AI = SR.ai = SR.ai || {};
  const G = SR.game;
  const C = SR.cards;
  const U = SR.util;

  const ROLE = { rebel: '虚卒', loyalist: '无名客', traitor: '内鬼', navigator: '领航员' };
  const ROLE_KEYS = ['rebel', 'loyalist', 'traitor'];
  const PUBLIC_VIEW = '__sr_public_view__';
  const PUBLIC_VIEWER = '__sr_public_viewer__';

  const FORBIDDEN_KEYS = new Set([
    'hand', 'identity', 'identityName', 'deck', 'rng', 'aiMinds', 'options',
    'log', 'seed', 'aiLog', 'pending', 'aiPrivate', 'hiddenState', 'hidden'
  ]);

  // 公开静态牌面数据（牌名与效果本来就是公开信息）。
  const CARD_META = {};
  for (const c of (SR.data && SR.data.cards) || []) {
    if (!CARD_META[c.name]) CARD_META[c.name] = c;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rankValue = (r) => r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : (parseInt(r, 10) || 0);
  const sumObj = (o) => Object.keys(o || {}).reduce((s, k) => s + (Number(o[k]) || 0), 0);
  const alive = (pub) => (pub.players || []).filter(p => p.alive);
  const isProtected = (p) => !!(p && (p.statuses || []).some(s => s.id === 'zhuhuo' || s.id === 'memory_opening'));
  const hasStatus = (p, id) => !!(p && (p.statuses || []).some(s => s.id === id));
  const CARD = (name) => CARD_META[name] || null;

  function hiddenError(path) {
    const err = new Error('AI_HIDDEN_ACCESS: decision code attempted to read ' + path);
    err.code = 'AI_HIDDEN_ACCESS';
    throw err;
  }

  function cloneCard(card) {
    if (!card) return null;
    return {
      uid: card.uid,
      name: card.name,
      type: card.type,
      subtype: card.subtype,
      element: card.element,
      rank: card.rank,
      effect: card.effect,
      polarity: card.polarity || null,
      targetScope: card.targetScope || null,
      slot: card.slot || null
    };
  }

  function cloneStatus(s) {
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      value: s.value,
      source: s.source,
      cardUid: s.cardUid,
      turns: s.turns
    };
  }

  function cloneEffect(ev) {
    if (!ev) return null;
    return {
      id: ev.id,
      name: ev.name,
      text: ev.text,
      effect: ev.effect,
      voice: ev.voice
    };
  }

  function clonePlain(v, depth) {
    if (v == null || depth > 4) return v;
    if (Array.isArray(v)) return v.map(x => clonePlain(x, depth + 1));
    if (typeof v !== 'object') return v;
    const out = {};
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (typeof x === 'function') continue;
      if (x && typeof x === 'object') out[k] = clonePlain(x, depth + 1);
      else out[k] = x;
    }
    return out;
  }

  // ----- 公开视图代理：任何隐藏字段访问都会抛错 -----
  function guardValue(v, path, viewerId) {
    if (Array.isArray(v)) return v.map((x, i) => guardValue(x, path + '[' + i + ']', viewerId));
    if (v && typeof v === 'object') return guardObject(v, path, viewerId);
    return v;
  }

  function guardObject(target, path, viewerId) {
    return new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === 'string') {
          if (key === PUBLIC_VIEW) return true;
          if (key === PUBLIC_VIEWER) return viewerId;
          if (FORBIDDEN_KEYS.has(key)) {
            if (key === 'identity' || key === 'identityName') {
              const allowed = t.id === viewerId || t.isNavigator || t.alive === false;
              if (!allowed) hiddenError(path + '.' + key);
            } else {
              hiddenError(path + '.' + key);
            }
          }
        }
        const value = Reflect.get(t, key, receiver);
        if (value && typeof value === 'object') {
          return guardValue(value, path + '.' + String(key), viewerId);
        }
        return value;
      },
      set(t, key) {
        hiddenError(path + '.' + String(key) + ' (AI 不得修改公开状态)');
      },
      deleteProperty(t, key) {
        hiddenError(path + '.' + String(key) + ' (AI 不得修改公开状态)');
      }
    });
  }

  function publicPlayerRaw(p, viewerId) {
    const identityVisible = p.id === viewerId || p.isNavigator || !p.alive;
    const out = {
      id: p.id,
      seat: p.seat,
      name: p.name,
      characterId: p.characterId,
      isHuman: !!p.isHuman,
      gender: p.character && p.character.gender,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      isNavigator: !!p.isNavigator,
      handCount: (p.hand || []).length,
      handLimitMod: p.handLimitMod || 0,
      equipment: {
        weapon: cloneCard(p.equipment && p.equipment.weapon),
        armor: cloneCard(p.equipment && p.equipment.armor),
        vehicle: cloneCard(p.equipment && p.equipment.vehicle)
      },
      judge: (p.judge || []).map(cloneCard),
      statuses: (p.statuses || []).map(cloneStatus),
      shield: p.shield || 0,
      shieldTurns: p.shieldTurns || 0,
      armorUsedTurn: !!p.armorUsedTurn,
      shieldLayers: (p.shieldLayers || []).map(l => ({ turns: l.turns })),
      path: p.path || null,
      dots: p.dots || 0,
      skillPoints: p.skillPoints || 0,
      interpretation: p.interpretation || 0,
      graceUses: p.graceUses || 0,
      mimicUsed: !!p.mimicUsed,
      divineGains: p.divineGains || 0,
      damageTakenRound: p.damageTakenRound || 0,
      destructionPenalty: !!p.destructionPenalty,
      turnSerial: p.turnSerial || 0
    };
    if (identityVisible) {
      out.identity = p.identity;
      out.identityName = p.identityName || ROLE[p.identity] || p.identity;
    }
    return out;
  }

  AI.publicCard = cloneCard;

  AI.publicView = function (state, viewer) {
    const viewerId = viewer.id;
    const raw = {
      round: state.round,
      phase: state.phase,
      currentId: state.currentId,
      navigatorId: state.navigatorId,
      humanId: state.humanId,
      actionOrder: (state.actionOrder || []).slice(),
      actionIndex: state.actionIndex,
      over: !!state.over,
      draw: !!state.draw,
      winner: state.over ? clonePlain(state.winner, 0) : null,
      players: state.players.map(p => publicPlayerRaw(p, viewerId)),
      deckCount: (state.deck || []).length,
      discardCount: (state.discard || []).length,
      discard: (state.discard || []).map(cloneCard),
      reveal: (state.reveal || []).map(cloneCard),
      fieldEffect: cloneEffect(state.fieldEffect),
      eventHistory: (state.eventHistory || []).slice(),
      reminiscence: state.reminiscence == null ? null : state.reminiscence,
      cave: state.cave == null ? null : state.cave,
      reminiscence24Used: !!state.reminiscence24Used,
      boots: clonePlain(state.boots || [], 0),
      aiActions: clonePlain(state.aiActions || { hostile: {}, help: {} }, 0),
      publicStats: clonePlain(state.aiPublic || {}, 0),
      lastHpLossRound: state.lastHpLossRound || 0,
      aggressionStartRound: state.aggressionStartRound == null ? null : state.aggressionStartRound,
      aggressionLevel: state.aggressionLevel || 0,
      aggressionMultiplier: state.aggressionMultiplier || 1,
      paceLevel: state.paceLevel || 0,
      damageMultiplier: state.damageMultiplier || 1,
      gainMultiplier: state.gainMultiplier || 1,
      defenseMultiplier: state.defenseMultiplier || 1,
      humanDied: !!state.humanDied,
      humanDeathLogIndex: state.humanDeathLogIndex == null ? null : state.humanDeathLogIndex
    };
    return guardObject(raw, 'publicState', viewerId);
  };

  AI.privateView = function (state, viewer) {
    const p = viewer;
    const own = {
      id: p.id,
      name: p.name,
      identity: p.identity,
      identityName: p.identityName || ROLE[p.identity],
      isNavigator: !!p.isNavigator,
      isHuman: !!p.isHuman,
      characterId: p.characterId,
      gender: p.character && p.character.gender,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      hand: (p.hand || []).map(cloneCard),
      handCount: (p.hand || []).length,
      handLimitMod: p.handLimitMod || 0,
      equipment: {
        weapon: cloneCard(p.equipment && p.equipment.weapon),
        armor: cloneCard(p.equipment && p.equipment.armor),
        vehicle: cloneCard(p.equipment && p.equipment.vehicle)
      },
      judge: (p.judge || []).map(cloneCard),
      statuses: (p.statuses || []).map(cloneStatus),
      shield: p.shield || 0,
      shieldTurns: p.shieldTurns || 0,
      armorUsedTurn: !!p.armorUsedTurn,
      shieldLayers: (p.shieldLayers || []).map(l => ({ turns: l.turns })),
      path: p.path || null,
      dots: p.dots || 0,
      skillPoints: p.skillPoints || 0,
      interpretation: p.interpretation || 0,
      graceUses: p.graceUses || 0,
      mimicUsed: !!p.mimicUsed,
      divineGains: p.divineGains || 0,
      damageTakenRound: p.damageTakenRound || 0,
      destructionPenalty: !!p.destructionPenalty,
      turnSerial: p.turnSerial || 0,
      anDaUsed: p.anDaUsed || 0,
      snackUsed: !!p.snackUsed,
      snackBuff: !!p.snackBuff,
      extraAnDa: p.extraAnDa || 0,
      himekoUsedTurn: !!p.himekoUsedTurn,
      shieldUsedTurn: p.shieldUsedTurn || 0,
      memoryOpeningUsedTurn: !!p.memoryOpeningUsedTurn,
      remembranceUsedTurn: !!p.remembranceUsedTurn,
      destructionUsedTurn: !!p.destructionUsedTurn,
      preservationUsedTurn: !!p.preservationUsedTurn,
      destructionPenalty: !!p.destructionPenalty,
      preservationPenalty: !!p.preservationPenalty,
      flags: clonePlain(p.flags || {}, 0)
    };
    own.attackRange = attackRangeOf(own);
    return own;
  };

  AI.assertPublicIsolation = function (state, viewer) {
    const pub = AI.publicView(state, viewer);
    const other = (pub.players || []).find(p => p.id !== viewer.id && p.alive && !p.isNavigator);
    if (other) {
      let threw = false;
      try { void other.identity; } catch (e) {
        if (e && e.code === 'AI_HIDDEN_ACCESS') threw = true;
        else throw e;
      }
      if (!threw) throw new Error('AI hidden identity access was NOT blocked');
      threw = false;
      try { void other.hand; } catch (e) {
        if (e && e.code === 'AI_HIDDEN_ACCESS') threw = true;
        else throw e;
      }
      if (!threw) throw new Error('AI hidden hand access was NOT blocked');
    }
    let threw = false;
    try { void pub.deck; } catch (e) {
      if (e && e.code === 'AI_HIDDEN_ACCESS') threw = true;
      else throw e;
    }
    if (!threw) throw new Error('AI deck access was NOT blocked');
    threw = false;
    try { void pub.rng; } catch (e) {
      if (e && e.code === 'AI_HIDDEN_ACCESS') threw = true;
      else throw e;
    }
    if (!threw) throw new Error('AI rng access was NOT blocked');
    return true;
  };

  // ----- 随机与初始化 -----
  AI.ensure = function (state) {
    if (!state) return;
    if (!state.aiActions) state.aiActions = { hostile: {}, help: {} };
    if (!state.aiActions.hostile) state.aiActions.hostile = {};
    if (!state.aiActions.help) state.aiActions.help = {};
    if (!state.aiMinds) state.aiMinds = {};
    if (!state.aiPublic) state.aiPublic = {};
    const ps = state.aiPublic;
    for (const k of ['dodge', 'noDodge', 'noAnDa', 'attacks', 'rescues', 'responses']) {
      if (!ps[k]) ps[k] = {};
    }
    const rng = state.rng || (() => 0.5);
    for (const p of state.players) {
      if (!state.aiMinds[p.id]) {
        state.aiMinds[p.id] = {
          noise: {}, beliefs: {}, handReads: {}, lastRound: 0, drift: {}
        };
      }
      const mind = state.aiMinds[p.id];
      if (!mind.noise) mind.noise = {};
      for (const q of state.players) {
        if (q.id === p.id || mind.noise[q.id]) continue;
        mind.noise[q.id] = {
          rebel: (rng() - 0.5) * 0.85,
          loyalist: (rng() - 0.5) * 0.85,
          traitor: (rng() - 0.5) * 0.85
        };
      }
    }
    // 开局主动者：从非玩家角色中随机指定 1–2 名，按人数增加。
    // 只使用公开的座位/人数和随机数，不读取任何人的隐藏身份。
    if (!state.aiOpeningReady) {
      state.aiOpeningReady = true;
      for (const p of state.players) {
        if (state.aiMinds[p.id]) state.aiMinds[p.id].openingAggressor = false;
      }
      const pool = state.players.filter(p => p.alive && !p.isHuman && state.aiMinds[p.id]);
      const wanted = Math.min(pool.length, state.players.length >= 5 ? 2 : 1);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      for (const p of pool.slice(0, wanted)) {
        state.aiMinds[p.id].openingAggressor = true;
      }
    }
  };

  AI.observeHostile = function (state, actor, target, weight) {
    if (!state || !actor || !target || actor.id === target.id) return;
    AI.ensure(state);
    const row = state.aiActions.hostile[actor.id] || (state.aiActions.hostile[actor.id] = {});
    row[target.id] = (row[target.id] || 0) + (weight == null ? 1 : weight);
    const pub = state.aiPublic;
    if (pub) {
      if (!pub.attacks) pub.attacks = {};
      pub.attacks[actor.id] = (pub.attacks[actor.id] || 0) + 1;
    }
  };

  AI.observeHelp = function (state, actor, target, weight) {
    if (!state || !actor || !target || actor.id === target.id) return;
    AI.ensure(state);
    const row = state.aiActions.help[actor.id] || (state.aiActions.help[actor.id] = {});
    row[target.id] = (row[target.id] || 0) + (weight == null ? 1 : weight);
    const pub = state.aiPublic;
    if (pub) {
      if (!pub.rescues) pub.rescues = {};
      pub.rescues[actor.id] = (pub.rescues[actor.id] || 0) + 1;
    }
  };

  // 公开记录“面对安打是否打出闪身步”。不读取目标手牌，只记录公开结果。
  AI.observeDodgeResult = function (state, target, source, used) {
    if (!state || !target) return;
    AI.ensure(state);
    const pub = state.aiPublic;
    const row = used ? pub.dodge : pub.noDodge;
    row[target.id] = (row[target.id] || 0) + 1;
  };

  // 公开记录“被要求打出某牌时是否打出”。用于推断手牌质量，不读取手牌内容。
  AI.observeNamedResponse = function (state, player, name, used) {
    if (!state || !player) return;
    AI.ensure(state);
    const pub = state.aiPublic;
    if (name === '再见安打') {
      if (!used) pub.noAnDa[player.id] = (pub.noAnDa[player.id] || 0) + 1;
    } else if (name === '闪身步') {
      if (!used) pub.noDodge[player.id] = (pub.noDodge[player.id] || 0) + 1;
    }
    if (!pub.responses[player.id]) pub.responses[player.id] = {};
    const r = pub.responses[player.id];
    const key = name + ':' + (used ? 'yes' : 'no');
    r[key] = (r[key] || 0) + 1;
  };

  // ----- 视图与信念 -----
  AI.context = function (state, player) {
    AI.ensure(state);
    const pub = AI.publicView(state, player);
    const my = AI.privateView(state, player);
    const mind = state.aiMinds[player.id];
    AI.updateMind(pub, my, mind, state.rng || (() => 0.5));
    my.mind = mind;
    return { pub, my, mind };
  };

  AI.priorFor = function (pub, my, target) {
    if (!target.alive) {
      return { rebel: target.identity === 'rebel' ? 1 : 0, loyalist: target.identity === 'loyalist' ? 1 : 0, traitor: target.identity === 'traitor' ? 1 : 0, known: true };
    }
    if (target.isNavigator) return { rebel: 0, loyalist: 0, traitor: 0, known: true, role: 'navigator' };
    if (target.id === my.id) return { rebel: my.identity === 'rebel' ? 1 : 0, loyalist: my.identity === 'loyalist' ? 1 : 0, traitor: my.identity === 'traitor' ? 1 : 0, known: true };
    const counts = (G.IDENTITY_DISTRIBUTION[pub.players.length] || []).slice();
    const rem = { rebel: 0, loyalist: 0, traitor: 0 };
    for (const r of counts) if (rem[r] != null) rem[r] += 1;
    for (const p of pub.players) {
      if (p.isNavigator) continue;
      if (!p.alive) {
        if (rem[p.identity] != null) rem[p.identity] = Math.max(0, rem[p.identity] - 1);
      } else if (p.id === my.id) {
        if (rem[my.identity] != null) rem[my.identity] = Math.max(0, rem[my.identity] - 1);
      }
    }
    const total = rem.rebel + rem.loyalist + rem.traitor;
    if (total <= 0) return { rebel: 1 / 3, loyalist: 1 / 3, traitor: 1 / 3 };
    return { rebel: rem.rebel / total, loyalist: rem.loyalist / total, traitor: rem.traitor / total };
  };

  AI.evidenceFor = function (pub, my, target, mind) {
    const hAll = (pub.aiActions && pub.aiActions.hostile) || {};
    const heAll = (pub.aiActions && pub.aiActions.help) || {};
    const hRow = hAll[target.id] || {};
    const heRow = heAll[target.id] || {};
    const navigatorId = pub.navigatorId;
    const hL = hRow[navigatorId] || 0;
    const heL = heRow[navigatorId] || 0;
    const hMe = target.id === my.id ? 0 : (hRow[my.id] || 0);
    const heMe = target.id === my.id ? 0 : (heRow[my.id] || 0);
    let rebel = 0, loyalist = 0, traitor = 0;

    // 对领航员的公开行为是最强信号。
    rebel += hL * 1.85;
    loyalist += heL * 1.55;

    // 已阵亡者身份公开。攻击虚卒并不只说明“忠于领航员”：内鬼同样需要清理虚卒，
    // 因此降低单次行为的阵营判定权重，并给内鬼保留合理怀疑，避免错误地认为场上已无敌人。
    for (const p of pub.players) {
      if (p.alive || p.id === target.id) continue;
      const role = p.identity;
      const h = hRow[p.id] || 0;
      const he = heRow[p.id] || 0;
      if (role === 'rebel') {
        loyalist += h * 0.42;
        traitor += h * 0.18;
        rebel += he * 0.6;
      } else if (role === 'loyalist') {
        rebel += h * 0.6;
        traitor += h * 0.18;
        loyalist += he * 0.65;
      }
    }

    // 对观察者自己的行为：取决于观察者自身身份。
    if (my.identity === 'navigator' || my.identity === 'loyalist') {
      rebel += hMe * 0.75;
      loyalist += heMe * 0.55;
      traitor += hMe * 0.35;
    } else if (my.identity === 'rebel') {
      loyalist += hMe * 0.7;
      traitor += hMe * 0.35;
      rebel += heMe * 0.55;
    } else if (my.identity === 'traitor') {
      rebel += hMe * 0.22;
      loyalist += hMe * 0.22;
    }

    // 帮助领航员、又持续攻击非领航员：更像内鬼在控场（弱证据）。
    const otherH = Math.max(0, sumObj(hRow) - hL - hMe);
    if (heL > 0 && otherH > 0) traitor += Math.min(2, otherH) * 0.06;

    const noise = (mind && mind.noise && mind.noise[target.id]) || { rebel: 0, loyalist: 0, traitor: 0 };
    rebel += noise.rebel || 0;
    loyalist += noise.loyalist || 0;
    traitor += noise.traitor || 0;
    return { rebel, loyalist, traitor, hostileToNavigator: hL, helpToNavigator: heL, hostileToMe: hMe, helpMe: heMe };
  };

  AI.updateMind = function (pub, my, mind, rand) {
    if (!mind) return;
    if (!mind.noise) mind.noise = {};
    if (!mind.beliefs) mind.beliefs = {};
    if (!mind.handReads) mind.handReads = {};
    if (mind.lastRound !== pub.round) {
      // 每轮给旧判断一点随机漂移，让 AI 会改判，但不会凭空读取身份。
      for (const id of Object.keys(mind.noise)) {
        const n = mind.noise[id];
        if (!n) continue;
        n.rebel = (n.rebel || 0) + (rand() - 0.5) * 0.16;
        n.loyalist = (n.loyalist || 0) + (rand() - 0.5) * 0.16;
        n.traitor = (n.traitor || 0) + (rand() - 0.5) * 0.16;
      }
      mind.lastRound = pub.round;
    }
    const stats = pub.publicStats || {};
    for (const p of pub.players) {
      if (!mind.noise[p.id]) {
        mind.noise[p.id] = {
          rebel: (rand() - 0.5) * 0.85,
          loyalist: (rand() - 0.5) * 0.85,
          traitor: (rand() - 0.5) * 0.85
        };
      }
      if (!mind.handReads[p.id]) {
        mind.handReads[p.id] = { noDodge: 0, dodges: 0, noAnDa: 0, attacks: 0 };
      }
      const hr = mind.handReads[p.id];
      hr.noDodge = (stats.noDodge && stats.noDodge[p.id]) || 0;
      hr.dodges = (stats.dodge && stats.dodge[p.id]) || 0;
      hr.noAnDa = (stats.noAnDa && stats.noAnDa[p.id]) || 0;
      hr.attacks = (stats.attacks && stats.attacks[p.id]) || 0;
    }
    for (const p of pub.players) {
      if (p.id === my.id) continue;
      const prior = AI.priorFor(pub, my, p);
      if (prior.known) {
        mind.beliefs[p.id] = {
          rebel: p.identity === 'rebel' ? 1 : 0,
          loyalist: p.identity === 'loyalist' ? 1 : 0,
          traitor: p.identity === 'traitor' ? 1 : 0,
          role: p.isNavigator ? 'navigator' : (p.identity || 'unknown'),
          confidence: 1,
          prior,
          evidence: 0,
          known: true
        };
        continue;
      }
      const ev = AI.evidenceFor(pub, my, p, mind);
      const lp = (x) => Math.log(Math.max(0.02, x));
      const s = {
        rebel: lp(prior.rebel) + ev.rebel,
        loyalist: lp(prior.loyalist) + ev.loyalist,
        traitor: lp(prior.traitor) + ev.traitor
      };
      const max = Math.max(s.rebel, s.loyalist, s.traitor);
      const ex = {
        rebel: Math.exp(s.rebel - max),
        loyalist: Math.exp(s.loyalist - max),
        traitor: Math.exp(s.traitor - max)
      };
      const total = ex.rebel + ex.loyalist + ex.traitor || 1;
      const probs = { rebel: ex.rebel / total, loyalist: ex.loyalist / total, traitor: ex.traitor / total };
      let best = 'unknown';
      let bestP = 0;
      let secondP = 0;
      for (const r of ROLE_KEYS) {
        if (probs[r] > bestP) { secondP = bestP; bestP = probs[r]; best = r; }
        else if (probs[r] > secondP) secondP = probs[r];
      }
      const evidenceTotal = Math.abs(ev.rebel) + Math.abs(ev.loyalist) + Math.abs(ev.traitor);
      if (bestP < 0.46 || (bestP - secondP < 0.06 && evidenceTotal < 2.2)) best = 'unknown';
      mind.beliefs[p.id] = {
        rebel: probs.rebel,
        loyalist: probs.loyalist,
        traitor: probs.traitor,
        role: best,
        confidence: bestP,
        prior,
        evidence: evidenceTotal,
        known: false
      };
    }
  };

  AI.belief = function (pub, my, mind, target) {
    if (!target) return { rebel: 1 / 3, loyalist: 1 / 3, traitor: 1 / 3, role: 'unknown', confidence: 0 };
    if (target.id === my.id) {
      return { rebel: my.identity === 'rebel' ? 1 : 0, loyalist: my.identity === 'loyalist' ? 1 : 0, traitor: my.identity === 'traitor' ? 1 : 0, role: my.identity, confidence: 1 };
    }
    if (target.isNavigator) return { rebel: 0, loyalist: 0, traitor: 0, role: 'navigator', confidence: 1 };
    if (!target.alive) {
      return {
        rebel: target.identity === 'rebel' ? 1 : 0,
        loyalist: target.identity === 'loyalist' ? 1 : 0,
        traitor: target.identity === 'traitor' ? 1 : 0,
        role: target.identity || 'unknown',
        confidence: 1
      };
    }
    return (mind && mind.beliefs && mind.beliefs[target.id]) || { rebel: 1 / 3, loyalist: 1 / 3, traitor: 1 / 3, role: 'unknown', confidence: 0 };
  };

  AI.dodgeChance = function (pub, my, mind, target) {
    if (!target || !target.alive) return 0;
    if (target.statuses && target.statuses.some(s => s.id === 'weightless')) return 0;
    const hr = (mind && mind.handReads && mind.handReads[target.id]) || {};
    const hand = target.handCount || 0;
    if (!hand) return 0;
    // 12 张闪身步 / 182 张牌，按手牌数近似；未闪过的公开记录降低估计。
    let p = 1 - Math.pow(0.935, hand);
    p *= Math.max(0.25, 1 - 0.1 * (hr.noDodge || 0));
    p += 0.035 * (hr.dodges || 0);
    if (target.equipment && target.equipment.armor && target.equipment.armor.name === '黄紫衬衫') p += 0.12;
    return clamp(p, 0.02, 0.86);
  };

  AI.anDaChance = function (pub, my, mind, target) {
    if (!target || !target.handCount) return 0;
    const hr = (mind && mind.handReads && mind.handReads[target.id]) || {};
    let p = 1 - Math.pow(0.88, target.handCount);
    p *= Math.max(0.3, 1 - 0.12 * (hr.noAnDa || 0));
    return clamp(p, 0.02, 0.9);
  };

  // 武器特效估值：攻击范围之外，AI 也应看到“效果更好”的武器。
  // 数值只影响出牌评分，不代表规则数值。
  AI.weaponEffectValue = function (card) {
    const values = {
      '银河球棒': 1.2,
      '击云': 1.0,
      '伊甸之星': 0.8,
      '高周波电锯': 0.75,
      '侵晨': 0.75,
      '斩首行动': 0.7,
      '火力风暴潮': 0.7,
      '菇菇嘎嘎': 0.55,
      '反重力皮靴': 0.65
    };
    return (card && values[card.name]) || 0;
  };

  AI.equipValue = function (eq) {
    if (!eq) return 0;
    let v = 0;
    if (eq.weapon) v += 0.7 + C.getWeaponRange(eq.weapon) * 0.35 + AI.weaponEffectValue(eq.weapon) * 0.5;
    if (eq.armor) {
      const name = eq.armor.name;
      v += name === '绝对热量' ? 1.7 : name === '光能盾牌' ? 1.45 :
        name === '以牙还牙甲' ? 1.35 : name === '很硬的甲' ? 1.15 : 0.95;
    }
    if (eq.vehicle) v += eq.vehicle.subtype && eq.vehicle.subtype.indexOf('+1') >= 0 ? 0.7 : 0.45;
    return v;
  };

  function attackRangeOf(p) {
    let range = 1 + ((p.equipment && p.equipment.weapon && C.getWeaponRange(p.equipment.weapon)) || 0);
    if (p.characterId === 'himeko') range += 1;
    return range;
  }

  AI.attackRangeOf = attackRangeOf;

  function distanceOf(pub, myId, targetId) {
    const list = (pub.players || []).filter(p => p.alive).sort((a, b) => a.seat - b.seat);
    const ia = list.findIndex(p => p.id === myId);
    const ib = list.findIndex(p => p.id === targetId);
    if (ia < 0 || ib < 0) return Infinity;
    const n = list.length;
    if (n <= 1) return Infinity;
    let d = Math.min((ia - ib + n) % n, (ib - ia + n) % n);
    const a = list[ia];
    const b = list[ib];
    if (b.equipment && b.equipment.vehicle && b.equipment.vehicle.subtype && b.equipment.vehicle.subtype.indexOf('+1') >= 0) d += 1;
    if (a.equipment && a.equipment.vehicle && a.equipment.vehicle.subtype && a.equipment.vehicle.subtype.indexOf('-1') >= 0) d -= 1;
    return Math.max(1, d);
  }

  AI.distance = distanceOf;

  // 当前能明确攻击到的敌人中，最近的距离；没有明确敌人时返回 Infinity。
  // 只读公开距离、手牌数、体力和 AI 自己的信念，不读取隐藏身份。
  AI.requiredWeaponRange = function (pub, my, mind) {
    let need = Infinity;
    for (const p of (pub.players || [])) {
      if (!p.alive || p.id === my.id || isProtected(p)) continue;
      const rel = AI.relation(pub, my, mind, p);
      if (!AI.canHostileTarget(rel)) continue;
      const d = distanceOf(pub, my.id, p.id);
      if (d < need) need = d;
    }
    return need;
  };

  AI.cardValue = function (card, my) {
    if (!card) return 0;
    let v = 1;
    if (card.name === '闪身步') v = 2.1;
    else if (card.name === '药王慈怀') v = 1.8;
    else if (card.name === '第IX机关') v = 2.4;
    else if (card.name === '再见安打') v = 1.6;
    else if (card.name === '奇巧零食') v = 1.1;
    else if (card.type === 'equip') {
      const slot = C.getSlot(card);
      const cur = my && my.equipment && my.equipment[slot];
      if (slot === 'weapon') v = 1.3 + C.getWeaponRange(card) * 0.45 - (cur ? C.getWeaponRange(cur) * 0.35 : 0);
      else if (slot === 'armor') v = 1.5 + (AI.equipValue({ armor: card }) - (cur ? AI.equipValue({ armor: cur }) : 0));
      else v = 1.2;
    } else if (card.name === '终末裁决' || card.name === '记忆冰封') v = 1.9;
    else if (['寰宇蝗灾', '帝弓光矢', '命途对撞', '欢愉诡计'].includes(card.name)) v = 1.7;
    else if (['普通战利品', '精致战利品', '珍贵战利品', '华丽战利品', '贵重战利品', '纯美骑士客串'].includes(card.name)) v = 1.4;
    if (my && my.handCount <= 2) v += 0.3;
    if (my && my.hp <= 2 && card.name === '闪身步') v += 0.4;
    return v;
  };

  // 估算结束回合时会因手牌上限被迫弃掉的价值；用于避免“主动跳过回合”
  // 把有用的牌送进弃牌堆。removeCount 表示该动作本身会消耗的手牌数。
  AI.keepValue = function (pub, my, mind, card) {
    let value = AI.cardValue(card, my);
    const hand = my.hand || [];
    const copies = hand.filter(c => c.name === card.name).length;
    if (card.name === '闪身步' && copies === 1) value += my.hp <= 2 ? 1.2 : 0.4;
    if (card.name === '药王慈怀' && copies === 1 && my.hp <= 2) value += 1.4;
    if (card.name === '再见安打' && AI.canUseAnDa(my)) value += copies === 1 ? 0.8 : 0.2;
    if (card.type === 'equip') {
      const slot = C.getSlot(card);
      const cur = my.equipment && my.equipment[slot];
      if (!cur) value += 0.6;
      else if (cur.uid === card.uid) value += 0.8;
      else if (cur.name === card.name || (slot === 'vehicle' && cur.subtype === card.subtype)) value *= 0.35;
    }
    const plan = AI.comboPlan(pub, my, mind);
    if ((plan.active || plan.equipWanted) &&
        ['再见安打', '奇巧零食', '银河球棒'].includes(card.name)) value += 1.6;
    if (AI.aggressionMultiplier(pub) > 1 && ['再见安打', '奇巧零食'].includes(card.name)) value += 0.6;
    return Math.max(0, value);
  };

  AI.discardOrder = function (pub, my, mind, cards) {
    return (cards || []).slice().sort((a, b) =>
      AI.keepValue(pub, my, mind, a) - AI.keepValue(pub, my, mind, b));
  };

  AI.handDiscardCost = function (my, removeCount, pub, mind) {
    if (!my) return 0;
    const sorted = AI.discardOrder(pub, my, mind, my.hand);
    const remaining = sorted.slice(Math.max(0, removeCount || 0));
    const over = Math.max(0, remaining.length - G.handLimit(my));
    return remaining.slice(0, over).reduce((sum, c) =>
      sum + AI.keepValue(pub, my, mind, c) * 1.6, 0);
  };

  // 比较现在结束与执行动作后的弃牌损失，不把少弃牌等同于免费用牌。
  AI.discardSaving = function (pub, my, mind, c) {
    const before = AI.handDiscardCost(my, 0, pub, mind);
    if (!before) return 0;
    let spent = c.cardId ? [c.cardId] : [];
    if (c.useSnack && c.snackId) spent.push(c.snackId);
    if (c.kind === 'shield') spent = c.costId ? [c.costId] : AI.discardOrder(pub, my, mind, my.hand).slice(0, 1).map(x => x.uid);
    if (c.kind === 'chainsaw') spent = AI.discardOrder(pub, my, mind, my.hand).slice(0, 2).map(x => x.uid);
    if (c.kind === 'himeko') spent = (my.hand || []).slice(0, 2).map(x => x.uid);
    if (!spent.length) return 0;
    const hand = (my.hand || []).filter(x => !spent.includes(x.uid));
    const after = Object.assign({}, my, { hand, handCount: hand.length });
    if (c.kind === 'heal') after.hp = Math.min(my.maxHp, my.hp + 1);
    if (c.kind === 'equip') after.equipment = Object.assign({}, my.equipment, { [C.getSlot(c.card)]: c.card });
    // 战利品至少补回一张；不能把抽牌的手牌增长误算成消耗。
    if (c.kind === 'trick' && AI.isGainCandidate(c)) return 0;
    return Math.max(0, before - AI.handDiscardCost(after, 0, pub, mind));
  };

  // ----- 关系/威胁/目标价值 -----
  AI.relation = function (pub, my, mind, target) {
    if (!target || target.id === my.id) return { enemy: -100, ally: 100, known: true };
    const b = AI.belief(pub, my, mind, target);
    let enemy = 0, ally = 0;
    const navigatorAlive = target.isNavigator && target.alive;
    if (navigatorAlive) {
      if (my.identity === 'navigator') { ally = 4; enemy = -100; }
      else if (my.identity === 'loyalist') { ally = 3.2; enemy = -100; }
      else if (my.identity === 'rebel') {
        // 虚卒开局直接施压，不再为了隐藏身份压低领航员目标价值。
        enemy = 2.5;
        if (target.hp <= 2) enemy += 0.8;
      } else if (my.identity === 'traitor') {
        // 内鬼必须等除领航员外所有人阵亡后才能击败领航员，否则会给虚卒送胜。
        // 但其他人还在时，可以小幅消耗健康领航员，避免残局面对满血领航员。
        const others = pub.players.filter(q => q.alive && q.id !== my.id && q.id !== target.id && !q.isNavigator);
        if (!others.length) enemy = 3.4;
        else enemy = -8;
      }
    } else if (!target.alive && target.identity) {
      const role = target.identity;
      if (my.identity === 'navigator' || my.identity === 'loyalist') {
        if (role === 'rebel') enemy = 2.2;
        else if (role === 'traitor') enemy = 1.5;
        else if (role === 'loyalist') ally = 1.8;
      } else if (my.identity === 'rebel') {
        if (role === 'rebel') ally = 2.2;
        else if (role === 'loyalist') enemy = 1.4;
        else if (role === 'traitor') enemy = 0.9;
      } else if (my.identity === 'traitor') {
        if (role === 'rebel') enemy = 1.1;
        else if (role === 'loyalist') enemy = 1.0;
      }
    } else {
      const rebel = b.rebel || 0, loyal = b.loyalist || 0, traitor = b.traitor || 0;
      if (my.identity === 'navigator' || my.identity === 'loyalist') {
        enemy = rebel * 1.9 + traitor * 1.05;
        ally = loyal * 1.4;
      } else if (my.identity === 'rebel') {
        enemy = loyal * 1.35 + traitor * 0.75;
        ally = rebel * 1.5;
      } else if (my.identity === 'traitor') {
        // 前期清虚卒，同时削弱无名客；不主动碰领航员。
        enemy = rebel * 1.55 + loyal * 1.2;
        ally = 0;
        if (pub.players.filter(q => q.alive && q.id !== my.id && !q.isNavigator).length <= 1) {
          enemy += 0.5;
        }
      }
    }
    if (b.role === 'unknown') {
      // 降低“身份未知”造成的过度保守：仍不攻击明确友方，但允许更多试探。
      enemy *= 0.7;
      ally *= 0.7;
    }
    return { enemy, ally, belief: b };
  };

  AI.trustedAlly = function (pub, my, mind, target) {
    if (target.id === my.id) return true;
    if (target.isNavigator) return my.identity === 'navigator' || my.identity === 'loyalist';
    const b = AI.belief(pub, my, mind, target);
    const role = my.identity === 'rebel' ? 'rebel' :
      (my.identity === 'navigator' || my.identity === 'loyalist' ? 'loyalist' : null);
    return !!(role && b.role === role && b.confidence >= 0.65);
  };

  AI.canProbeTarget = function (pub, my, mind, target) {
    if (!target || !target.alive || isProtected(target) || target.id === my.id || target.isNavigator) return false;
    if (mind && mind.probeTurn === my.turnSerial) return false;
    if (AI.trustedAlly(pub, my, mind, target)) return false;
    const rel = AI.relation(pub, my, mind, target);
    const b = rel.belief;
    if (!b || b.known || (b.role !== 'unknown' && b.confidence >= 0.65)) return false;
    if (rel.ally > rel.enemy + 0.5) return false;
    const threshold = mind && mind.openingAggressor ? 0.3 : 0.4;
    return AI.possibleEnemyScore(pub, my, mind, target) >= threshold;
  };

  // 统一的“可攻击/可施加负面效果”目标判断；身份模糊时保留更高的容错。
  AI.canHostileTarget = function (rel) {
    if (!rel) return false;
    return rel.enemy > rel.ally + 0.05 && rel.enemy >= 0.15;
  };

  AI.threat = function (pub, my, mind, target) {
    if (!target || !target.alive) return 0;
    const rel = AI.relation(pub, my, mind, target);
    const equip = AI.equipValue(target.equipment);
    const base = (target.hp || 0) * 0.5 + (target.handCount || 0) * 0.8 + equip;
    const enemy = Math.max(0, rel.enemy || 0);
    const ally = Math.max(0, rel.ally || 0);
    return base + enemy * 1.8 - ally * 0.9;
  };

  AI.targetValue = function (pub, my, mind, target) {
    if (!target || !target.alive) return 0;
    const rel = AI.relation(pub, my, mind, target);
    if (rel.enemy <= -50) return 0;
    if (rel.ally > 3 && rel.enemy <= 0) return 0;
    const threat = AI.threat(pub, my, mind, target);
    let v = 0.35 + Math.max(0, threat) * 0.34 + Math.max(0, rel.enemy) * 1.8 - Math.max(0, rel.ally) * 1.5;
    if (target.isNavigator) v += 0.7 + (target.hp <= 2 ? 1.2 : 0);
    // 别人的攻击不能把受害者自动变成敌人；残血收益只用于独立判断的敌方。
    const directHostility = (pub.aiActions && pub.aiActions.hostile && pub.aiActions.hostile[target.id]) || {};
    const directEnemy = target.isNavigator ? my.identity === 'rebel' ||
      (my.identity === 'traitor' && !pub.players.some(p => p.alive && p.id !== my.id && p.id !== target.id)) :
      (directHostility[my.id] || 0) > 0 ||
      ((my.identity === 'navigator' || my.identity === 'loyalist') && (directHostility[pub.navigatorId] || 0) > 0) ||
      (rel.belief && rel.belief.confidence >= 0.65 && AI.canHostileTarget(rel));
    if (directEnemy) {
      if (target.hp <= 2) v += 0.45;
      if (target.hp <= 1) v += 0.7;
      if (target.hp < target.maxHp) v += 0.15;
    }
    return Math.max(0, v);
  };

  AI.selfValue = function (my) {
    const role = my.identity;
    const factor = role === 'navigator' ? 1.7 : role === 'traitor' ? 1.45 : role === 'loyalist' ? 1.25 : 0.95;
    return (my.hp * 0.75 + my.handCount * 0.35 + AI.equipValue(my.equipment) * 0.4) * factor;
  };

  AI.exposureCost = function (pub, my, target) {
    if (!target) return 0;
    if (my.identity === 'traitor') {
      if (target.isNavigator) {
        const others = pub.players.some(p => p.alive && p.id !== my.id && p.id !== target.id);
        return others ? 8 : 0;
      }
      return 0.05;
    }
    if (my.identity === 'rebel') return 0;
    if (my.identity === 'loyalist' || my.identity === 'navigator') {
      if (target.isNavigator) return 0;
      return 0.01;
    }
    return 0;
  };

  AI.killBonus = function (pub, my, mind, target, dmg, hitChance) {
    if (!target || !target.alive) return 0;
    const willKill = hitChance * (dmg >= target.hp ? 1 : 0);
    if (!willKill) return 0;
    if (target.isNavigator) {
      if (my.identity === 'rebel') return 8;
      if (my.identity === 'traitor') {
        const others = pub.players.filter(q => q.alive && q.id !== my.id && q.id !== target.id && !q.isNavigator);
        return others.length ? -12 : 8;
      }
      return 0;
    }
    const knownRole = (!target.alive && target.identity) ? target.identity : null;
    if (knownRole) {
      if (my.identity === 'navigator' || my.identity === 'loyalist') {
        if (knownRole === 'rebel') return 1.5;
        if (knownRole === 'traitor') return 1.1;
        if (knownRole === 'loyalist') return -3;
      } else if (my.identity === 'rebel') {
        if (knownRole === 'loyalist') return 0.6;
        if (knownRole === 'traitor') return 0.4;
        if (knownRole === 'rebel') return -2;
      } else if (my.identity === 'traitor') {
        if (knownRole === 'rebel') return 0.7;
        if (knownRole === 'loyalist') return 0.5;
      }
    }
    const b = AI.belief(pub, my, mind, target);
    if (my.identity === 'navigator' || my.identity === 'loyalist') return 0.9 * (b.rebel || 0) + 0.4 * (b.traitor || 0) - 0.8 * (b.loyalist || 0);
    if (my.identity === 'rebel') return 0.5 * (b.loyalist || 0) + 0.2 * (b.traitor || 0) - 0.7 * (b.rebel || 0);
    return 0.3 * ((b.rebel || 0) + (b.loyalist || 0));
  };

  AI.validAttackTargets = function (pub, my, range) {
    return (pub.players || []).filter(p =>
      p.alive && p.id !== my.id && !isProtected(p) &&
      distanceOf(pub, my.id, p.id) <= (range == null ? my.attackRange : range)
    );
  };

  AI.canUseAnDa = function (my) {
    if (my.anDaUsed < 1 + (my.extraAnDa || 0)) return true;
    return !!(my.equipment && my.equipment.weapon && my.equipment.weapon.name === '银河球棒');
  };

  AI.attackDamage = function (pub, my, target, card, useSnack) {
    let dmg = 1;
    if (useSnack) dmg += 1;
    if (my.path === 'destruction' && !my.destructionUsedTurn) dmg += 1;
    if (my.preservationPenalty) dmg -= 1;
    const weapon = my.equipment && my.equipment.weapon;
    if (weapon && weapon.name === '火力风暴潮' && (target.handCount || 0) === 0) dmg += 1;
    if (target.path === 'destruction' && target.destructionPenalty) dmg += 1;
    // 存护减伤先于防具封顶，与规则伤害流水线保持一致。
    if (target.path === 'preservation' && !hasStatus(target, 'cannot_protect')) dmg = Math.max(0, dmg - 1);
    if (target.equipment && target.equipment.armor) {
      const armor = target.equipment.armor.name;
      if (armor === '绝对热量' && !(weapon && weapon.name === '击云')) dmg = Math.min(1, dmg);
      if (armor === '很硬的甲' && ['雷', '风', '物理'].includes(card.element) && !(weapon && weapon.name === '击云')) return 0;
    }
    return Math.max(0, dmg);
  };

  AI.chooseBestAnDaCard = function (pub, my, target) {
    const cards = (my.hand || []).filter(c => c.name === '再见安打');
    let best = null;
    let bestScore = -1;
    for (const c of cards) {
      const dmg = AI.attackDamage(pub, my, target, c, false);
      if (dmg <= 0) continue;
      const score = dmg + (c.element === '冰' ? 0.01 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  };

  AI.scoreAnDa = function (pub, my, mind, target, card, useSnack) {
    const dmg = AI.attackDamage(pub, my, target, card, useSnack);
    if (dmg <= 0) return -100;
    const hit = 1 - AI.dodgeChance(pub, my, mind, target);
    const shield = target.shield || 0;
    const hpDamage = Math.max(0, dmg - shield);
    const targetValue = AI.targetValue(pub, my, mind, target);
    const rel = AI.relation(pub, my, mind, target);
    let score = hit * (hpDamage + (shield > 0 ? 0.25 : 0)) * targetValue * 1.15;
    score += hit * (rel.enemy || 0) * 0.55;
    score += AI.killBonus(pub, my, mind, target, dmg, hit) * (dmg >= target.hp ? 1 : 0.2);
    score -= AI.cardValue(card, my) * 0.32;
    if (useSnack) score -= AI.cardValue(CARD('奇巧零食'), my) * 0.25;
    score -= AI.exposureCost(pub, my, target);
    if (my.identity === 'traitor' && target.isNavigator) {
      const others = pub.players.filter(q => q.alive && q.id !== my.id && q.id !== target.id && !q.isNavigator);
      if (others.length && (target.hp <= 3 || dmg >= target.hp)) return -100;
    }
    if (my.hp <= 1) score += 0.15;
    return score;
  };

  AI.scoreEquip = function (pub, my, card, mind) {
    const slot = C.getSlot(card);
    if (!slot) return -100;
    let value = 0;
    if (slot === 'weapon') {
      const cur = my.equipment.weapon;
      if (cur && cur.name === card.name) return -100;
      const oldRange = Number.isFinite(my.attackRange)
        ? my.attackRange
        : 1 + (cur ? C.getWeaponRange(cur) : 0) + (my.characterId === 'himeko' ? 1 : 0);
      const newRange = 1 + C.getWeaponRange(card) + (my.characterId === 'himeko' ? 1 : 0);
      const effectDelta = AI.weaponEffectValue(card) - AI.weaponEffectValue(cur);
      const need = AI.requiredWeaponRange(pub, my, mind);
      const canReachNow = need === Infinity || oldRange >= need;
      if (!cur) {
        value = 0.45 + newRange * 0.18 + AI.weaponEffectValue(card) * 0.35;
      } else if (!canReachNow) {
        // 当前打不到明确敌人：先补攻击范围，再考虑武器效果。
        value = (newRange - oldRange) * 0.9 + effectDelta * 0.35;
        if (need !== Infinity && newRange >= need) value += 0.85;
      } else {
        // 已经能打到敌人：优先比较武器效果；换掉后打不到则明显降分。
        value = effectDelta * 0.95 + (newRange - oldRange) * 0.3;
        if (need !== Infinity && newRange < need) value -= 1.1;
      }
    } else if (slot === 'armor') {
      const cur = my.equipment.armor;
      const curVal = cur ? AI.equipValue({ armor: cur }) : 0;
      const newVal = AI.equipValue({ armor: card });
      value = (newVal - curVal) * 0.75 + (cur ? 0 : 0.55);
      if (my.hp <= 2) value += 0.35;
    } else {
      const cur = my.equipment.vehicle;
      // 同名或同子类型载具效果完全相同；主动换装只会白白弃掉旧牌。
      // 不在出牌阶段主动替换；弃牌阶段仍可按正常逻辑弃置同名牌。
      if (cur && (cur.name === card.name || cur.subtype === card.subtype)) return -100;
      value = (cur ? 0.1 : 0.55) + (card.subtype && card.subtype.indexOf('+1') >= 0 ? (my.identity === 'navigator' || my.identity === 'loyalist' ? 0.35 : 0.1) : 0.25);
    }
    value -= AI.cardValue(card, my) * 0.22;
    return value;
  };

  AI.scoreHeal = function (pub, my, card) {
    if (my.hp >= my.maxHp) return -100;
    const deficit = my.maxHp - my.hp;
    const roleFactor = my.identity === 'navigator' ? 1.35 : my.identity === 'traitor' ? 1.2 : my.identity === 'loyalist' ? 1.05 : 0.85;
    // 桃要留给真正的危险线；满血/轻伤时囤着，避免双方互相回血拖长对局。
    let base;
    if (my.hp <= 1) base = 4.2;
    else if (my.hp <= 2) base = 0.8;
    else if (my.hp <= 3) base = 0.55;
    else base = 0.35;
    let score = (base + Math.max(0, deficit - 1) * 0.35) * roleFactor;
    score -= AI.cardValue(card, my) * 0.28;
    return score;
  };

  AI.scoreShield = function (pub, my, mind, target) {
    if (!target || !target.alive) return -100;
    const rel = AI.relation(pub, my, mind, target);
    if (target.id !== my.id) {
      // 明确敌人绝不套盾；身份模糊时放宽友方判断，允许提前保护。
      if (rel.enemy >= rel.ally + 0.05) return -100;
      if (rel.ally < 0.2) return -100;
    }
    if (my.identity === 'traitor' && target.id !== my.id) return -100;
    const layers = target.shieldLayers || [];
    const refresh = (target.shield || 0) >= 2 &&
      (layers.length ? layers.some(l => l.turns < 2) : (target.shieldTurns || 0) < 2);
    if ((target.shield || 0) >= 2 && !refresh) return -100;
    const cost = AI.discardOrder(pub, my, mind, my.hand)[0];
    if (!cost) return -100;
    const overflow = my.handCount > G.handLimit(my);
    const critical = AI.keepValue(pub, my, mind, cost) >= 3;
    const finishingAttack = cost.name === '再见安打' && AI.canUseAnDa(my) &&
      AI.validAttackTargets(pub, my).some(t => AI.canHostileTarget(AI.relation(pub, my, mind, t)) &&
        AI.attackDamage(pub, my, t, cost, false) >= t.hp + (t.shield || 0));
    if (finishingAttack) return -100;
    if (critical && !overflow && target.hp > 1) return -100;
    let score = 0.85 + (target.id === my.id ? 0.25 : 0.1);
    if (target.hp < target.maxHp) {
      score += 0.2 + (target.hp <= 2 ? 0.3 : 0);
    } else if (pub.round <= 3) {
      // 满血也可以预铺盾，尤其开局阶段。
      score += 0.18;
    }
    if (pub.round <= 3) score += 0.12;
    if (!(target.shield || 0)) score += 0.08;
    if (target.isNavigator && (my.identity === 'loyalist' || my.identity === 'navigator')) score += 0.35;
    score -= (target.shield || 0) * 0.18;
    if (refresh) score *= 0.7;
    score -= AI.keepValue(pub, my, mind, cost) * 0.24;
    return score;
  };

  AI.scoreLoot = function (pub, my, card) {
    // 手牌多也可以先检索可用进攻/装备牌；明显没有容纳空间时才暂缓。
    if (my.hp > 1 && my.handCount > G.handLimit(my) + 3) return -100;
    let draw = my.handCount <= 2 ? 1.8 : 0.9;
    if (card.name === '精致战利品') draw += 0.9;
    if (card.name === '珍贵战利品') draw += 1.1;
    if (card.name === '华丽战利品') draw += 1.5;
    if (card.name === '贵重战利品') draw += 1.35;
    if (card.name === '普通战利品') draw += 0.15;
    return draw + (my.hp <= 1 ? 3 : 0) - AI.cardValue(card, my) * 0.2;
  };

  AI.scoreTrick = function (pub, my, mind, card, target, extra) {
    const name = card.name;
    if (name === '普通战利品' || name === '精致战利品' || name === '珍贵战利品' || name === '华丽战利品' || name === '贵重战利品') {
      return AI.scoreLoot(pub, my, card);
    }
    if (name === '纯美骑士客串') {
      let score = 0.55 + (my.handCount <= 2 ? 0.7 : 0.15) + (pub.round <= 2 ? 0.15 : 0);
      let friendlyGain = 0;
      let hostileGain = 0;
      for (const p of pub.players) {
        if (!p.alive || isProtected(p)) continue;
        if (p.id === my.id) {
          friendlyGain += 1;
          continue;
        }
        const rel = AI.relation(pub, my, mind, p);
        if (rel.ally > rel.enemy + 0.1 && rel.ally >= 0.2) friendlyGain++;
        else if (AI.canHostileTarget(rel)) hostileGain++;
      }
      // 纯美正常使用；友方和自己拿到牌是主要收益，敌方拿到牌只做轻微扣分。
      score += Math.min(0.4, friendlyGain * 0.06) - Math.min(0.25, hostileGain * 0.04);
      score -= AI.cardValue(card, my) * 0.15;
      return score;
    }
    if (name === '同谐共鸣') {
      let score = -AI.cardValue(card, my) * 0.2;
      const selfWounded = my.hp < my.maxHp;
      const selfRisk = my.hp <= 2;
      // 自己只是轻伤时不为了回血而顺便救敌方；真正有淘汰风险才优先自保。
      if (selfWounded) score += selfRisk ? 0.85 : 0.3;
      let friendHeal = 0;
      let enemyHeal = 0;
      let enemyFull = 0;
      let unknownHeal = 0;
      for (const p of pub.players) {
        if (!p.alive || p.id === my.id || isProtected(p)) continue;
        const rel = AI.relation(pub, my, mind, p);
        const hostile = AI.canHostileTarget(rel);
        if (p.hp >= p.maxHp) {
          if (hostile) enemyFull++;
          continue;
        }
        if (hostile) {
          // 明确敌方回血是负收益；不硬性禁用，允许身份误判和冒险决策。
          enemyHeal++;
          score -= 0.2 + Math.min(1, rel.enemy) * 0.06;
        } else if (rel.ally > rel.enemy + 0.1 && rel.ally >= 0.2) {
          friendHeal++;
          score += 0.4 + Math.min(1, rel.ally) * 0.15 + (p.hp <= 2 ? 0.15 : 0);
        } else {
          unknownHeal++;
          // 判断模糊时不必过度谨慎，保留正常使用意愿。
          score += 0.12;
        }
      }
      // 全场都已满血时没有任何回复收益，不要浪费这张牌。
      if (!selfWounded && !friendHeal && !enemyHeal && !unknownHeal) return -100;
      // 友方有伤、敌方满血：这张牌只帮友方，优先使用。
      if (friendHeal && enemyFull) score += 0.3;
      // 没有明确敌方会回血时，群体治疗不会助敌；保留正常使用频率。
      if (!enemyHeal) score += 0.5;
      // 明确只治疗敌人时降低使用意愿，但不再硬性禁用。
      if (enemyHeal && !friendHeal && !selfRisk && !unknownHeal) score -= 0.45;
      if (enemyHeal > friendHeal && !selfRisk) score -= 0.2;
      if (pub.round <= 2) score += 0.1;
      return score;
    }
    if (name === '随蝴蝶一起消散吧') {
      if (!target) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (!AI.canHostileTarget(rel)) return -100;
      let score = 0.7 + Math.max(0, rel.enemy) * 0.6 + (target.handCount ? 0.3 : 0);
      score += AI.equipValue(target.equipment) * 0.28;
      if (target.equipment && target.equipment.armor) score += 1.0;
      score -= AI.cardValue(card, my) * 0.3;
      score -= AI.exposureCost(pub, my, target);
      return score;
    }
    if (name === '星核猎手') {
      if (!target) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (!AI.canHostileTarget(rel)) return -100;
      if (distanceOf(pub, my.id, target.id) > 1) return -100;
      let score = 0.75 + Math.max(0, rel.enemy) * 0.65 + AI.equipValue(target.equipment) * 0.35;
      score += target.handCount ? 0.25 : 0;
      if (target.equipment && target.equipment.armor) score += 1.0;
      score -= AI.cardValue(card, my) * 0.3;
      return score;
    }
    if (name === '命途对撞') {
      if (!target) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (!AI.canHostileTarget(rel)) return -100;
      if (target.characterId === 'danheng') return -100;
      const targetHas = AI.anDaChance(pub, my, mind, target);
      const myHas = (my.hand || []).some(c => c.name === '再见安打');
      let score = (1 - targetHas) * AI.targetValue(pub, my, mind, target) * 0.85;
      score -= targetHas * (myHas ? 0.1 : 0.7) * AI.selfValue(my) * 0.18;
      // 自己手里没有安打时，连锁对撞的续航很差；降低使用欲望，但不完全禁用。
      if (!myHas) score *= 0.72;
      score -= AI.cardValue(card, my) * 0.3;
      return score;
    }
    if (name === '寰宇蝗灾' || name === '帝弓光矢') {
      let score = -AI.cardValue(card, my) * 0.2;
      let safeFriends = 0;
      let riskFriends = 0;
      let weakEnemies = 0;
      for (const p of pub.players) {
        if (!p.alive || p.id === my.id || isProtected(p)) continue;
        const rel = AI.relation(pub, my, mind, p);
        const miss = name === '寰宇蝗灾' ? 1 - AI.anDaChance(pub, my, mind, p) : 1 - AI.dodgeChance(pub, my, mind, p);
        // 少量非致命友伤不再压过对敌收益；领航员/可信队友的致命风险仍保留。
        let damage = 1 - (my.path === 'preservation' && my.preservationPenalty ? 1 : 0) +
          (p.path === 'destruction' && p.destructionPenalty ? 1 : 0);
        if (p.equipment.armor && p.equipment.armor.name === '绝对热量') damage = Math.min(1, damage);
        const reduced = p.path === 'preservation' && !hasStatus(p, 'cannot_protect') ? 1 : 0;
        const lethal = p.hp + (p.shield || 0) <= Math.max(0, damage - reduced);
        if (lethal && (AI.trustedAlly(pub, my, mind, p) ||
            (p.isNavigator && my.identity === 'traitor'))) return -100;
        const impact = miss * (0.8 + Math.max(0, rel.enemy) * 0.6 - Math.max(0, rel.ally) * 0.32);
        score += impact;
        const friendly = rel.ally > rel.enemy + 0.1 && rel.ally >= 0.2;
        if (friendly) {
          const safe = p.handCount >= 2 && p.hp > 2;
          if (safe) {
            safeFriends++;
            score += miss * 0.1;
          } else {
            riskFriends++;
            score -= miss * 0.06;
          }
        } else if (AI.canHostileTarget(rel)) {
          // 敌方手牌不足时更可能吃伤害；这是主要收益来源。
          if (p.handCount <= 1 || miss >= 0.65) {
            weakEnemies++;
            score += miss * 0.16;
          }
        }
        // 模糊目标保持基础评分，不额外谨慎，避免整体使用率明显下降。
      }
      if (pub.round <= 2) score += 0.15;
      if (safeFriends && weakEnemies) score += 0.28;
      if (riskFriends && !weakEnemies) score -= 0.15;
      if (!safeFriends && !weakEnemies) score -= 0.05;
      return score;
    }
    if (name === '欢愉诡计') {
      const forced = extra && extra.forced;
      const victim = extra && extra.victim;
      if (!forced || !victim) return -100;
      const rf = AI.relation(pub, my, mind, forced);
      const rv = AI.relation(pub, my, mind, victim);
      // 被强迫者和受害者都必须是明确敌方，避免把友方卷进内耗。
      if (!AI.canHostileTarget(rf) || !AI.canHostileTarget(rv)) return -100;
      const forcedHas = AI.anDaChance(pub, my, mind, forced);
      let score = -AI.cardValue(card, my) * 0.2;
      // 有安打：受害者挨打；无安打：被强迫者挨无来源伤害。
      score += forcedHas * (1 - AI.dodgeChance(pub, my, mind, victim)) * AI.targetValue(pub, my, mind, victim) * 0.85;
      score += (1 - forcedHas) * AI.targetValue(pub, my, mind, forced) * 0.85;
      score -= (1 - forcedHas) * Math.max(0, rf.ally) * 0.8;
      score -= forcedHas * Math.max(0, rv.ally) * 0.8;
      return score;
    }
    if (name === '记忆冰封') {
      if (!target) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (!AI.canHostileTarget(rel)) return -100;
      let score = (0.52 + AI.targetValue(pub, my, mind, target) * 0.55) * 0.9;
      if (target.isNavigator) score += 0.4;
      score -= AI.cardValue(card, my) * 0.3;
      score -= AI.exposureCost(pub, my, target);
      return score;
    }
    if (name === '终末裁决') {
      if (!target) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (!AI.canHostileTarget(rel)) return -100;
      // 大约 1/7 立即造成 3 点；失败会转移，收益按目标价值打折。
      let score = AI.targetValue(pub, my, mind, target) * 0.62 + 0.35;
      if (target.isNavigator) score += 0.65;
      const aliveN = pub.players.filter(p => p.alive).length;
      // 终局更愿意冒着 1/7 的判定风险打出终末裁决，打破残局僵持。
      if (aliveN <= 2) score += 2.2;
      else if (aliveN === 3) score += 0.5;
      if (pub.round > 10) score += 0.4;
      if (target.hp <= 2) score += 0.9;
      if (target.hp <= 1) score += 0.5;
      if (target.path === 'preservation' || (target.equipment && target.equipment.armor && target.equipment.armor.name === '绝对热量')) score += 1.2;
      score -= AI.cardValue(card, my) * 0.3;
      score -= AI.exposureCost(pub, my, target);
      return score;
    }
    return -100;
  };

  AI.scoreSkillPoint = function (pub, my, mind) {
    // 普通赌博仍保留“一回合至多一次、每局至多两次”的限制；
    // 事件 5【花姐】规则明确单个出牌阶段次数不限，因此在事件 5 中解除限制。
    if (!my.skillPoints) return -100;
    if (my.handCount < 4 || my.hp < 3) return -100;
    const event5 = !!(pub.fieldEffect && pub.fieldEffect.id === 5);
    if (!event5 && mind && mind.skillPointTurn === my.turnSerial) return -100;
    if (!event5 && mind && (mind.skillPointTotal || 0) >= 2) return -100;
    return 0.18;
  };

  AI.generateCandidates = function (pub, my, mind) {
    const out = [];
    const push = (kind, label, extra) => out.push(Object.assign({ kind, label }, extra || {}));
    const others = (pub.players || []).filter(p => p.alive && p.id !== my.id && !isProtected(p));

    // 治疗：出牌阶段只能对自己使用，价值仍由生存权重决定。
    for (const c of (my.hand || []).filter(c => c.name === '药王慈怀')) {
      if (my.hp < my.maxHp) push('heal', `药王慈怀→自己`, { cardId: c.uid, card: c, targetId: my.id });
    }

    // 装备。同名或同子类型载具没有收益，不在出牌阶段主动换装；
    // 弃牌阶段仍可按正常逻辑弃置这些牌。
    for (const c of (my.hand || []).filter(c => c.type === 'equip')) {
      const slot = C.getSlot(c);
      const cur = slot === 'vehicle' ? my.equipment.vehicle : null;
      if (cur && (cur.name === c.name || cur.subtype === c.subtype)) continue;
      push('equip', `装备 ${c.name}`, { cardId: c.uid, card: c });
    }

    // 三月七护盾：允许对满血目标预铺盾；每回合仍受技能次数上限约束。
    if (my.characterId === 'march7' && my.shieldUsedTurn < 2 && my.handCount > 0) {
      const targets = (pub.players || []).filter(p => p.alive && !isProtected(p));
      for (const t of targets) {
        push('shield', `六相冰弓→${t.name}`, { targetId: t.id });
      }
    }

    // 普通安打与奇巧零食增伤
    if (AI.canUseAnDa(my)) {
      const targets = AI.validAttackTargets(pub, my);
      for (const t of targets) {
        const c = AI.chooseBestAnDaCard(pub, my, t);
        if (!c) continue;
        push('anda', `再见安打→${t.name}`, { cardId: c.uid, card: c, targetId: t.id, useSnack: false });
        const snack = (my.hand || []).find(x => x.name === '奇巧零食');
        if (snack && !my.snackUsed) {
          push('anda', `奇巧+安打→${t.name}`, { cardId: c.uid, card: c, snackId: snack.uid, targetId: t.id, useSnack: true });
        }
      }
    }

    // 姬子、电锯：都是虚拟安打，计入安打次数。
    if (my.characterId === 'himeko' && !my.himekoUsedTurn && my.handCount >= 2 && my.anDaUsed < 1 + (my.extraAnDa || 0)) {
      const targets = AI.validAttackTargets(pub, my);
      for (const t of targets) push('himeko', `拓星启行→${t.name}`, { targetId: t.id });
    }
    if (my.equipment && my.equipment.weapon && my.equipment.weapon.name === '高周波电锯' &&
        my.handCount >= 2 && my.anDaUsed < 1 + (my.extraAnDa || 0)) {
      const targets = AI.validAttackTargets(pub, my);
      for (const t of targets) push('chainsaw', `电锯安打→${t.name}`, { targetId: t.id });
    }

    // 锦囊
    for (const c of (my.hand || []).filter(c => c.type === 'trick')) {
      const name = c.name;
      if (name === '第IX机关' || name === '入梦池') continue;
      if (name === '普通战利品' || name === '精致战利品' || name === '珍贵战利品' ||
          name === '华丽战利品' || name === '贵重战利品' || name === '同谐共鸣' ||
          name === '纯美骑士客串') {
        push('trick', `使用 ${name}`, { cardId: c.uid, card: c });
        continue;
      }
      if (name === '寰宇蝗灾' || name === '帝弓光矢') {
        push('trick', `使用 ${name}`, { cardId: c.uid, card: c });
        continue;
      }
      if (name === '欢愉诡计') {
        const pairs = [];
        for (const f of others) {
          for (const v of others) {
            if (f.id === v.id) continue;
            pairs.push({ forcedId: f.id, victimId: v.id, f, v });
          }
        }
        pairs.sort((a, b) => AI.scoreTrick(pub, my, mind, c, null, { forced: b.f, victim: b.v }) -
          AI.scoreTrick(pub, my, mind, c, null, { forced: a.f, victim: a.v }));
        for (const pair of pairs.slice(0, 4)) {
          push('trick', `欢愉诡计→${pair.f.name}/${pair.v.name}`, {
            cardId: c.uid, card: c, forcedId: pair.forcedId, victimId: pair.victimId
          });
        }
        continue;
      }
      for (const t of others) {
        if (name === '星核猎手' && distanceOf(pub, my.id, t.id) > 1) continue;
        if (name === '命途对撞' && t.characterId === 'danheng') continue;
        push('trick', `${name}→${t.name}`, { cardId: c.uid, card: c, targetId: t.id });
      }
    }

    // 战技点：赌博收益低，只在手牌充裕且没有更优动作时考虑。
    if (my.skillPoints > 0) push('skillPoint', '消耗战技点', {});

    return out;
  };

  AI.scoreCandidate = function (pub, my, mind, c) {
    const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
    // 普通安打/姬子/电锯都走同一道友方误伤保护。
    if (target && (c.kind === 'anda' || c.kind === 'himeko' || c.kind === 'chainsaw')) {
      const rel = AI.relation(pub, my, mind, target);
      if (AI.trustedAlly(pub, my, mind, target)) return -100;
      if (rel.ally > rel.enemy + 0.1 && !AI.canProbeTarget(pub, my, mind, target)) return -100;
    }
    let score = -100;
    if (c.kind === 'anda') {
      score = AI.scoreAnDa(pub, my, mind, target, c.card, c.useSnack);
    } else if (c.kind === 'heal') {
      score = AI.scoreHeal(pub, my, c.card);
    } else if (c.kind === 'equip') {
      score = AI.scoreEquip(pub, my, c.card, mind);
    } else if (c.kind === 'shield') {
      score = AI.scoreShield(pub, my, mind, target);
    } else if (c.kind === 'himeko') {
      const dmg = 1;
      const hit = 1 - AI.dodgeChance(pub, my, mind, target);
      score = hit * dmg * AI.targetValue(pub, my, mind, target) * 0.9;
      score += AI.killBonus(pub, my, mind, target, dmg, hit);
      score -= 1.1; // 两张手牌成本
      score -= AI.exposureCost(pub, my, target);
    } else if (c.kind === 'chainsaw') {
      const dmg = 1;
      const hit = 1 - AI.dodgeChance(pub, my, mind, target);
      score = hit * dmg * AI.targetValue(pub, my, mind, target) * 0.9;
      score += AI.killBonus(pub, my, mind, target, dmg, hit);
      score -= 0.95;
      score -= AI.exposureCost(pub, my, target);
    } else if (c.kind === 'trick') {
      const extra = {};
      if (c.forcedId) extra.forced = (pub.players || []).find(p => p.id === c.forcedId);
      if (c.victimId) extra.victim = (pub.players || []).find(p => p.id === c.victimId);
      score = AI.scoreTrick(pub, my, mind, c.card, target, extra);
    } else if (c.kind === 'skillPoint') {
      score = AI.scoreSkillPoint(pub, my, mind);
    }
    return score;
  };

  // 开局身份信息很少时，若所有目标都被判成“友方”而AI手里有可用攻击牌，
  // 允许对最可疑的未确认目标低优先级出手。只使用公开身份分布、死亡身份和自身信念，
  // 不读取任何隐藏身份；仅在前 3 轮兜底，避免长期无动作。
  AI.possibleEnemyScore = function (pub, my, mind, target) {
    if (!target || !target.alive || target.id === my.id) return 0;
    // 领航员对无名客/领航员是友方；对虚卒是明确目标；内鬼前期不应主动碰领航员。
    if (target.isNavigator) return my.identity === 'rebel' ? 1 : 0;
    const b = AI.belief(pub, my, mind, target);
    if (my.identity === 'navigator' || my.identity === 'loyalist') {
      return (b.rebel || 0) + (b.traitor || 0);
    }
    if (my.identity === 'rebel') {
      return (b.loyalist || 0) + (b.traitor || 0) * 0.5;
    }
    if (my.identity === 'traitor') {
      return (b.rebel || 0) + (b.loyalist || 0) * 0.7;
    }
    return 0;
  };

  // 从当前可执行攻击中挑一个“非明确友方”的目标；只读公开信息和自身信念。
  AI.pickAttackCandidate = function (pub, my, mind, raw, opts) {
    if (!pub || !my || !mind || !raw || !raw.length) return null;
    const allyMargin = opts && Number.isFinite(opts.allyMargin) ? opts.allyMargin : 0.2;
    let best = null;
    for (const c of raw) {
      const isAttack = c && (['anda', 'himeko', 'chainsaw'].includes(c.kind) ||
        (c.kind === 'trick' && c.card && c.card.polarity === '负面' && c.targetId));
      if (!isAttack) continue;
      const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
      if (!target || !target.alive || target.id === my.id) continue;
      const rel = AI.relation(pub, my, mind, target);
      if (rel.enemy <= -50) continue;
      // 明确友方不主动攻击；角色主动进攻时放宽模糊目标的门槛。
      if (rel.ally > rel.enemy + allyMargin) continue;
      const targetValue = AI.targetValue(pub, my, mind, target);
      if (targetValue <= 0) continue;
      const suspect = Math.max(0, AI.possibleEnemyScore(pub, my, mind, target));
      const value = suspect + Math.max(0, rel.enemy) * 0.4 + targetValue * 0.12 +
        (c.kind === 'anda' ? 0.04 : 0);
      if (!best || value > best.value) best = { action: c, value };
    }
    return best;
  };

  // 开局主动者：在最初几轮以一定概率主动攻击，打开局面。
  AI.openingAttackAction = function (pub, my, mind, raw, rand) {
    if (!pub || !my || !mind || !mind.openingAggressor || pub.round > 3 || !raw || !raw.length) return null;
    const chance = pub.round <= 1 ? 0.8 : (pub.round === 2 ? 0.6 : 0.4);
    if (typeof rand === 'function' && rand() > chance) return null;
    const best = AI.pickAttackCandidate(pub, my, mind, raw);
    if (!best) return null;
    return {
      action: best.action,
      score: 0.12,
      candidates: [{ action: best.action, score: 0.12 }],
      scored: [{ action: best.action, score: 0.12 }]
    };
  };

  // 开局有装备且对应槽位为空时，先穿上再考虑其他动作；避免装备牌被
  // 强制弃牌阶段丢掉。只读取自己的手牌/装备。
  AI.openingEquipAction = function (pub, my, mind, raw) {
    if (!pub || pub.round > 2 || !raw || !raw.length) return null;
    let best = null;
    for (const c of raw) {
      if (!c || c.kind !== 'equip' || !c.card) continue;
      const slot = C.getSlot(c.card);
      if (!slot || (my.equipment && my.equipment[slot])) continue;
      const score = AI.scoreEquip(pub, my, c.card, mind);
      if (!isFinite(score) || score <= -100) continue;
      // 开局先补防具、载具；武器可以开局穿，也可以等到进攻前再穿。
      const rank = slot === 'armor' ? 3 : (slot === 'vehicle' ? 2 : 1);
      if (!best || rank > best.rank || (rank === best.rank && score > best.score)) {
        best = { action: c, rank, score };
      }
    }
    if (!best) return null;
    return {
      action: best.action,
      score: 0.18,
      candidates: [{ action: best.action, score: 0.18 }],
      scored: [{ action: best.action, score: 0.18 }]
    };
  };

  // 三月七开局优先把多余手牌转成护盾，尤其避免最后因手牌上限弃掉。
  AI.openingShieldAction = function (pub, my, mind, raw) {
    if (!pub || !my || my.characterId !== 'march7' ||
        my.shieldUsedTurn >= 2 || my.handCount < 2 || !raw) return null;
    const overflowing = my.handCount > G.handLimit(my);
    if (pub.round > 2 && !overflowing) return null;
    let best = null;
    for (const c of raw) {
      if (!c || c.kind !== 'shield') continue;
      const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
      if (!target || !target.alive || (target.shield || 0) >= 3) continue;
      const score = AI.scoreShield(pub, my, mind, target);
      if (!isFinite(score) || score <= 0.02) continue;
      if (!best || score > best.score) best = { action: c, score };
    }
    if (!best) return null;
    return {
      action: best.action,
      score: best.score,
      candidates: [{ action: best.action, score: best.score }],
      scored: [{ action: best.action, score: best.score }]
    };
  };

  // 无名客只要大体确认另一名无名客，就不再一直观望，主动攻击其他目标。
  AI.trustedLoyalist = function (pub, my, mind) {
    if (!pub || !my || my.identity !== 'loyalist') return null;
    for (const p of pub.players || []) {
      if (!p.alive || p.id === my.id || p.isNavigator) continue;
      const b = AI.belief(pub, my, mind, p);
      if ((b.loyalist || 0) >= 0.55) return p;
    }
    return null;
  };

  // 虚卒/内鬼最迟应在第二回合开始进攻，不再只依赖“开局主动者”。
  AI.earlyRoleAttackAction = function (pub, my, mind, raw) {
    if (!pub || !my || pub.round > 2 || (my.identity !== 'rebel' && my.identity !== 'traitor')) return null;
    const best = AI.pickAttackCandidate(pub, my, mind, raw, { allyMargin: 0.6 });
    if (!best) return null;
    return {
      action: best.action,
      score: 0.16,
      candidates: [{ action: best.action, score: 0.16 }],
      scored: [{ action: best.action, score: 0.16 }]
    };
  };

  AI.loyalistProactiveAction = function (pub, my, mind, raw) {
    if (!pub || !my || my.identity !== 'loyalist' || !AI.trustedLoyalist(pub, my, mind)) return null;
    const best = AI.pickAttackCandidate(pub, my, mind, raw);
    if (!best) return null;
    return {
      action: best.action,
      score: 0.14,
      candidates: [{ action: best.action, score: 0.14 }],
      scored: [{ action: best.action, score: 0.14 }]
    };
  };

  AI.earlyFallback = function (pub, my, mind, raw) {
    if (!pub || pub.round > 3 || !raw || !raw.length) return null;
    let best = null;
    for (const c of raw) {
      if (c.kind !== 'anda' && c.kind !== 'himeko' && c.kind !== 'chainsaw' &&
          !(c.kind === 'trick' && c.card && c.card.polarity === '负面')) continue;
      const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
      if (!target || !target.alive || target.id === my.id) continue;
      const rel = AI.relation(pub, my, mind, target);
      if (rel.ally > rel.enemy + 0.2) continue;
      const suspect = AI.possibleEnemyScore(pub, my, mind, target);
      if (suspect < 0.12) continue;
      const value = suspect + Math.max(0, rel.enemy) * 0.2 + (c.kind === 'anda' ? 0.02 : 0);
      if (!best || value > best.value) best = { action: c, value };
    }
    if (!best) return null;
    return {
      action: best.action,
      score: 0.09,
      candidates: [{ action: best.action, score: 0.09 }],
      scored: [{ action: best.action, score: 0.09 }]
    };
  };

  // 没有进攻/高价值动作时，优先做低风险的经营：补装备、拿战利品、
  // 回复/护盾或消耗战技点，避免连续空过。负面锦囊不在此兜底中使用。
  AI.managementFallback = function (pub, my, mind, raw) {
    if (!raw || !raw.length) return null;
    // 开局几轮放宽经营阈值：宁可先装备、用战利品/群体锦囊，也不要
    // 因分数略低而把牌留到弃牌阶段。负面锦囊仍不在兜底中使用。
    const early = pub.round <= 3;
    const overflow = Math.max(0, (my.handCount || 0) - G.handLimit(my));
    const minScore = overflow > 0 ? -0.6 : (early ? -0.35 : 0.02);
    let best = null;
    for (const c of raw) {
      if (!c) continue;
      if (c.kind === 'trick' && c.card && c.card.polarity === '负面') continue;
      if (!['equip', 'heal', 'shield', 'trick', 'skillPoint', 'dotRemove'].includes(c.kind)) continue;
      const score = AI.scoreCandidate(pub, my, mind, c);
      if (!isFinite(score)) continue;
      // 装备的负分换装交给下面的“空槽/明显升级”兜底，避免开局为用牌而换差装备。
      if (c.kind === 'equip' && score <= 0.02) continue;
      if (score <= minScore) continue;
      if (!best || score > best.score) best = { action: c, score };
    }
    // 没有正向经营动作时，优先补齐空装备槽；若已有装备，仅在换装能明显
    // 提升攻击范围/武器效果/防具价值时，允许分数略低的换装。
    // 这样 AI 不会因为换装成本的小幅扣分而长期空转，也能保住关键射程。
    if (!best) {
      for (const c of raw) {
        if (!c || c.kind !== 'equip' || !c.card) continue;
        const slot = C.getSlot(c.card);
        if (!slot) continue;
        const cur = my.equipment && my.equipment[slot];
        let score = AI.scoreEquip(pub, my, c.card, mind);
        if (!isFinite(score) || score <= -100) continue;
        if (!cur) {
          if (!best || score > best.score) best = { action: c, score };
          continue;
        }
        if (slot === 'weapon') {
          const oldRange = Number.isFinite(my.attackRange)
            ? my.attackRange
            : AI.attackRangeOf(my);
          const newRange = 1 + C.getWeaponRange(c.card) + (my.characterId === 'himeko' ? 1 : 0);
          const effectGain = AI.weaponEffectValue(c.card) - AI.weaponEffectValue(cur);
          if (newRange <= oldRange && effectGain <= 0.05) continue;
        } else if (slot === 'armor') {
          const oldValue = AI.equipValue({ armor: cur });
          const newValue = AI.equipValue({ armor: c.card });
          if (newValue <= oldValue + 0.15) continue;
        } else {
          continue;
        }
        if (score <= -0.4) continue;
        if (!best || score > best.score) best = { action: c, score };
      }
    }
    if (!best) return null;
    return {
      action: best.action,
      score: best.score,
      candidates: [{ action: best.action, score: best.score }],
      scored: [{ action: best.action, score: best.score }]
    };
  };

  AI.mustEquipAction = function (pub, my, mind, raw) {
    if (!my.alive || isProtected(my)) return null;
    let best = null;
    for (const c of raw || []) {
      if (c.kind !== 'equip' || !c.card) continue;
      const slot = C.getSlot(c.card);
      if (!['armor', 'vehicle'].includes(slot) || my.equipment[slot]) continue;
      const value = (slot === 'armor' ? 10 : 5) + AI.equipValue({ [slot]: c.card });
      if (!best || value > best.value) best = { action: c, value };
    }
    return best && best.action;
  };

  AI.overflowShieldAction = function (pub, my, mind, raw) {
    if (my.characterId !== 'march7' || my.shieldUsedTurn >= 2 ||
        my.handCount <= G.handLimit(my) || !my.handCount || isProtected(my)) return null;
    const cost = AI.discardOrder(pub, my, mind, my.hand)[0];
    let best = null;
    for (const c of raw || []) {
      if (c.kind !== 'shield') continue;
      const t = pub.players.find(p => p.id === c.targetId);
      if (!t || !t.alive || isProtected(t) || (t.shield || 0) >= 2) continue;
      if (t.id !== my.id) {
        const rel = AI.relation(pub, my, mind, t);
        if (my.identity === 'traitor' || rel.ally < 0.2 || rel.ally <= rel.enemy) continue;
      }
      const value = (t.id === my.id ? 3 : 0) + (t.hp <= 2 ? 1.5 : 0) +
        (t.isNavigator ? 1 : 0) - (t.shield || 0) * 0.4;
      if (!best || value > best.value) best = { action: Object.assign({}, c, { costId: cost.uid, forcedOverflow: true }), value };
    }
    return best && best.action;
  };

  AI.finishingAttack = function (pub, my, mind, c) {
    if (!c || !['anda', 'himeko', 'chainsaw'].includes(c.kind)) return false;
    const target = pub.players.find(p => p.id === c.targetId);
    if (!target || !target.alive || target.hp !== 1 || isProtected(target)) return false;
    const rel = AI.relation(pub, my, mind, target);
    const confirmed = target.isNavigator || (rel.belief && rel.belief.role !== 'unknown' && rel.belief.confidence >= 0.65);
    if (!confirmed || !AI.canHostileTarget(rel) || AI.trustedAlly(pub, my, mind, target)) return false;
    const card = c.kind === 'anda' ? c.card : { element: '物理' };
    const damage = AI.attackDamage(pub, my, target, card, !!c.useSnack);
    const weapon = my.equipment && my.equipment.weapon;
    const ignores = weapon && weapon.name === '击云';
    return damage > 0 && damage >= target.hp + (ignores ? 0 : (target.shield || 0));
  };

  AI.weaponBeforeAttack = function (pub, my, mind, attack, raw) {
    if (!attack || attack.kind !== 'anda' || my.equipment.weapon) return null;
    let best = null;
    for (const c of raw || []) {
      if (c.kind !== 'equip' || C.getSlot(c.card) !== 'weapon') continue;
      const score = AI.scoreCandidate(pub, my, mind, c);
      if (!isFinite(score) || score <= 0.005) continue;
      // 不为武器准备消耗造成即刻致命的场地超点。
      if (pub.fieldEffect && pub.fieldEffect.id === 2 &&
          (my.interpretation || 0) + rankValue(c.card.rank) > 42 && my.hp <= 1 && !(my.shield || 0)) continue;
      if (!best || score > best.score) best = { action: c, score };
    }
    return best;
  };

  AI.chooseAction = function (pub, my, mind, rand) {
    const raw = AI.generateCandidates(pub, my, mind);
    const scored = [];
    const random = typeof rand === 'function' ? rand : (() => 0.5);
    for (const c of raw) {
      const s = AI.scoreCandidate(pub, my, mind, c);
      if (!isFinite(s) || s <= 0.005) continue;
      scored.push({ action: c, score: s + (random() - 0.5) * 0.02 });
    }
    scored.sort((a, b) => b.score - a.score);
    const urgent = scored.find(x =>
      (x.action.kind === 'dotRemove' && (my.dots || 0) >= my.hp + (my.shield || 0)) ||
      (x.action.kind === 'heal' && my.hp <= 2));
    const mustEquip = AI.mustEquipAction(pub, my, mind, raw);
    const mustShield = AI.overflowShieldAction(pub, my, mind, raw);
    const finisher = scored.find(x => AI.finishingAttack(pub, my, mind, x.action));
    let pick = urgent;
    if (!pick && mustEquip) pick = { action: mustEquip, score: AI.scoreCandidate(pub, my, mind, mustEquip), reason: 'empty-equipment' };
    if (!pick && finisher) pick = finisher;
    if (!pick && mustShield) pick = { action: mustShield, score: AI.scoreCandidate(pub, my, mind, mustShield), reason: 'overflow-shield' };
    if (!pick && my.hp <= 1) pick = scored.find(x =>
      (x.action.kind === 'shield' && x.action.targetId === my.id) || AI.isGainCandidate(x.action));
    if (!pick) pick = scored[0];
    if (!pick && my.handCount > G.handLimit(my)) {
      // 将本来要弃掉的轻微正向换装兑现；等价/降级的硬禁用仍不放行。
      const overEquip = raw.filter(c => c.kind === 'equip').map(c =>
        ({ action: c, score: AI.scoreCandidate(pub, my, mind, c) })).filter(x => x.score > -0.3);
      overEquip.sort((a, b) => b.score - a.score);
      pick = overEquip[0];
    }
    if (!pick) return { action: null, candidates: [], scored: [] };
    if (!urgent && !mustEquip && !mustShield && !finisher && my.hp > 1 &&
        scored[1] && scored[0].score - scored[1].score < 0.35 && random() < 0.06) pick = scored[1];
    const weaponFirst = AI.weaponBeforeAttack(pub, my, mind, pick.action, raw);
    if (weaponFirst) pick = weaponFirst;
    if (pick.action.kind === 'skillPoint' && mind) {
      mind.skillPointTurn = my.turnSerial;
      mind.skillPointTotal = (mind.skillPointTotal || 0) + 1;
    }
    if (mind && ['anda', 'himeko', 'chainsaw'].includes(pick.action.kind)) mind.probeTurn = my.turnSerial;
    return { action: pick.action, score: pick.score, candidates: scored.slice(0, 8), scored };
  };

  AI.applyAction = function (state, player, action) {
    if (!action || !player || !player.alive || state.over) return false;
    if (state.phase !== 'play') return false;
    const card = action.cardId ? player.hand.find(c => c.uid === action.cardId) : null;
    const target = action.targetId ? G.getPlayer(state, action.targetId) : null;
    if (action.cardId && !card) return false;
    if (action.targetId && (!target || !target.alive)) return false;
    try {
      if (action.kind === 'heal') {
        return !!G.playCard(state, player, card, {});
      }
      if (action.kind === 'equip') {
        return !!G.playCard(state, player, card, {});
      }
      if (action.kind === 'shield') {
        if (action.costId && !player.hand.some(c => c.uid === action.costId)) return false;
        const mind = state.aiMinds && state.aiMinds[player.id];
        if (action.costId && mind) mind.shieldCost = { uid: action.costId, turnSerial: player.turnSerial };
        try { return !!G.playShield(state, player, target); }
        finally { if (mind) delete mind.shieldCost; }
      }
      if (action.kind === 'anda') {
        if (!G.canPlayAnDa(state, player, card)) return false;
        if (!G.validAnDaTargets(state, player, card).some(t => t.id === target.id)) return false;
        if (action.useSnack) {
          const snack = player.hand.find(c => c.uid === action.snackId);
          if (!snack || player.snackUsed) return false;
          if (!G.playCard(state, player, snack, {})) return false;
        }
        return !!G.playCard(state, player, card, { target });
      }
      if (action.kind === 'himeko') {
        return !!G.playHimekoSkill(state, player, target);
      }
      if (action.kind === 'chainsaw') {
        return !!G.playChainsawAnDa(state, player, target);
      }
      if (action.kind === 'trick') {
        const opts = { target };
        if (action.forcedId) opts.forced = G.getPlayer(state, action.forcedId);
        if (action.victimId) opts.victim = G.getPlayer(state, action.victimId);
        return !!G.playCard(state, player, card, opts);
      }
      if (action.kind === 'skillPoint') {
        return !!(SR.events && SR.events.useSkillPoint && SR.events.useSkillPoint(state, player));
      }
    } catch (err) {
      // 公示暂停/真人响应是控制器的回滚重放请求，不是非法动作。
      if (err && err.code === 'HUMAN_CHOICE') throw err;
      AI.recordRejected(state, player, action, err);
      return false;
    }
    return false;
  };

  AI.recordRejected = function (state, player, action, err) {
    if (!state.aiRejected) state.aiRejected = [];
    state.aiRejected.push({
      round: state.round,
      playerId: player && player.id,
      action: action && action.label,
      error: err ? String(err && err.message || err) : 'invalid'
    });
    if (state.aiRejected.length > 500) state.aiRejected.splice(0, state.aiRejected.length - 500);
  };

  AI.logDecision = function (state, player, result) {
    if (!state.aiLog) state.aiLog = [];
    const entry = {
      round: state.round,
      phase: state.phase,
      playerId: player.id,
      playerName: player.name,
      identity: player.identity,
      chosen: result.action ? result.action.label : '结束出牌',
      score: result.score == null ? null : Number(result.score.toFixed(3)),
      candidates: (result.candidates || []).map(x => ({
        label: x.action.label,
        score: Number(x.score.toFixed(3))
      }))
    };
    state.aiLog.push(entry);
    if (state.aiLog.length > 12000) state.aiLog.splice(0, state.aiLog.length - 12000);
    if (state.options && state.options.debugAI) console.log('[AI]', JSON.stringify(entry));
  };

  AI.playPhase = function (state, player) {
    if (!player || !player.alive || state.over) return;
    AI.ensure(state);
    let guard = 0;
    while (player.alive && !state.over && guard++ < 24) {
      const ctx = AI.context(state, player);
      const result = AI.chooseAction(ctx.pub, ctx.my, ctx.mind, state.rng || (() => 0.5));
      if (!result || !result.action) break;
      AI.logDecision(state, player, result);
      const ok = AI.applyAction(state, player, result.action);
      if (!ok) {
        AI.recordRejected(state, player, result.action, null);
        break;
      }
      if (state.over || !player.alive) break;
    }
  };

  // ----- 响应与被动选择：全部通过 public + my 决策 -----
  AI.chooseDodge = function (state, target, source, card) {
    const ctx = AI.context(state, target);
    return AI.decideDodge(ctx.pub, ctx.my, ctx.mind, source ? source.id : null, card, state.rng || (() => 0.5));
  };

  AI.decideDodge = function (pub, my, mind, sourceId, card, rand) {
    const source = sourceId ? (pub.players || []).find(p => p.id === sourceId) : null;
    if (!source) return true;
    const rel = AI.relation(pub, my, mind, source);
    if (card && card.name === '再见安打' && my.hp <= 1) return true;
    if (my.hp <= 2) return true;
    if (my.handCount <= 2) return true;
    if (my.identity === 'navigator') return true;
    if (rel.enemy > 0.5) return true;
    // 满血、手牌不紧且来源身份不明时，可以省闪；已知敌方则仍然闪。
    if (my.hp >= my.maxHp && my.handCount >= 3 && rel.enemy <= 0) return false;
    return true;
  };

  AI.chooseHuangZi = function (state, target) {
    // 无牌成本的判定，正常使用。
    return true;
  };

  AI.chooseResponseCard = function (state, player, name, options) {
    const ctx = AI.context(state, player);
    return AI.decideResponseCard(ctx.pub, ctx.my, ctx.mind, name, options);
  };

  AI.decideResponseCard = function (pub, my, mind, name) {
    // 能出就出；安打/闪身步都是避免伤害的关键响应。
    return true;
  };

  AI.chooseCard = function (state, player, cards, purpose) {
    if (!cards || !cards.length) return null;
    if (purpose === 'loot') {
      return cards.slice().sort((a, b) => AI.cardValue(b, player) - AI.cardValue(a, player))[0];
    }
    const planned = state.aiMinds && state.aiMinds[player.id] && state.aiMinds[player.id].shieldCost;
    if (purpose === 'shield' && planned && planned.turnSerial === player.turnSerial) {
      const card = cards.find(c => c.uid === planned.uid);
      if (card) return card;
    }
    // 成本/弃牌按保留价值升序；保留加成必须增加价值，不能反向优先弃掉。
    const ctx = AI.context(state, player);
    return AI.discardOrder(ctx.pub, ctx.my, ctx.mind, cards)[0];
  };

  AI.chooseCards = function (state, player, cards, count, purpose) {
    if (!cards || !cards.length) return [];
    const sorted = cards.slice().sort((a, b) => AI.cardValue(b, player) - AI.cardValue(a, player));
    return sorted.slice(0, Math.max(0, count || 0));
  };

  AI.chooseOneCard = function (state, player, cards, purpose) {
    if (!cards || !cards.length) return null;
    return cards.slice().sort((a, b) => AI.cardValue(b, player) - AI.cardValue(a, player))[0];
  };

  AI.chooseDiscardCards = function (state, player, cards, count) {
    if (!cards || !cards.length) return [];
    const ctx = AI.context(state, player);
    const sorted = AI.discardOrder(ctx.pub, ctx.my, ctx.mind, cards);
    return sorted.slice(0, Math.max(0, count || 0));
  };

  AI.chooseStealCard = function (state, player, target) {
    const ctx = AI.context(state, player);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return null;
    let best = null;
    let bestVal = -1;
    for (const slot of ['weapon', 'armor', 'vehicle']) {
      const eq = pubTarget.equipment && pubTarget.equipment[slot];
      if (!eq) continue;
      const v = AI.equipValue({ [slot]: eq }) + (slot === 'armor' ? 0.35 : 0);
      if (v > bestVal) { bestVal = v; best = { zone: 'equipment', slot }; }
    }
    if (pubTarget.handCount > 0) {
      const handVal = 0.9 + (pubTarget.handCount >= 3 ? 0.2 : 0);
      if (handVal > bestVal) best = { zone: 'hand' };
    }
    return best;
  };

  AI.chooseGugu = function (state, target, source) {
    const ctx = AI.context(state, target);
    // 目标决定弃 1 张还是让来源摸 1 张；手牌多时弃牌，手牌少时让来源摸。
    return ctx.my.handCount >= 3 ? 'discard' : 'draw';
  };

  AI.chooseIdenExtra = function (state, player, target) {
    const ctx = AI.context(state, player);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return false;
    if (pubTarget.hp <= 1) return true;
    return AI.dodgeChance(ctx.pub, ctx.my, ctx.mind, pubTarget) < 0.28;
  };

  AI.chooseIdenCard = function (state, player) {
    return (player && player.hand ? player.hand.find(c => c.name === '再见安打') : null) || null;
  };

  AI.chooseQinChen = function (state, player, target) {
    const ctx = AI.context(state, player);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return false;
    if (pubTarget.hp <= 1 && ctx.my.handCount >= 2) return true;
    return pubTarget.hp <= 2 && ctx.my.handCount >= 3;
  };

  AI.chooseQinChenCards = function (state, player) {
    // 保持原有 AI 行为：弃置手牌中的前两张。
    return (player && player.hand ? player.hand : []).slice(0, 2);
  };

  AI.chooseHimekoCards = function (state, player) {
    // 保持原有 AI 行为：弃置手牌中的前两张。
    return (player && player.hand ? player.hand : []).slice(0, 2);
  };

  AI.chooseBootsInsert = function (state, holder, upcoming) {
    const ctx = AI.context(state, holder);
    const pubUp = (ctx.pub.players || []).find(p => p.id === upcoming.id);
    if (!pubUp || isProtected(pubUp)) return false;
    const v = AI.targetValue(ctx.pub, ctx.my, ctx.mind, pubUp);
    if (ctx.my.identity === 'traitor' && pubUp.isNavigator) return false;
    if (ctx.my.identity === 'rebel' && pubUp.isNavigator) return true;
    return v > 2.4;
  };

  AI.chooseBootsActNow = function (state, holder) {
    const ctx = AI.context(state, holder);
    // 有可用攻击目标或低血时直接行动；否则等待更合适的插入点。
    if (ctx.my.hp <= 2) return true;
    const targets = AI.validAttackTargets(ctx.pub, ctx.my);
    for (const t of targets) {
      if (AI.targetValue(ctx.pub, ctx.my, ctx.mind, t) > 1.2) return true;
    }
    return ctx.my.handCount <= 1;
  };

  AI.chooseMemoryPool = function (state, player) {
    const ctx = AI.context(state, player);
    return ctx.my.hp <= 1 || (ctx.my.hp <= 2 && ctx.my.handCount <= 1);
  };

  AI.chooseWeightlessTarget = function (state, player) {
    const ctx = AI.context(state, player);
    let best = null;
    let bestScore = -Infinity;
    for (const p of ctx.pub.players) {
      if (!p.alive || p.id === ctx.my.id || isProtected(p)) continue;
      const rel = AI.relation(ctx.pub, ctx.my, ctx.mind, p);
      // 只对明确偏敌方目标使用失重；模糊目标也谨慎跳过。
      if (rel.ally >= rel.enemy) continue;
      if (rel.enemy < 0.25 || rel.enemy - rel.ally < 0.15) continue;
      const dodge = AI.dodgeChance(ctx.pub, ctx.my, ctx.mind, p);
      const score = AI.targetValue(ctx.pub, ctx.my, ctx.mind, p) + dodge * 0.8;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ? G.getPlayer(state, best.id) : null;
  };

  AI.chooseGraceTarget = function (state, player) {
    const ctx = AI.context(state, player);
    const my = ctx.my;
    const pub = ctx.pub;
    const navigator = pub.players.find(p => p.isNavigator && p.alive && !isProtected(p));
    if (my.hp <= 1) return player;
    // 无名客星期日优先把摸牌给领航员，而不是被自身的 ally=100 抢走。
    if (my.identity === 'loyalist' && navigator) return G.getPlayer(state, navigator.id);
    // 领航员星期日在自身手牌/体力充足、且有无名客淘汰风险时，才让出摸牌。
    if (my.identity === 'navigator' && my.hp >= 3 && my.handCount >= 3) {
      let best = null;
      let bestScore = -Infinity;
      for (const p of pub.players) {
        if (!p.alive || p.id === my.id || p.isNavigator || isProtected(p)) continue;
        if (p.hp > 2) continue;
        const rel = AI.relation(pub, my, ctx.mind, p);
        if (rel.ally <= rel.enemy || rel.ally < 0.45) continue;
        const score = rel.ally * 1.2 - rel.enemy + (2 - p.hp) * 0.5;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) return G.getPlayer(state, best.id);
    }
    // 其他身份/没有明确危险友方时，主要给自己抽牌。
    return player;
  };

  AI.chooseHarmony = function (state, player) {
    const ctx = AI.context(state, player);
    if (ctx.my.handCount <= 2) return false;
    const targets = AI.validAttackTargets(ctx.pub, ctx.my);
    return targets.some(t => AI.targetValue(ctx.pub, ctx.my, ctx.mind, t) > 1.2);
  };

  AI.chooseRescue = function (state, rescuer, target, choices) {
    const ctx = AI.context(state, rescuer);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return null;
    const decision = AI.decideRescue(ctx.pub, ctx.my, ctx.mind, pubTarget, choices, state.rng || (() => 0.5));
    if (!decision) return null;
    const prefer = choices.filter(c => c.name === decision);
    return prefer[0] || choices[0];
  };

  AI.decideRescue = function (pub, my, mind, target, choices, rand) {
    if (!choices || !choices.length) return null;
    if (target.id === my.id) return '药王慈怀';
    const rel = AI.relation(pub, my, mind, target);
    // 玩家体验微调：友方 AI 对玩家的救援阈值降低 10%。
    const allyThreshold = target.isHuman ? 0.72 : 0.8;
    if (target.isNavigator) {
      if (my.identity === 'rebel' || my.identity === 'traitor') return null;
      return '药王慈怀';
    }
    if (my.identity === 'navigator') {
      // 只救判断较明确的友方；身份不明者不拿自己的保命牌去赌。
      if (rel.ally < allyThreshold) return null;
      if (my.hp <= 2 && my.handCount <= 2) return null;
      return '药王慈怀';
    }
    if (my.identity === 'loyalist') {
      if (rel.ally < allyThreshold) return null;
      return '药王慈怀';
    }
    if (my.identity === 'rebel') {
      return rel.ally >= allyThreshold ? '药王慈怀' : null;
    }
    if (my.identity === 'traitor') {
      // 内鬼要让除领航员外的人先死；救人会消耗自己，通常不救。
      return null;
    }
    return null;
  };

  AI.chooseMimicBlackHole = function (state, welt, target) {
    const ctx = AI.context(state, welt);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return false;
    if (pubTarget.id === ctx.my.id) return true;
    const rel = AI.relation(ctx.pub, ctx.my, ctx.mind, pubTarget);
    if (pubTarget.isNavigator) return ctx.my.identity === 'navigator' || ctx.my.identity === 'loyalist';
    // 明确敌人绝不救；身份模糊时要求友方信念明显高于敌方。
    if (rel.enemy >= rel.ally) return false;
    if (rel.ally < 0.45 || rel.ally - rel.enemy < 0.15) return false;
    return true;
  };

  AI.chooseRemembrance = function (state, target, card, source) {
    if (!target || !card || card.polarity !== '负面') return false;
    const ctx = AI.context(state, target);
    if (!ctx.my.handCount && !Object.values(ctx.my.equipment || {}).some(Boolean)) return false;
    if (ctx.my.hp <= 2) return true;
    if (ctx.my.handCount <= 1 && ctx.my.hp > 2) return false;
    return true;
  };

  AI.chooseLightShieldCards = function (state, target, cards) {
    return AI.chooseDiscardCards(state, target, cards, 2);
  };

  AI.chooseLightShield = function (state, target, amount) {
    const ctx = AI.context(state, target);
    const cards = (ctx.my.hand || []).length + Object.values(ctx.my.equipment || {}).filter(Boolean).length;
    if (cards < 2) return false;
    return ctx.my.hp <= amount || ctx.my.hp <= 2;
  };

  AI.chooseIXForTrick = function (state, player, card, target, excludeOwner) {
    const ctx = AI.context(state, player);
    const pubTarget = target ? (ctx.pub.players || []).find(p => p.id === target.id) : null;
    return AI.decideIXForTrick(ctx.pub, ctx.my, ctx.mind, card, pubTarget, excludeOwner);
  };

  AI.decideIXForTrick = function (pub, my, mind, card, target, excludeOwner) {
    if (!card || card.polarity !== '负面') return false;
    if (!target && !['寰宇蝗灾', '帝弓光矢'].includes(card.name)) {
      // 欢愉诡计的双目标未传入此接口；不能把闪身步当作防无来源伤害。
      return card.name === '欢愉诡计' && my.hp <= 2;
    }
    if (!target) {
      // 群体牌不命中使用者；不再因任意一点友方概率就全局取消。
      const hit = pub.players.filter(p => p.alive && p.id !== pub.currentId && !isProtected(p));
      let danger = 0;
      for (const p of hit) {
        const rel = p.id === my.id ? { ally: 5, enemy: 0 } : AI.relation(pub, my, mind, p);
        const miss = card.name === '寰宇蝗灾'
          ? (p.id === my.id ? ((my.hand || []).some(c => c.name === '再见安打') ? 0 : 1) : 1 - AI.anDaChance(pub, my, mind, p))
          : (p.id === my.id ? ((my.hand || []).some(c => c.name === '闪身步') ? 0 : 1) : 1 - AI.dodgeChance(pub, my, mind, p));
        const damage = 1 + (p.path === 'destruction' && p.destructionPenalty ? 1 : 0);
        const reduced = p.path === 'preservation' && !hasStatus(p, 'cannot_protect') ? 1 : 0;
        if (p.hp + (p.shield || 0) <= damage - reduced && miss > 0.4 &&
            (p.id === my.id || AI.trustedAlly(pub, my, mind, p))) return true;
        danger += miss * (Math.max(0, rel.ally) * 0.2 - Math.max(0, rel.enemy) * 0.55);
      }
      return danger >= 1.4;
    }
    const rel = target.id === my.id ? { ally: 5, enemy: 0 } : AI.relation(pub, my, mind, target);
    if (target.id !== my.id && !AI.trustedAlly(pub, my, mind, target) && rel.enemy >= rel.ally) return false;
    if (rel.enemy > 0 && rel.ally <= 0) return false;
    if (target.id === my.id) return my.hp <= 3 || card.name === '记忆冰封' || card.name === '终末裁决';
    return rel.ally > 0 && (my.hp <= 2 || target.hp <= 2 || card.name === '记忆冰封' || card.name === '终末裁决');
  };

  AI.chooseIXForJudgment = function (state, player, judgedPlayer, reason) {
    const ctx = AI.context(state, player);
    const pubJudged = (ctx.pub.players || []).find(p => p.id === judgedPlayer.id);
    if (!pubJudged) return false;
    if (reason === '反重力皮靴' || reason === '黄紫衬衫') return false;
    if (reason === '入梦池') return false;
    if (pubJudged.id === ctx.my.id) {
      return ctx.my.hp <= 2 || (reason === '终末裁决' && ctx.my.hp <= 3);
    }
    const rel = AI.relation(ctx.pub, ctx.my, ctx.mind, pubJudged);
    return rel.ally > 0 && (ctx.my.hp <= 2 || pubJudged.hp <= 2);
  };

  AI.chooseIXForIX = function (state, player, currentUser, currentLabel) {
    const ctx = AI.context(state, player);
    const pubUser = (ctx.pub.players || []).find(p => p.id === currentUser.id);
    if (!pubUser) return false;
    const rel = AI.relation(ctx.pub, ctx.my, ctx.mind, pubUser);
    // 只在高价值效果/自己低血时介入连锁；平时保留 IX 响应更稳。
    if (rel.enemy > 0.8 && (ctx.my.hp <= 2 || String(currentLabel || '').indexOf('终末裁决') >= 0)) {
      return (state.rng ? state.rng() : Math.random()) < 0.55;
    }
    return false;
  };

  AI.chooseIXForAha = function (state, player) {
    const ctx = AI.context(state, player);
    return ctx.my.hp <= 1;
  };

  AI.chooseIXForMoyin = function (state, player) {
    const ctx = AI.context(state, player);
    return ctx.my.hp <= 2;
  };

  AI.chooseIXForDot = function (state, player, source) {
    const ctx = AI.context(state, player);
    return ctx.my.hp <= 1 || (ctx.my.dots || 0) >= 2;
  };

  AI.chooseDecapTargets = function (state, player, targets) {
    if (!targets || !targets.length) return [];
    const ctx = AI.context(state, player);
    return targets
      .map(t => {
        const p = (ctx.pub.players || []).find(x => x.id === t.id);
        const hostile = p && !AI.trustedAlly(ctx.pub, ctx.my, ctx.mind, p) &&
          AI.canHostileTarget(AI.relation(ctx.pub, ctx.my, ctx.mind, p));
        return { t, s: hostile ? AI.targetValue(ctx.pub, ctx.my, ctx.mind, p) : -1 };
      })
      .filter(x => x.s > 0.5)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map(x => x.t);
  };

  // 兼容旧接口：外部若需要“根据公开状态估算身份”可直接调用。
  AI.estimate = function (state, observer, target) {
    const ctx = AI.context(state, observer);
    const pubTarget = (ctx.pub.players || []).find(p => p.id === target.id);
    if (!pubTarget) return { role: 'unknown', confidence: 0 };
    return AI.belief(ctx.pub, ctx.my, ctx.mind, pubTarget);
  };

  // 供测试/调试：运行一次公开隔离断言。
  AI.selfTest = function (state, viewer) {
    return AI.assertPublicIsolation(state, viewer);
  };

  /* ============================================================
   * 场地效果感知（新增）
   * 设计原则与主文件一致：只读 publicState.fieldEffect + 自己的 my 视图，
   * 不读取他人隐藏信息；场地效果只影响“权重”，不改变候选生成。
   * ============================================================ */

  const DAMAGE_KINDS = new Set(['anda', 'himeko', 'chainsaw']);

  function isDamageCandidate(c) {
    if (!c) return false;
    if (DAMAGE_KINDS.has(c.kind)) return true;
    if (c.kind !== 'trick' || !c.card) return false;
    return !['普通战利品', '精致战利品', '珍贵战利品', '华丽战利品', '贵重战利品',
      '纯美骑士客串', '同谐共鸣', '第IX机关', '入梦池'].includes(c.card.name);
  }

  // 场地效果 #2：黑塔女士举世无双——解读值管理
  AI.interpretationBonus = function (my, card) {
    if (!card) return 0;
    const add = rankValue(card.rank);
    const cur = my.interpretation || 0;
    const next = cur + add;
    if (next === 42) return 3.2;        // 回满 + 补到手牌上限，价值极高
    if (next > 42) return -2.6;         // 1 点无来源伤害并清空，必须避坑
    if (next >= 36) return 0.3;         // 接近 42，铺垫
    if (next >= 24) return 0.08;
    return 0;
  };

  AI.fieldBonus = function (pub, my, c) {
    const fe = pub.fieldEffect;
    if (!fe) return 0;
    let bonus = 0;

    // #1 阿哈真没面子：被动抽奖，无需决策（IX 已在 chooseIXForAha 处理）

    // #2 黑塔：解读值
    if (fe.id === 2 && c && c.card) {
      bonus += AI.interpretationBonus(my, c.card);
    }

    // #3 浪漫古士：追忆靠“主动出牌张数”推进，出一张就为全队积累
    if (fe.id === 3 && c && c.card) {
      bonus += 0.04;
    }

    // #4 魔术技巧：喊语音目前由 decideShout 处理，不在出牌评分内

    // #5 花姐：战技点赌博，保留原 scoreSkillPoint 的判断

    // #6 牢景：主动打出真实【再见安打】可检索一张安打（整轮至多 2 次）
    if (fe.id === 6 && c && c.kind === 'anda') {
      const used = my.divineGains || 0;
      if (used < 2) bonus += 0.35;
    }

    // #7 dot：自己身上有层数时，尽快结束行动前解掉；攻击可给对手叠 dot
    if (fe.id === 7) {
      const stacks = my.dots || 0;
      if (stacks > 0 && c && c.kind === 'heal') bonus += 0.4;
      if (stacks >= 2 && isDamageCandidate(c)) bonus += 0.15;
      if (isDamageCandidate(c)) bonus += 0.08;
    }

    // #8 魔芋爽（魔阴身）：造成伤害即回血，输出优先级上调；治疗优先级下调
    if (fe.id === 8) {
      if (isDamageCandidate(c)) bonus += 0.22;
      if (c && c.kind === 'heal') bonus -= 0.18;
    }

    // #9 爱上雷神：濒死会转为逐火而不是直接淘汰，残血时更敢换血
    if (fe.id === 9 && my.hp <= 1 && isDamageCandidate(c)) {
      bonus += 0.18;
    }

    return bonus;
  };

  // 把场地加成挂到评分上（保持原函数不变，便于回滚）
  const __scoreCandidate = AI.scoreCandidate;
  AI.scoreCandidate = function (pub, my, mind, c) {
    const base = __scoreCandidate(pub, my, mind, c);
    return base + AI.fieldBonus(pub, my, c);
  };

  // 场地效果 #4：玩家聊天语音、AI 自动喊话与奖励流程均已接入。
  // ===== 特殊效果补充包装：不改变既有函数体，只叠加评分/选择 =====
  AI.scoreDotRemove = function (pub, my, card) {
    const dots = my.dots || 0;
    if (!dots) return -100;
    const lethal = dots >= my.hp && !(my.shield || 0);
    let score = lethal ? 8 : (my.hp <= 2 ? 3.2 : 0.5);
    score += Math.min(2, dots) * 0.45;
    score -= AI.cardValue(card, my) * 0.25;
    return score;
  };

  AI.actionRankSum = function (my, c) {
    if (!c || !c.card) return 0;
    if (c.kind === 'himeko' || c.kind === 'chainsaw') {
      const ranks = (my.hand || []).map(x => rankValue(x.rank)).sort((a, b) => a - b);
      return (ranks[0] || 0) + (ranks[1] || 0);
    }
    return rankValue(c.card.rank);
  };

  AI.lootValue = function (card, my) {
    if (!card) return 0;
    const hpLow = my && my.hp <= 2;
    const slot = card.type === 'equip' ? C.getSlot(card) : null;
    if (hpLow) {
      if (card.name === '药王慈怀') return my.hp <= 1 ? 9 : 7;
      if (card.name === '闪身步') return 6.5;
      if (card.name === '第IX机关') return 5.5;
      if (slot === 'armor' && !(my.equipment && my.equipment.armor)) return 6;
    }
    if (slot === 'weapon') return 5 + C.getWeaponRange(card) * 0.4;
    if (slot === 'armor') return hpLow ? 5.5 : 4.2;
    if (slot === 'vehicle') return 3.2;
    if (card.type === 'trick') return 2.4 + (card.subtype === '延时' ? 0.4 : 0);
    if (card.name === '闪身步' || card.name === '药王慈怀') return 2.8;
    if (card.name === '第IX机关') return 3.0;
    return 1.5;
  };

  const baseGenerateCandidates2 = AI.generateCandidates;
  AI.generateCandidates = function (pub, my, mind) {
    const out = baseGenerateCandidates2(pub, my, mind);
    if ((my.dots || 0) > 0) {
      for (const c of (my.hand || []).filter(x => x.name === '药王慈怀' || x.name === '奇巧零食')) {
        out.push({ kind: 'dotRemove', label: '解除dot→' + c.name, cardId: c.uid, card: c });
      }
    }
    return out;
  };

  const baseScoreCandidate2 = AI.scoreCandidate;
  AI.scoreCandidate = function (pub, my, mind, c) {
    if (c.kind === 'dotRemove') return AI.scoreDotRemove(pub, my, c.card);
    let score = baseScoreCandidate2(pub, my, mind, c);
    if (!isFinite(score)) return score;
    const ev = pub.fieldEffect && pub.fieldEffect.id;
    const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
    const damageAction = c.kind === 'anda' || c.kind === 'himeko' || c.kind === 'chainsaw' ||
      (c.kind === 'trick' && c.card && !['普通战利品', '精致战利品', '珍贵战利品', '华丽战利品', '贵重战利品', '纯美骑士客串', '同谐共鸣'].includes(c.card.name));
    const realAnDa = c.kind === 'anda' && c.card && c.card.name === '再见安打';

    if (ev === 2 && c.card) {
      const points = AI.actionRankSum(my, c);
      const after = (my.interpretation || 0) + points;
      if (after === 42) score += 1.8;       // 已在 fieldBonus 给过基础值，这里补足
      else if (after > 42) score -= 2.0;
    }
    if (ev === 3) {
      const rem = pub.reminiscence == null ? 0 : pub.reminiscence;
      const cave = pub.cave == null ? 0 : pub.cave;
      const used = c.kind === 'himeko' || c.kind === 'chainsaw' ? 2 : (c.card ? 1 : 0);
      if (!pub.reminiscence24Used && rem < 24 && rem + used >= 24 && my.hp >= 2) score += 0.45;
      else if (pub.reminiscence24Used && rem + used >= 12 && my.hp >= 2) score += 0.2;
      if (cave >= 12 && my.hp <= 2) score -= 0.9;
      else if (cave >= 10 && damageAction) score -= 0.2;
    }
    if (ev === 6) {
      if (c.kind === 'trick' && c.card && c.card.polarity === '负面') score = -100;
      else if (realAnDa && (my.divineGains || 0) < 2) score += 0.45;
    }
    if (ev === 7) {
      if (realAnDa && (my.statuses || []).some(x => x.id === 'dot_girl') && target) score += 0.35;
      if ((my.dots || 0) >= 2 && c.kind === 'dotRemove') score += 0.8;
    }
    if (ev === 8 && (my.statuses || []).some(x => x.id === 'moyin')) {
      if (damageAction) score += my.hp <= 2 ? 0.55 : 0.25;
      if (my.hp <= 1 && !damageAction) score -= 0.2;
    }
    if (ev === 9 && target && (target.statuses || []).some(x => x.id === 'zhuhuo')) score = -100;
    if (c.kind === 'anda' && target) {
      const armor = target.equipment && target.equipment.armor && target.equipment.armor.name;
      if (armor === '光能盾牌' && (target.handCount || 0) <= 1) score += 0.5;
      if (armor === '绝对热量' && c.useSnack) score -= 0.55;
    }
    return score;
  };

  const baseApplyAction2 = AI.applyAction;
  AI.applyAction = function (state, player, action) {
    if (action && action.kind === 'dotRemove') {
      const card = player.hand.find(c => c.uid === action.cardId);
      if (!card || !(player.dots > 0)) return false;
      return !!G.playCard(state, player, card, { removeDot: true });
    }
    return baseApplyAction2(state, player, action);
  };

  const baseChooseCards2 = AI.chooseCards;
  AI.chooseCards = function (state, player, cards, count, purpose) {
    if (purpose === 'loot' && cards && cards.length) {
      const my = AI.privateView(state, player);
      return cards.slice().sort((a, b) => AI.lootValue(b, my) - AI.lootValue(a, my))
        .slice(0, Math.max(0, count || 0));
    }
    return baseChooseCards2(state, player, cards, count, purpose);
  };

  const baseChooseOneCard2 = AI.chooseOneCard;
  AI.chooseOneCard = function (state, player, cards, purpose) {
    if (purpose === '纯美' && cards && cards.length) {
      const my = AI.privateView(state, player);
      return cards.slice().sort((a, b) => AI.lootValue(b, my) - AI.lootValue(a, my))[0];
    }
    return baseChooseOneCard2(state, player, cards, purpose);
  };

  const baseChooseMemoryPool2 = AI.chooseMemoryPool;
  AI.chooseMemoryPool = function (state, player) {
    const ctx = AI.context(state, player);
    const last = player.flags && player.flags.aiMemoryPoolTurn;
    // 避免低血 AI 连续用入梦池跳过行动：刚用过时只保留 1 点体力的求生例外。
    if (last != null && player.turnSerial - last <= 1 && ctx.my.hp > 1) return false;
    let use = false;
    // 主动跳过行动会结束出牌阶段，随后可能被迫弃掉有用的手牌；
    // 只有在不会造成明显手牌损失，或 1 点体力求生时才使用入梦池。
    const pool = ctx.my.hand.find(c => c.name === '入梦池');
    const hand = ctx.my.hand.filter(c => !pool || c.uid !== pool.uid);
    const discardCost = AI.handDiscardCost(Object.assign({}, ctx.my, { hand, handCount: hand.length }), 0, ctx.pub, ctx.mind);
    // 2 血仍有能兑现的进攻/装备/护盾时，优先正常行动；1 血保留求生例外。
    const raw = AI.generateCandidates(ctx.pub, ctx.my, ctx.mind);
    if (ctx.my.hp <= 1 && raw.some(c => c.kind === 'heal' || c.kind === 'dotRemove')) return false;
    if (ctx.my.hp > 1 && (AI.mustEquipAction(ctx.pub, ctx.my, ctx.mind, raw) ||
        AI.overflowShieldAction(ctx.pub, ctx.my, ctx.mind, raw) ||
        raw.some(c => c.kind !== 'skillPoint' && AI.scoreCandidate(ctx.pub, ctx.my, ctx.mind, c) > 0.005))) return false;
    if (ctx.my.identity !== 'loyalist' && ctx.my.hp <= 2) {
      use = ctx.my.hp <= 1 || discardCost <= 1.2;
    } else if (ctx.my.hp > 2 && ctx.my.handCount > 0) use = false;
    else use = !!baseChooseMemoryPool2(state, player);
    if (use && player.flags) player.flags.aiMemoryPoolTurn = player.turnSerial;
    return use;
  };

  AI.chooseIXForAha = function (state, player) {
    const ctx = AI.context(state, player);
    if (ctx.my.hp <= 1) return true;
    return (ctx.my.damageTakenRound || 0) >= 2;
  };

  const baseScoreSkillPoint2 = AI.scoreSkillPoint;
  AI.scoreSkillPoint = function (pub, my, mind) {
    if (my.hp <= 1 && my.skillPoints > 0) {
      // 1血无直接急救时允许用多余牌赌一张解牌；不押上唯一闪/治疗。
      // 失败由引擎随机弃牌，不能以“有一张多余牌”假定它必被弃。
      const safeHand = my.handCount > 0
        ? (my.hand || []).every(c => AI.cardValue(c, my) < 1.8)
        : !Object.values(my.equipment || {}).some(Boolean);
      if (!safeHand || (mind && mind.skillPointTurn === my.turnSerial)) return -100;
      return 1.1;
    }
    let score = baseScoreSkillPoint2(pub, my, mind);
    if (pub.fieldEffect && pub.fieldEffect.id === 5) {
      if (my.handCount < 4 || my.hp < 3) return -100;
      const low = (my.hand || []).filter(c =>
        !['闪身步', '药王慈怀', '第IX机关', '再见安打'].includes(c.name)).length;
      if (low < 2) return -100;
      score += 0.12;
    }
    return score;
  };

  const baseDecideIXForTrick2 = AI.decideIXForTrick;
  AI.decideIXForTrick = function (pub, my, mind, card, target, excludeOwner) {
    if (!card || card.polarity !== '负面') return false;
    const high = ['记忆冰封', '终末裁决', '寰宇蝗灾', '帝弓光矢', '命途对撞', '欢愉诡计'].includes(card.name);
    if (!high && target && target.id !== my.id && (target.hp || 0) > 2) return false;
    return baseDecideIXForTrick2(pub, my, mind, card, target, excludeOwner);
  };

  // 修正/补足另一个包装层里未接上引擎字段的场地效果。
  const baseFieldBonus2 = AI.fieldBonus;
  AI.fieldBonus = function (pub, my, c) {
    let b = baseFieldBonus2(pub, my, c);
    const fe = pub.fieldEffect;
    if (!fe) return b;
    if (fe.id === 3 && c && c.card) {
      const rem = pub.reminiscence == null ? 0 : pub.reminiscence;
      if (!pub.reminiscence24Used && rem < 24 && rem + 1 >= 24) b += 0.2;
    }
    if (fe.id === 7 && c && c.kind === 'dotRemove') b += 0.5;
    if (fe.id === 8 && c && c.card && c.card.name === '再见安打' && my.hp <= 2) b += 0.25;
    // 永劫轮回下，自己 1 血时保命优先，抵消包装层原先的攻击加成。
    if (fe.id === 9 && my.hp <= 1 && c && isDamageCandidate(c)) b -= 0.18;
    return b;
  };


  // 残局保留解牌：终末裁决/记忆冰封不要被轻易弃掉。
  const baseCardValue2 = AI.cardValue;
  AI.cardValue = function (card, my) {
    let v = baseCardValue2(card, my);
    if (card && card.name === '终末裁决') v = Math.max(v, 3.2);
    if (card && card.name === '记忆冰封') v = Math.max(v, 2.4);
    if (card && card.name === '第IX机关') v = Math.max(v, 3.0);
    return v;
  };

  // 收束机制：只提高直接进攻动作的评分，不改变引擎合法性。
  // 触发与倍率由 rules.js 的 G.refreshAggression 计算，AI 只读取公开字段。
  AI.aggressionMultiplier = function (pub) {
    const m = Number(pub && pub.aggressionMultiplier);
    if (!isFinite(m)) return 1;
    return Math.max(1, Math.min(2, m));
  };

  AI.isAggressiveCandidate = function (c) {
    if (!c) return false;
    if (c.kind === 'anda' || c.kind === 'himeko' || c.kind === 'chainsaw') return true;
    if (c.kind !== 'trick' || !c.card) return false;
    return ['寰宇蝗灾', '帝弓光矢', '命途对撞', '欢愉诡计', '终末裁决'].includes(c.card.name);
  };

  AI.isGainCandidate = function (c) {
    if (!c) return false;
    if (c.kind === 'equip') return true;
    if (c.kind !== 'trick' || !c.card) return false;
    return ['普通战利品', '精致战利品', '珍贵战利品', '华丽战利品', '贵重战利品',
      '纯美骑士客串'].includes(c.card.name);
  };

  AI.paceMultipliers = function (pub) {
    const num = (v, fallback) => isFinite(Number(v)) ? Number(v) : fallback;
    return {
      damage: Math.max(1, Math.min(1.3, num(pub && pub.damageMultiplier, 1))),
      gain: Math.max(0.8, Math.min(1, num(pub && pub.gainMultiplier, 1))),
      defense: Math.max(0.75, Math.min(1, num(pub && pub.defenseMultiplier, 1)))
    };
  };

  // 银河球棒连击计划：进攻型角色在手里有球棒、且有战技点/战利品等抽牌途径时，
  // 暂时不急着交出安打，先抽牌并装备球棒，凑到足够安打后连续打出。
  AI.comboPlan = function (pub, my, mind) {
    const hand = (my && my.hand) || [];
    const batEquipped = !!(my && my.equipment && my.equipment.weapon &&
      my.equipment.weapon.name === '银河球棒');
    const batInHand = !batEquipped && hand.some(c => c.name === '银河球棒');
    const attackCount = hand.filter(c => c.name === '再见安打').length;
    const drawRoutes = (my && my.skillPoints > 0) ||
      hand.some(c => ['普通战利品', '精致战利品', '珍贵战利品', '华丽战利品', '贵重战利品',
        '纯美骑士客串'].includes(c.name));
    const aggressive = my && (my.identity === 'rebel' || my.identity === 'traitor' ||
      AI.aggressionMultiplier(pub) > 1);
    const active = !!(aggressive && (batInHand || batEquipped) && drawRoutes &&
      my.hp >= 2 && attackCount < 3);
    return {
      active,
      hold: active && attackCount < 3,
      attackCount,
      batInHand,
      batEquipped,
      drawRoutes,
      equipWanted: !!(aggressive && batInHand && (attackCount >= 2 || active))
    };
  };

  const baseScoreCandidateAggr = AI.scoreCandidate;
  AI.scoreCandidate = function (pub, my, mind, c) {
    const base = baseScoreCandidateAggr(pub, my, mind, c);
    if (!isFinite(base) || base <= -50) return base;
    const aggr = AI.aggressionMultiplier(pub);
    const pace = AI.paceMultipliers(pub);
    const plan = AI.comboPlan(pub, my, mind);
    let adjusted = base;
    if (plan.active) {
      if (c.kind === 'skillPoint' && my.skillPoints > 0) adjusted = Math.max(adjusted, 1.15);
      if (AI.isGainCandidate(c) && my.handCount <= 4) adjusted = Math.max(adjusted, 1.15);
      if (c.kind === 'anda' && plan.hold) {
        const target = c.targetId ? (pub.players || []).find(p => p.id === c.targetId) : null;
        if (!target || target.hp > 1) adjusted *= 0.15;
      }
    }
    if (plan.equipWanted && c.kind === 'equip' && c.card && c.card.name === '银河球棒') {
      adjusted = Math.max(adjusted, 2.5);
    }
    // 连击准备期不要把两张手牌交给姬子/电锯，优先保留安打和球棒。
    if (plan.active && (c.kind === 'himeko' || c.kind === 'chainsaw') && my.handCount <= 4) {
      adjusted *= 0.25;
    }
    if (AI.isAggressiveCandidate(c)) return adjusted * aggr * pace.damage;
    if (c.kind === 'heal' || c.kind === 'shield') {
      return adjusted * pace.defense / aggr;
    }
    if (AI.isGainCandidate(c)) return adjusted * pace.gain;
    return adjusted;
  };

  // 行动积极性与弃牌机会成本统一叠加在最终评分上，硬禁用永远不加分。
  const baseScoreWithWaste = AI.scoreCandidate;
  AI.scoreCandidate = function (pub, my, mind, c) {
    let score = baseScoreWithWaste(pub, my, mind, c);
    if (!isFinite(score) || score <= -50) return score;
    if (c.kind === 'equip') {
      const slot = C.getSlot(c.card);
      const cur = my.equipment && my.equipment[slot];
      if (cur) {
        if (cur.name === c.card.name) return -100;
        // 普通换装须提升效果；解读42/低血卸绝对热量是一次性收益例外。
        const exact42 = pub.fieldEffect && pub.fieldEffect.id === 2 &&
          (my.interpretation || 0) + rankValue(c.card.rank) === 42;
        const armorHeal = slot === 'armor' && cur.name === '绝对热量' && my.hp < my.maxHp;
        if (armorHeal) score += my.hp <= 2 ? 1.4 : 0.55;
        if (!exact42 && !armorHeal) {
          if (slot === 'armor' && AI.equipValue({ armor: c.card }) <= AI.equipValue({ armor: cur }) + 0.05) return -100;
          if (slot === 'vehicle') {
            const changed = Object.assign({}, my, { equipment: Object.assign({}, my.equipment, { vehicle: c.card }) });
            const unlock = AI.canUseAnDa(my) && (my.hand || []).some(x => x.name === '再见安打') &&
              pub.players.some(t => t.alive && t.id !== my.id && AI.canHostileTarget(AI.relation(pub, my, mind, t)) &&
                distanceOf(pub, my.id, t.id) > my.attackRange &&
                distanceOf(Object.assign({}, pub, { players: pub.players.map(p => p.id === my.id ? changed : p) }), my.id, t.id) <= my.attackRange);
            if (!unlock) return -100;
            score += 0.9;
          }
          if (slot === 'weapon' && C.getWeaponRange(c.card) <= C.getWeaponRange(cur) &&
              AI.weaponEffectValue(c.card) <= AI.weaponEffectValue(cur) + 0.05) return -100;
        }
      } else score += slot === 'armor' ? 1 : (slot === 'vehicle' ? 0.8 : 0.65);
    }
    if (['anda', 'himeko', 'chainsaw'].includes(c.kind)) {
      const target = (pub.players || []).find(p => p.id === c.targetId);
      if (!target || AI.trustedAlly(pub, my, mind, target)) return -100;
      const rel = AI.relation(pub, my, mind, target);
      if (AI.canHostileTarget(rel)) score += 0.25 + Math.min(0.5, Math.max(0, rel.enemy - rel.ally) * 0.15);
      if (AI.canProbeTarget(pub, my, mind, target) && (!mind || mind.probeTurn !== my.turnSerial)) score += 0.55;
    }
    const early = pub.round <= 2;
    if (c.kind === 'trick' && c.card &&
        ['寰宇蝗灾', '帝弓光矢', '同谐共鸣', '纯美骑士客串'].includes(c.card.name)) {
      score += early ? 3.2 : 1.6;
    }
    if (my.hp <= 1) {
      if (c.kind === 'heal' || c.kind === 'dotRemove') score += 4;
      if (c.kind === 'shield' && c.targetId === my.id) score += 3.5;
      if (AI.isGainCandidate(c)) score += 2.8;
      if (['anda', 'himeko', 'chainsaw'].includes(c.kind)) {
        const t = pub.players.find(p => p.id === c.targetId);
        const damage = c.kind === 'anda' ? AI.attackDamage(pub, my, t, c.card, c.useSnack) : 1;
        const ignoresShield = my.equipment.weapon && my.equipment.weapon.name === '击云';
        const kill = t && damage >= t.hp + (ignoresShield ? 0 : (t.shield || 0));
        const reflect = t && t.equipment.armor && t.equipment.armor.name === '以牙还牙甲' && !t.armorUsedTurn && !ignoresShield;
        if (kill && !reflect) score += 3;
      }
    }
    const saving = AI.discardSaving(pub, my, mind, c);
    if (saving > 0) score += Math.min(1.8, saving * 0.55);
    return score;
  };

  // 玩家只保留援助侧的轻微体验修正；攻击/负面效果与对 AI 使用同等评分。
  const baseScoreWithHumanBias = AI.scoreCandidate;
  AI.scoreCandidate = function (pub, my, mind, c) {
    let score = baseScoreWithHumanBias(pub, my, mind, c);
    if (!isFinite(score) || !pub || !pub.humanId || my.isHuman) return score;
    if (c.targetId !== pub.humanId) return score;
    const helpful = c.kind === 'shield' ||
      (c.kind === 'trick' && c.card && c.card.polarity === '正面');
    if (helpful) score *= 1.1;
    return score;
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
