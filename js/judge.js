/* 星穹铁道身份局 - 判定 / 延时锦囊 / 第IX机关 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const J = SR.judge = SR.judge || {};
  const C = SR.cards;

  J.MEMORY_ICE_ELEMENTS = ['冰', '量子', '物理', '风'];

  // 判定结果只用于界面公示，不改变任何规则；结果与对应卡牌/技能的既有判定条件一致。
  J.outcomeFor = function (reason, card) {
    if (!card) return null;
    const rank = card.rank;
    const value = rank === 'A' ? 1 : rank === 'J' ? 11 : rank === 'Q' ? 12 : rank === 'K' ? 13 : parseInt(rank, 10);
    if (reason === '记忆冰封') {
      const hit = J.MEMORY_ICE_ELEMENTS.includes(card.element);
      return hit
        ? { tone: 'success', short: '判定成功', text: '判定成功 · 跳过出牌阶段' }
        : { tone: 'fail', short: '判定失败', text: '判定失败 · 不跳过出牌阶段' };
    }
    if (reason === '终末裁决') {
      return card.element === '雷'
        ? { tone: 'danger', short: '判定触发', text: '判定触发 · 3 点雷电伤害' }
        : { tone: 'info', short: '未触发', text: '未触发 · 转移/弃置' };
    }
    if (reason === '反重力皮靴') {
      const ok = ['物理', '冰', '虚数', '量子'].includes(card.element);
      return ok
        ? { tone: 'success', short: '判定成功', text: '判定成功 · 获得插入行动机会' }
        : { tone: 'fail', short: '判定失败', text: '判定失败 · 按正常顺序行动' };
    }
    if (reason === '入梦池') {
      return value % 2 === 1
        ? { tone: 'success', short: '判定成功', text: '判定成功 · 跳过本次行动' }
        : { tone: 'fail', short: '判定失败', text: '判定失败 · 本次行动继续' };
    }
    if (reason === '黄紫衬衫') {
      const ok = ['物理', '火', '风'].includes(card.element);
      return ok
        ? { tone: 'success', short: '判定成功', text: '判定成功 · 视为打出【闪身步】' }
        : { tone: 'fail', short: '判定失败', text: '判定失败 · 不能视为【闪身步】' };
    }
    if (reason === '以牙还牙甲') {
      return [2, 4, 6, 8, 10].includes(parseInt(rank, 10))
        ? { tone: 'success', short: '判定成功', text: '判定成功 · 触发反伤' }
        : { tone: 'fail', short: '判定失败', text: '判定失败 · 不触发反伤' };
    }
    if (reason === '欢愉') {
      if (value <= 4) return { tone: 'success', short: `判定 ${rank}`, text: `判定结果 ${rank} · 摸一张牌` };
      if (value <= 10) return { tone: 'info', short: `判定 ${rank}`, text: `判定结果 ${rank} · 弃牌/无牌受伤` };
      return { tone: 'success', short: `判定 ${rank}`, text: `判定结果 ${rank} · 回复 1 点体力` };
    }
    return null;
  };

  J.judge = function (state, actor, reason, options) {
    const game = SR.game;
    const card = game.drawOne(state, null, 'judge');
    if (!card) {
      game.log(state, `判定（${reason}）：牌堆与弃牌堆均无牌，判定失败。`);
      return null;
    }
    game.log(state, `判定（${reason}）：${actor.name} 翻开 ${C.cardText(card)}。`);
    // 判定牌对所有人公开；进入弃牌堆后仍保留牌面信息供界面公示。
    state.publicJudge = {
      card, actorId: actor.id, reason,
      outcome: J.outcomeFor(reason, card),
      seq: (state.publicSeq = (state.publicSeq || 0) + 1)
    };
    // 判定牌向所有人展示 3 秒后，再进入弃牌堆并隐藏。
    if (game.pause) {
      game.pause(state, {
        kind: 'judge',
        duration: 2250,
        reason,
        playerId: actor.id,
        cardUid: card.uid
      });
    }
    card.zone = 'discard';
    state.discard.push(card);
    state.publicJudge = null;
    return card;
  };

  // 打出一张 IX 后，顺次询问有 IX 的玩家是否用 IX 抵消它。
  // 返回 true 表示最初的那张 IX 最终生效（即原本要被抵消的效果应被取消）。
  J.resolveIXChain = function (state, initialUser, initialCard, targetLabel) {
    const game = SR.game;
    const chain = [{ user: initialUser, card: initialCard }];
    const used = new Set([initialUser.id]);
    let currentUser = initialUser;
    let currentLabel = targetLabel || '效果';
    let guard = 0;
    while (!state.over && guard++ < 32) {
      let next = null;
      for (const id of game.roundOrderFromNavigator(state)) {
        const p = game.getPlayer(state, id);
        if (!p || !p.alive || used.has(p.id)) continue;
        const ix = p.hand.find(c => c.name === '第IX机关');
        if (!ix) continue;
        const use = SR.ai && SR.ai.chooseIXForIX
          ? SR.ai.chooseIXForIX(state, p, currentUser, currentLabel)
          : false;
        if (use) { next = { p, ix }; break; }
      }
      if (!next) break;
      used.add(next.p.id);
      game.moveCard(state, next.ix, null, 'discard');
      game.noteActivePlay(state, next.p, [next.ix]);
      game.log(state, `${next.p.name} 使用【第IX机关】抵消${currentUser.name} 的【第IX机关】。`);
      chain.push({ user: next.p, card: next.ix });
      currentUser = next.p;
      currentLabel = '第IX机关';
    }
    const effective = chain.length % 2 === 1;
    if (chain.length > 1) {
      game.log(state, effective
        ? `IX 连锁结束：最初的第IX机关最终生效，${targetLabel || '原效果'}被取消。`
        : `IX 连锁结束：最初的第IX机关被抵消，${targetLabel || '原效果'}正常生效。`);
    }
    return effective;
  };

  J.askIXBeforeJudgment = function (state, actor, reason) {
    // 返回 true 表示本次判定被 IX 跳过。
    if (state.options && state.options.disableIX) return false;
    if (!SR.ai || !SR.ai.chooseIXForJudgment) return false;
    // 判定前的 IX 询问也必须从领航员起，按本轮统一行动顺序。
    const users = SR.game.roundOrderFromNavigator(state)
      .map(id => SR.game.getPlayer(state, id))
      .filter(p => p && p.alive && p.hand.some(c => c.name === '第IX机关'));
    for (const p of users) {
      if (SR.ai.chooseIXForJudgment(state, p, actor, reason)) {
        const ix = p.hand.find(c => c.name === '第IX机关');
        SR.game.moveCard(state, ix, p, 'discard');
        SR.game.noteActivePlay(state, p, [ix]);
        SR.game.log(state, `${p.name} 使用【第IX机关】，尝试跳过本次判定（${reason}）。`);
        return J.resolveIXChain(state, p, ix, `本次判定（${reason}）`);
      }
    }
    return false;
  };

  J.askIXForTrick = function (state, owner, card, target) {
    // 锦囊打出时的 IX 询问从领航员起按本轮行动顺序进行。
    // 发起者本人不参与：不能用自己的 IX 取消自己刚打出的锦囊。
    const game = SR.game;
    const order = game.roundOrderFromNavigator(state);
    for (const id of order) {
      const p = game.getPlayer(state, id);
      if (!p || !p.alive) continue;
      if (p.id === owner.id) continue;
      if (!p.hand.some(c => c.name === '第IX机关')) continue;
      const use = SR.ai && SR.ai.chooseIXForTrick
        ? SR.ai.chooseIXForTrick(state, p, card, target)
        : false;
      if (use) {
        const ix = p.hand.find(c => c.name === '第IX机关');
        game.moveCard(state, ix, null, 'discard');
        game.noteActivePlay(state, p, [ix]);
        game.log(state, `${p.name} 使用【第IX机关】尝试取消【${card.name}】。`);
        return J.resolveIXChain(state, p, ix, `【${card.name}】`);
      }
    }
    return false;
  };

  J.resolveMemoryIce = function (state, player, card) {
    const game = SR.game;
    game.log(state, `${player.name} 判定【记忆冰封】。`);
    if (J.askIXBeforeJudgment(state, player, '记忆冰封')) {
      // A1：IX 只跳过本次判定，记忆冰封本身保留在判定区；没有翻出判定牌。
      // 标记本回合已跳过，避免手动判定面板在同一回合反复点击同一张牌。
      card.judgeSkippedTurn = player.turnSerial;
      game.log(state, `【记忆冰封】的本次判定被跳过，锦囊保留在判定区。`);
      return null;
    }
    const judged = J.judge(state, player, '记忆冰封');
    if (judged && J.MEMORY_ICE_ELEMENTS.includes(judged.element)) {
      player.skipPlay = true;
      player.statuses.push({ id: 'incineration', name: '焚化', source: '记忆冰封' });
      game.log(state, `${player.name} 被【记忆冰封】命中，跳过出牌阶段。`);
    }
    game.moveCard(state, card, null, 'discard');
    return judged;
  };

  J.resolveJudgePhase = function (state, player) {
    const game = SR.game;
    // 记忆冰封与终末裁决已移到“开始行动时”结算；本阶段只处理其他延时锦囊。
    const snapshot = player.judge.slice().reverse();
    for (const card of snapshot) {
      if (!player.judge.includes(card)) continue;
      if (card.name === '记忆冰封' || card.name === '终末裁决') continue;
      game.log(state, `未实现的延时锦囊：${card.name}，进入弃牌堆。`);
      game.moveCard(state, card, null, 'discard');
    }
  };

  J.resolveMemoryIceForActor = function (state, player) {
    const snapshot = player.judge.filter(c => c.name === '记忆冰封').slice().reverse();
    for (const card of snapshot) {
      if (!player.judge.includes(card) || !player.alive) break;
      J.resolveMemoryIce(state, player, card);
    }
  };

  // 结算一张【终末裁决】。返回翻开的判定牌；被 IX 跳过时返回 null。
  J.resolveTerminalCard = function (state, actor, terminal) {
    const game = SR.game;
    if (!actor || !terminal || !actor.alive || state.over) return null;
    if (!actor.judge.includes(terminal)) return null;
    game.log(state, `【终末裁决】在 ${actor.name} 开始行动时判定（目标：${actor.name}）。`);
    if (J.askIXBeforeJudgment(state, actor, '终末裁决')) {
      game.log(state, `【终末裁决】本次判定被跳过，随后转移给下一个角色。`);
      J.transferTerminal(state, actor, terminal);
      return null;
    }
    const judged = J.judge(state, actor, '终末裁决');
    if (judged && judged.element === '雷') {
      game.log(state, `【终末裁决】触发：${actor.name} 受到 3 点雷电伤害。`);
      // 判定成功：本体先移出判定区并直接进入弃牌堆，随后才结算伤害；绝不走转移分支。
      game.moveCard(state, terminal, null, 'discard');
      game.log(state, `【终末裁决】判定成功，进入弃牌堆，不再转移。`);
      game.dealDamage(state, null, actor, 3, 'D6', {
        sourceName: '终末裁决', unDodgeable: true, noSource: true
      });
      return judged;
    }
    // 只有未触发（或判定被 IX 跳过）才转移；成功分支已提前返回。
    J.transferTerminal(state, actor, terminal);
    return judged;
  };

  J.resolveTerminalBeforeAction = function (state, actor) {
    // 新时序：只有持有者在自己开始行动时判定；未触发则依次转移给下一个可被指定的角色。
    const terminals = actor.judge.filter(c => c.name === '终末裁决').slice().reverse();
    for (const terminal of terminals) {
      if (!actor.alive || state.over) break;
      if (!actor.judge.includes(terminal)) continue;
      J.resolveTerminalCard(state, actor, terminal);
      if (state.over) return;
    }
  };

  // 手动判定阶段：每次只取一张“开始行动时”判定牌，便于逐张公示与操作。
  J.startJudgeCards = function (player) {
    return (player && player.judge ? player.judge : []).filter(c => {
      if (c.name === '终末裁决') return true;
      if (c.name !== '记忆冰封') return false;
      // 被 IX 跳过的记忆冰封保留到下一回合再判定。
      return c.judgeSkippedTurn !== player.turnSerial;
    });
  };

  J.startJudgeCount = function (player) {
    return J.startJudgeCards(player).length;
  };

  J.resolveOneStartJudge = function (state, player) {
    if (!player || !player.alive || state.over) return null;
    const cards = J.startJudgeCards(player);
    const terminal = cards.filter(c => c.name === '终末裁决').slice().reverse()[0];
    if (terminal) {
      return { card: terminal, kind: '终末裁决', judged: J.resolveTerminalCard(state, player, terminal) };
    }
    const memory = cards.filter(c => c.name === '记忆冰封').slice().reverse()[0];
    if (memory) {
      return { card: memory, kind: '记忆冰封', judged: J.resolveMemoryIce(state, player, memory) };
    }
    return null;
  };

  J.transferTerminal = function (state, actor, terminal) {
    const game = SR.game;
    const nextId = game.actionOrderFrom(state, actor.id).find(id => {
      if (id === actor.id) return false;
      const q = game.getPlayer(state, id);
      return q && q.alive && !game.isProtected(q);
    });
    if (nextId) {
      const next = game.getPlayer(state, nextId);
      game.moveCard(state, terminal, next, 'judge');
      game.log(state, `【终末裁决】转移给 ${next.name}，在其开始行动时判定。`);
    } else {
      game.moveCard(state, terminal, null, 'discard');
    }
  };

  J.revealTop = function (state, count, reason) {
    const game = SR.game;
    if (game.ensureDeckCount) game.ensureDeckCount(state, count);
    const out = [];
    for (let i = 0; i < count; i++) {
      const c = game.drawOne(state, null, 'reveal');
      if (!c) break;
      c.zone = 'reveal';
      out.push(c);
    }
    if (out.length) game.log(state, `${reason || '亮牌'}：${out.map(C.cardText).join('、')}。`);
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
