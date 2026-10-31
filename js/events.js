/* 星穹铁道身份局 - 场地效果 1–8、10
 * 9（永劫轮回）在 rules.js 中实现；4（魔术技巧）的喊话计数、随机奖励与 AI 参与已接入。
 * B4 已确认：洞穴寓言按“每次伤害结算后”检查。
 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const E = SR.events = SR.events || {};
  const G = SR.game;
  const C = SR.cards;
  const U = SR.util;

  const rankValue = (r) => r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : (parseInt(r, 10) || 0);
  const alive = (state) => state.players.filter(p => p.alive);
  const protectedP = (p) => G.isProtected(p);

  E.onStart = function (state, ev) {
    if (!ev) return;
    switch (ev.id) {
      case 1: return E.aha(state);
      case 2: return E.startInterpretation(state);
      case 3: return E.startReminiscence(state);
      case 4: return E.startMagic(state);
      case 5: return E.startSkillPoints(state);
      case 6: return E.startResistance(state);
      case 7: return E.startDot(state);
      case 8: return E.startMoyin(state);
      case 10: return E.startRollingLog(state);
      default: return null;
    }
  };

  E.onEnd = function (state, ev) {
    if (!ev) return;
    switch (ev.id) {
      case 2: return E.endInterpretation(state);
      case 3: return E.endReminiscence(state);
      case 4: return E.endMagic(state);
      case 5: return null; // 战技点跨轮保留
      case 6: return E.endResistance(state);
      case 7: return E.endDot(state);
      case 8: return E.endMoyin(state);
      case 10: return E.endRollingLog(state);
      default: return null;
    }
  };

  E.onActivePlay = function (state, player, cards) {
    if (!state.fieldEffect) return;
    if (state.fieldEffect.id === 2) {
      const pts = (cards || []).reduce((s, c) => s + rankValue(c.rank), 0);
      if (!pts) return;
      player.interpretation = (player.interpretation || 0) + pts;
      E.updateInterpStatus(player);
      E.checkInterpretation(state, player);
    }
    if (state.fieldEffect.id === 3) {
      // 多张牌合打（如姬子弃两张）按实际张数计追忆层数。
      state.reminiscence = (state.reminiscence || 0) + (cards || []).length;
      E.checkReminiscence(state);
    }
  };

  // 伤害后触发的拆分：由 rules.js 按“魔阴身 > 星核 > 欢愉 > 三月七 > 丹恒 > dot”顺序调用。
  E.moyinHeal = function (state, source, target, type, opts, result) {
    if (!state.fieldEffect || state.fieldEffect.id !== 8 || !result) return;
    if (source && source.alive && G.hasStatus(source, 'moyin') &&
        result.hpLoss > 0 && !['D3', 'D4', 'D5', 'D7'].includes(type)) {
      G.heal(state, source, result.hpLoss, '魔阴身');
      if (SR.manual && typeof SR.manual.onAiMoyinHeal === 'function') {
        SR.manual.onAiMoyinHeal(state, source, target, G.nextChatEventSeq(state));
      }
    }
  };

  E.dotAttach = function (state, source, target, type, opts, result) {
    if (!state.fieldEffect || state.fieldEffect.id !== 7 || !result) return;
    if (type === 'D1' && opts.realAnDa && result.damaged &&
        target && target.alive && source && G.hasStatus(source, 'dot_girl')) {
      // P1-7：死亡不附着；被救回则附着。护盾吸收也算。
      target.dots = (target.dots || 0) + 1;
      G.addStatus(target, 'dot', 'dot');
      G.removeStatus(source, 'dot_girl');
      G.log(state, `${source.name} 的【dot女子不会输】触发，${target.name} 附着 1 层【dot】。`);
      // 附着时只能由本人用自己的 1 张 IX 解除 1 层。
  if (SR.ai && SR.ai.chooseIXForDot && target.hand.some(c => c.name === '第IX机关') &&
      SR.ai.chooseIXForDot(state, target, source)) {
    const ix = target.hand.find(c => c.name === '第IX机关');
    G.moveCard(state, ix, null, 'discard');
    const effective = SR.judge && SR.judge.resolveIXChain
      ? SR.judge.resolveIXChain(state, target, ix, 'dot 附着')
      : true;
    if (effective) {
      target.dots = Math.max(0, target.dots - 1);
      if (!target.dots) G.removeStatus(target, 'dot');
      G.log(state, `${target.name} 使用【第IX机关】解除刚附着的 1 层【dot】。`);
    } else {
      G.log(state, `${target.name} 的【第IX机关】被抵消，dot 附着继续生效。`);
    }
  }
      if (target.dots > 0 && G.hasStatus(target, 'dot') &&
          SR.manual && typeof SR.manual.onAiDotAttach === 'function') {
        SR.manual.onAiDotAttach(state, source, target, G.nextChatEventSeq(state));
      }
    }
  };

  E.caveCheck = function (state, source, target, type, opts, result) {
    if (!state.fieldEffect || state.fieldEffect.id !== 3 || !result) return;
    if (opts && opts.noCave) return;
    if (result.hpLoss > 0) {
      state.cave = (state.cave || 0) + result.hpLoss;
      if ((state.groupDepth || 0) > 0) {
        state.groupQueue = state.groupQueue || [];
        if (!state.groupQueue.includes('cave')) state.groupQueue.push('cave');
        return;
      }
      E.checkCave(state);
    }
  };

  // 兼容外部直接调用；实际伤害流程使用上面的拆分钩子。
  E.onDamage = function (state, source, target, type, opts, result) {
    E.moyinHeal(state, source, target, type, opts, result);
    E.dotAttach(state, source, target, type, opts, result);
    E.caveCheck(state, source, target, type, opts, result);
  };

  E.onActionEndDot = function (state, player) {
    if (!player.alive || !player.dots) return;
    const n = player.dots;
    G.log(state, `${player.name} 的 ${n} 层【dot】开始结算。`);
    for (let i = 0; i < n; i++) {
      if (!player.alive || state.over) break;
      G.dealDamage(state, null, player, 1, 'D11', { noSource: true, sourceName: 'dot' });
    }
    player.dots = 0;
    G.removeStatus(player, 'dot');
  };

  // ---------- 1 阿哈真没面子（体力/手牌分开净值；三同走三同效果） ----------
  // 每名角色完整结算后短暂停留，让玩家看清抽到的花色与实际变化。
  E.ahaPause = function (state, p, text) {
    if (!state) return;
    G.pause(state, {
      kind: 'aha',
      duration: 2250,
      playerId: p && p.id,
      reason: '阿哈真没面子',
      text
    });
  };

  // 三同花色：效果公示结束后让“大奖！”短暂停留在老虎机上，
  // 随后 hideAhaSlot 会把文字与老虎机一起移除，再进入下一名玩家。
  E.ahaJackpotHold = function (state, p, draw) {
    if (!draw || draw.length !== 3 || draw[0] !== draw[1] || draw[1] !== draw[2]) return;
    const manual = SR.manual;
    if (!manual || typeof manual.showAhaJackpot !== 'function') return;
    if (!manual.showAhaJackpot(state, p)) return;
    G.pause(state, {
      kind: 'aha',
      duration: 950,
      playerId: p && p.id,
      reason: '阿哈真没面子',
      silent: true
    });
  };

  E.aha = function (state) {
    // 轮次前的场地公示已由 G.startFieldEffect 播完；此处再进入专属音乐与形象。
    if (SR.manual && typeof SR.manual.startAhaScene === 'function') {
      SR.manual.startAhaScene(state);
    }
    const suits = ['方块', '黑桃', '梅花', '红桃'];
    G.withGroupEffect(state, function () {
      for (const p of G.groupOrder(state)) {
        if (state.over) break;
        if (!p.alive) continue;
        const draw = [U.pick(suits, state.rng), U.pick(suits, state.rng), U.pick(suits, state.rng)];
        const before = {
          hp: p.hp,
          maxHp: p.maxHp,
          hand: p.hand.length,
          limit: G.handLimit(p)
        };
        G.log(state, `【阿哈】${p.name} 抽到：${draw.join('、')}。`);
        // 抽奖展示：头像上的三格老虎机先滚动约 2 秒，再进入第IX机关选择/效果结算。
        if (SR.manual && typeof SR.manual.showAhaSlot === 'function') {
          SR.manual.showAhaSlot(state, p, draw);
        }
        G.pause(state, {
          kind: 'aha',
          duration: 2100,
          playerId: p.id,
          reason: '阿哈真没面子',
          silent: true
        });
        let ixTried = false;
        // 一张 IX 免除本次全部效果；是否使用由 chooseIXForAha 决定。
        if (SR.ai && SR.ai.chooseIXForAha && SR.ai.chooseIXForAha(state, p, draw)) {
          if (p.hand.some(c => c.name === '第IX机关')) {
            const ix = p.hand.find(c => c.name === '第IX机关');
            ixTried = true;
            G.moveCard(state, ix, null, 'discard');
            G.log(state, `${p.name} 使用第IX机关，尝试免除本次阿哈效果。`);
            const effective = SR.judge && SR.judge.resolveIXChain
              ? SR.judge.resolveIXChain(state, p, ix, '阿哈效果')
              : true;
            if (effective) {
              E.ahaPause(state, p, `抽到 ${draw.join('、')}；使用【第IX机关】，本次阿哈效果免除。`);
              E.ahaJackpotHold(state, p, draw);
              if (SR.manual && typeof SR.manual.hideAhaSlot === 'function') SR.manual.hideAhaSlot(p.id);
              continue;
            }
          }
        }
        const counts = {};
        for (const s of draw) counts[s] = (counts[s] || 0) + 1;
        const triple = Object.keys(counts).find(k => counts[k] === 3);
        if (triple) {
          E.ahaTriple(state, p, triple);
        } else {
          // 体力与手牌分开结算：
          // 红桃(+1体力) 与 黑桃(-1体力) 抵消；方块(+1手牌) 与 梅花(-1手牌) 抵消。
          const hpNet = (counts['红桃'] || 0) - (counts['黑桃'] || 0);
          const handNet = (counts['方块'] || 0) - (counts['梅花'] || 0);
          if (hpNet > 0) {
            G.heal(state, p, hpNet, '阿哈体力净增');
          } else if (hpNet < 0) {
            G.log(state, `${p.name} 阿哈体力净减 ${-hpNet}。`);
            G.dealDamage(state, null, p, -hpNet, 'D8', { noSource: true });
            if (state.over || !p.alive) {
              E.ahaPause(state, p, `抽到 ${draw.join('、')}；体力 ${before.hp}→${p.hp}，已阵亡。`);
              if (SR.manual && typeof SR.manual.hideAhaSlot === 'function') SR.manual.hideAhaSlot(p.id);
              continue;
            }
          }
          if (handNet > 0) {
            const cs = G.searchCards(state, c => true, handNet, true);
            for (const c of cs) G.gainCard(state, p, c, '阿哈手牌净增');
          } else if (handNet < 0) {
            E.loseCards(state, p, -handNet);
          }
          if (hpNet === 0 && handNet === 0) {
            G.log(state, `${p.name} 阿哈净 0：体力和手牌均无净变化。`);
          } else {
            G.log(state, `${p.name} 阿哈结算：体力净 ${hpNet >= 0 ? '+' : ''}${hpNet}，手牌净 ${handNet >= 0 ? '+' : ''}${handNet}。`);
          }
        }
        const changes = [];
        const maxHpDelta = p.maxHp - before.maxHp;
        const hpDelta = p.hp - before.hp;
        const handDelta = p.hand.length - before.hand;
        if (maxHpDelta) changes.push(`体力上限${maxHpDelta > 0 ? '+' : ''}${maxHpDelta}`);
        if (hpDelta) changes.push(`体力${hpDelta > 0 ? '+' : ''}${hpDelta}`);
        // 手牌上限只显示三同方块/三同梅花带来的永久修正；
        // 由当前体力变化连带产生的手牌上限变化不显示。
        if (triple === '方块' || triple === '梅花') {
          const limitDelta = G.handLimit(p) - before.limit;
          if (limitDelta) changes.push(`手牌上限${limitDelta > 0 ? '+' : ''}${limitDelta}`);
        }
        if (handDelta) changes.push(`手牌${handDelta > 0 ? '+' : ''}${handDelta}`);
        if (!changes.length) changes.push(p.alive ? '无净变化' : '已阵亡');
        else if (!p.alive) changes.push('已阵亡');
        if (ixTried) changes.unshift('第IX机关未生效');
        if (triple) changes.unshift(`三同（${triple}）`);
        E.ahaPause(state, p, `抽到 ${draw.join('、')}；${changes.join('，')}。`);
        E.ahaJackpotHold(state, p, draw);
        if (SR.manual && typeof SR.manual.hideAhaSlot === 'function') SR.manual.hideAhaSlot(p.id);
        if (state.over) return;
      }
    });
    if (SR.manual && typeof SR.manual.hideAhaSlot === 'function') SR.manual.hideAhaSlot();
  };

  E.ahaSingle = function (state, p, suit) {
    if (!p.alive) return;
    if (suit === '方块') {
      const cs = G.searchCards(state, c => true, 1, true);
      for (const c of cs) G.gainCard(state, p, c, '阿哈方块');
    } else if (suit === '黑桃') {
      G.log(state, `${p.name} 受到阿哈黑桃 1 点伤害。`);
      G.dealDamage(state, null, p, 1, 'D8', { noSource: true });
    } else if (suit === '梅花') {
      E.loseCards(state, p, 1);
    } else if (suit === '红桃') {
      G.heal(state, p, 1, '阿哈红桃');
    }
  };

  E.ahaDouble = function (state, p, suit) {
    if (!p.alive) return;
    G.log(state, `${p.name} 阿哈净 2（${suit}）：按一次 2 点效果结算。`);
    if (suit === '方块') {
      const cs = G.searchCards(state, c => true, 2, true);
      for (const c of cs) G.gainCard(state, p, c, '阿哈方块×2');
    } else if (suit === '黑桃') {
      G.dealDamage(state, null, p, 2, 'D8', { noSource: true });
    } else if (suit === '梅花') {
      E.loseCards(state, p, 2);
    } else if (suit === '红桃') {
      G.heal(state, p, 2, '阿哈红桃×2');
    }
  };

  E.ahaTriple = function (state, p, suit) {
    if (suit === '方块') {
      p.handLimitMod += 1;
      G.log(state, `${p.name} 阿哈方块×3：手牌上限永久 +1。`);
    } else if (suit === '黑桃') {
      p.maxHp -= 1;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      G.log(state, `${p.name} 阿哈黑桃×3：体力上限 -1（当前 ${p.hp}/${p.maxHp}）。`);
      if (p.maxHp <= 0) G.killPlayer(state, p, null, '阿哈上限归零');
    } else if (suit === '梅花') {
      p.handLimitMod -= 1;
      G.log(state, `${p.name} 阿哈梅花×3：手牌上限永久 -1。`);
    } else if (suit === '红桃') {
      p.maxHp += 1;
      G.log(state, `${p.name} 阿哈红桃×3：体力上限 +1。`);
    }
  };

  E.loseCards = function (state, p, count) {
    for (let i = 0; i < count; i++) {
      if (p.hand.length) {
        const c = p.hand[Math.floor(state.rng() * p.hand.length)];
        G.discardCard(state, p, c);
      } else {
        const equips = Object.values(p.equipment).filter(Boolean);
        if (equips.length) {
          const c = equips[Math.floor(state.rng() * equips.length)];
          G.discardCard(state, p, c);
        }
      }
    }
  };

  // ---------- 2 黑塔女士举世无双 ----------
  E.startInterpretation = function (state) {
    for (const p of G.groupOrder(state)) {
      // 事件开始时每位玩家的初始解读为 0–15 的均匀随机整数（含两端）。
      p.interpretation = Math.floor(state.rng() * 16);
      // 即使为 0 也显示【解读】词条与菱形计数。
      E.updateInterpStatus(p, true);
    }
  };

  E.updateInterpStatus = function (p, visible) {
    G.removeStatus(p, 'interpretation');
    if (visible !== false) {
      G.addStatus(p, 'interpretation', '解读', { value: Math.max(0, Number(p.interpretation) || 0) });
    }
  };

  E.checkInterpretation = function (state, p) {
    if (p.interpretation > 42) {
      G.log(state, `${p.name} 解读 ${p.interpretation} > 42，受到 1 点伤害并清除解读。`);
      p.interpretation = 0;
      E.updateInterpStatus(p, false);
      if (SR.manual && typeof SR.manual.showInsightShatter === 'function') {
        SR.manual.showInsightShatter(p);
      }
      G.dealDamage(state, null, p, 1, 'D9', { noSource: true });
    } else if (p.interpretation === 42) {
      G.log(state, `${p.name} 解读 = 42：魔杖赐福后回满并按手牌上限抽牌。`);
      // 先展示魔杖与赐福，再移除解读并发放奖励。
      G.pause(state, {
        kind: 'insight-wand',
        duration: 1900,
        playerId: p.id,
        reason: '解读42'
      });
      p.interpretation = 0;
      E.updateInterpStatus(p, false);
      G.heal(state, p, p.maxHp - p.hp, '解读42');
      const need = Math.max(0, G.handLimit(p) - p.hand.length);
      if (need > 0) G.draw(state, p, need);
      if (SR.manual && typeof SR.manual.onAiInsight42 === 'function') {
        SR.manual.onAiInsight42(state, p, G.nextChatEventSeq(state));
      }
    }
  };

  E.endInterpretation = function (state) {
    const vals = alive(state).filter(p => !protectedP(p));
    let maxP = null, minP = null;
    if (vals.length >= 2) {
      const sorted = vals.slice().sort((a, b) => (b.interpretation || 0) - (a.interpretation || 0));
      const hi = sorted[0].interpretation || 0;
      const lo = sorted[sorted.length - 1].interpretation || 0;
      const maxes = sorted.filter(p => (p.interpretation || 0) === hi);
      const mins = sorted.filter(p => (p.interpretation || 0) === lo);
      if (hi !== lo && maxes.length === 1 && mins.length === 1) {
        maxP = maxes[0]; minP = mins[0];
      }
    }
    if (maxP && minP) {
      const tmp = maxP.hand;
      maxP.hand = minP.hand;
      minP.hand = tmp;
      for (const c of maxP.hand) c.ownerId = maxP.id;
      for (const c of minP.hand) c.ownerId = minP.id;
      G.log(state, `【解读】轮末交换：${maxP.name} ↔ ${minP.name} 全部手牌。`);
    } else {
      G.log(state, `【解读】轮末没有恰好唯一最高/最低，不交换。`);
    }
    const heldInsight = state.players.filter(p => (p.statuses || []).some(s => s.id === 'interpretation'));
    for (const p of state.players) {
      p.interpretation = 0;
      G.removeStatus(p, 'interpretation');
    }
    // 轮末解除解读：未在 42 时转化为魔杖的角色播放镜面破碎。
    if (SR.manual && typeof SR.manual.showInsightShatter === 'function') {
      for (const p of heldInsight) SR.manual.showInsightShatter(p);
    }
  };

  // ---------- 3 浪漫古士 ----------
  E.startReminiscence = function (state) {
    if (state.reminiscence == null) state.reminiscence = 18 - state.players.length * 2;
    // 本局初始玩家数：state.players 包含本局全部玩家（含已阵亡者），不会随存活人数变化。
    if (state.cave == null) state.cave = 8 - state.players.length;
    G.log(state, `【追忆】${state.reminiscence}，【洞穴寓言】${state.cave}。`);
  };

  E.checkReminiscence = function (state) {
    if (!state.fieldEffect || state.fieldEffect.id !== 3) return;
    // 群体效果进行中触发的追忆，等当前群体效果完整结算后再处理。
    if ((state.groupDepth || 0) > 0) {
      state.groupQueue = state.groupQueue || [];
      if (!state.groupQueue.includes('reminiscence')) state.groupQueue.push('reminiscence');
      return;
    }
    G.withGroupEffect(state, function () {
      // 必须先触发一次 24，之后才允许 12；在此之前即使达到 12 也不触发。
      if (!state.reminiscence24Used) {
        if (state.reminiscence < 24) return;
        const targets = G.groupOrder(state).filter(p => p.alive && !protectedP(p));
        if (targets.length) {
          G.pause(state, { kind: 'reminiscence-hearts', duration: 900, reason: '追忆24' });
        }
        state.reminiscence24Used = true;
        state.reminiscence -= 24;
        for (const p of G.groupOrder(state)) {
          G.draw(state, p, 1);
          G.heal(state, p, 1, '追忆24');
        }
        G.log(state, `【追忆】达到 24：全体摸 1 回 1（一局一次）。`);
        if (SR.manual && typeof SR.manual.onAiRomanceTrigger === 'function') {
          SR.manual.onAiRomanceTrigger(state, G.nextChatEventSeq(state));
        }
      }
      while (state.reminiscence >= 12 && !state.over) {
        const targets = G.groupOrder(state).filter(p => p.alive && !protectedP(p));
        if (targets.length) {
          G.pause(state, { kind: 'reminiscence-hearts', duration: 900, reason: '追忆12' });
        }
        state.reminiscence -= 12;
        for (const p of G.groupOrder(state)) G.draw(state, p, 1);
        G.log(state, `【追忆】达到 12：全体摸 1。`);
        if (SR.manual && typeof SR.manual.onAiRomanceTrigger === 'function') {
          SR.manual.onAiRomanceTrigger(state, G.nextChatEventSeq(state));
        }
      }
    });
  };

  E.checkCave = function (state) {
    if (!state.fieldEffect || state.fieldEffect.id !== 3) return;
    if (state.cave < 13) return;
    if ((state.groupDepth || 0) > 0) {
      state.groupQueue = state.groupQueue || [];
      if (!state.groupQueue.includes('cave')) state.groupQueue.push('cave');
      return;
    }
    G.withGroupEffect(state, function () {
      // B4 已确认：每次伤害结算后检查实际体力下降。
      let guard = 0;
      while (state.cave >= 13 && !state.over && guard++ < 20) {
        G.pause(state, { kind: 'cave-shockwave', duration: 650, reason: '洞穴寓言' });
        state.cave -= 13;
        G.log(state, `【洞穴寓言】达到 13，触发一次无来源帝弓光矢。`);
        for (const t of G.groupOrder(state)) {
          if (state.over || !t.alive || protectedP(t)) continue;
          G.dealDamage(state, null, t, 1, 'D14', { noSource: true, noCave: true });
        }
        // D14 的伤害不再回馈洞穴（caveCheck 检查 noCave）。
        if (!state.over && SR.manual && typeof SR.manual.onAiRomanceTrigger === 'function') {
          SR.manual.onAiRomanceTrigger(state, G.nextChatEventSeq(state));
        }
      }
    });
  };

  E.endReminiscence = function (state) {
    // 数值跨轮保留，轮末只隐藏。
    G.log(state, `【追忆】${state.reminiscence} / 【洞穴寓言】${state.cave} 隐藏，跨轮保留。`);
  };

  // ---------- 4 魔术技巧（玩家通过聊天语音参与） ----------
  E.startMagic = function (state) {
    state.magicCounts = {};
    state.magicRewarded = {};
    state.magicRewardEnded = false;
    for (const p of G.groupOrder(state)) {
      state.magicCounts[p.id] = 0;
      G.addStatus(p, 'magic_trick', '大地兽激推');
    }
    G.log(state, `【魔术技巧】喊话计数从 0 开始（玩家可在聊天栏发送语音【魔术技巧】）。`);
    if (SR.manual && typeof SR.manual.startMagicAiChat === 'function') {
      SR.manual.startMagicAiChat(state);
    }
  };
  E.endMagic = function (state) {
    for (const p of state.players) G.removeStatus(p, 'magic_trick');
  };

  // 玩家发送语音【魔术技巧】：只由聊天系统在场地效果 4 生效时调用。
  E.magicShout = function (state, player) {
    if (!state || !player || !player.alive) return null;
    if (!state.fieldEffect || state.fieldEffect.id !== 4) return null;
    if (!state.magicCounts) state.magicCounts = {};
    if (!state.magicRewarded) state.magicRewarded = {};
    const count = (state.magicCounts[player.id] || 0) + 1;
    state.magicCounts[player.id] = count;
    G.log(state, `${player.name} 喊出【魔术技巧】（${count}/10）。`);
    let reward = null;
    let ended = false;
    let message = '';
    if (count >= 10 && !state.magicRewardEnded && !state.magicRewarded[player.id]) {
      const cards = G.searchCards(state, c => c.name === '奇巧零食', 1, true);
      if (cards.length) {
        reward = cards[0];
        G.gainCard(state, player, reward, '魔术技巧');
        state.magicRewarded[player.id] = true;
        G.log(state, `${player.name} 率先喊满 10 次，获得【奇巧零食】。`);
      } else {
        state.magicRewardEnded = true;
        ended = true;
        message = '牌堆中没有可检索的【奇巧零食】';
        G.log(state, `【魔术技巧】牌堆中没有可检索的【奇巧零食】，奖励结束；所有人仍可继续喊。`);
      }
    }
    // 所有存活玩家都拿到奖励后，本轮奖励竞争结束；仍允许继续发送语音。
    const alive = state.players.filter(p => p.alive);
    if (alive.length && alive.every(p => !!state.magicRewarded[p.id])) {
      if (!state.magicRewardEnded) {
        state.magicRewardEnded = true;
        ended = true;
        message = '所有存活玩家都已获得奖励';
        G.log(state, `【魔术技巧】所有存活玩家都已获得奖励，奖励竞争结束。`);
      }
    }
    return { count, reward, ended, message };
  };

  // ---------- 5 花花火火恍恍惚惚 ----------
  E.startSkillPoints = function (state) {
    // 轮次前的场地公示已由 G.startFieldEffect 播完；此处再进入花火专属音乐。
    if (SR.manual && typeof SR.manual.startHuahuoMusic === 'function') {
      SR.manual.startHuahuoMusic(state);
    }
    for (const p of G.groupOrder(state)) {
      p.skillPoints = (p.skillPoints || 0) + 6;
      E.syncSkillStatus(p);
    }
    G.log(state, `【别逗你花姐笑了】所有存活玩家 +6 层（战技点）。`);
  };

  E.syncSkillStatus = function (p) {
    G.removeStatus(p, 'skill_point');
    if (p.skillPoints > 0) {
      G.addStatus(p, 'skill_point', '别逗你花姐笑了', { value: p.skillPoints });
    }
  };

  E.useSkillPoint = function (state, p) {
    if (!p.alive || p.skillPoints <= 0 || state.phase !== 'play') return false;
    p.skillPoints -= 1;
    E.syncSkillStatus(p);
    G.log(state, `${p.name} 消耗 1 个战技点抽奖（【别逗你花姐笑了】剩余 ${p.skillPoints} 层）。`);
    if (SR.manual && typeof SR.manual.playSkillPointSfx === 'function') SR.manual.playSkillPointSfx(state, p);
    const drew = state.rng() < 0.5;
    if (drew) {
      const cs = G.searchCards(state, () => true, 1, true);
      for (const c of cs) G.gainCard(state, p, c, '战技点');
    } else {
      E.loseCards(state, p, 1);
    }
    if (SR.manual && SR.manual.showSkillPointFx) SR.manual.showSkillPointFx(state, p, drew);
    if (p.skillPointChatTurn !== p.turnSerial) {
      p.skillPointChatTurn = p.turnSerial;
      p.skillPointChatCount = 0;
    }
    p.skillPointChatCount = (p.skillPointChatCount || 0) + 1;
    if (p.skillPointChatCount === 4 && SR.manual && typeof SR.manual.onAiHuahuoSkillPoints === 'function') {
      SR.manual.onAiHuahuoSkillPoints(state, p, G.nextChatEventSeq(state));
    }
    return true;
  };

  // ---------- 6 牢景又站起来了 ----------
  E.startResistance = function (state) {
    for (const p of G.groupOrder(state)) {
      G.addStatus(p, 'effect_resistance', '100%效果抵抗');
      G.addStatus(p, 'divine_king', '帮帮我神君先生');
      p.divineGains = 0;
    }
  };

  E.endResistance = function (state) {
    for (const p of state.players) {
      G.removeStatus(p, 'effect_resistance');
      G.removeStatus(p, 'divine_king');
    }
  };

  E.divineGain = function (state, p) {
    if (!state.fieldEffect || state.fieldEffect.id !== 6 || !G.hasStatus(p, 'divine_king')) return;
    if ((p.divineGains || 0) >= 2) return;
    const cs = G.searchCards(state, c => c.name === '再见安打', 1, true);
    if (cs.length) {
      p.divineGains = (p.divineGains || 0) + 1;
      G.gainCard(state, p, cs[0], '帮帮我神君先生');
      if (SR.manual && typeof SR.manual.onAiLaojingAnda === 'function') {
        SR.manual.onAiLaojingAnda(state, p, G.nextChatEventSeq(state));
      }
    }
  };

  // ---------- 7 等下一个天亮 ----------
  E.startDot = function (state) {
    for (const p of G.groupOrder(state)) {
      G.addStatus(p, 'dot_girl', 'dot女子不会输');
    }
  };
  E.endDot = function (state) {
    for (const p of state.players) G.removeStatus(p, 'dot_girl');
  };

  // ---------- 8 我有魔芋爽 ----------
  E.startMoyin = function (state) {
    for (const p of G.groupOrder(state)) {
      if (SR.ai && SR.ai.chooseIXForMoyin && p.hand.some(c => c.name === '第IX机关') &&
          SR.ai.chooseIXForMoyin(state, p)) {
        const ix = p.hand.find(c => c.name === '第IX机关');
        G.moveCard(state, ix, null, 'discard');
        const effective = SR.judge && SR.judge.resolveIXChain
          ? SR.judge.resolveIXChain(state, p, ix, '魔阴身')
          : true;
        if (effective) {
          G.log(state, `${p.name} 使用【第IX机关】解除自己刚获得的【魔阴身】。`);
        } else {
          G.addStatus(p, 'moyin', '魔阴身');
          G.log(state, `${p.name} 的【第IX机关】被抵消，仍获得【魔阴身】。`);
        }
      } else {
        G.addStatus(p, 'moyin', '魔阴身');
      }
    }
  };

  E.endMoyin = function (state) {
    for (const p of state.players) G.removeStatus(p, 'moyin');
    G.withGroupEffect(state, function () {
      for (const p of G.groupOrder(state)) {
        if (state.over) break;
        if (!p.alive) continue;
        G.log(state, `【魔芋爽】轮末：${p.name} 受到 1 点无来源、不可防止伤害。`);
        G.dealDamage(state, null, p, 1, 'D12', { noSource: true, unpreventable: true });
      }
    });
    // 手动界面：伤害数字落位后，全体存活者状态栏展示加倍的藤蔓/银杏叶。
    // 该暂停只影响展示；自动模拟和 AI 对局不经过这里。
    if (SR.manual && typeof SR.manual.showMoyinFx === 'function') {
      SR.manual.showMoyinFx(state);
    }
  };

  // ---------- 10 棍母 ----------
  E.startRollingLog = function (state) {
    for (const p of G.groupOrder(state)) G.addStatus(p, 'rolling_log', '滚木');
  };
  E.endRollingLog = function (state) {
    for (const p of state.players) G.removeStatus(p, 'rolling_log');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
