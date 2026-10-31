/* 星穹铁道身份局 - 调试用 UI（Phase 1 自动模拟） */
(function (root) {
  const SR = root.SR = root.SR || {};
  const UI = SR.ui = SR.ui || {};
  const U = SR.util;
  const G = SR.game;

  // 网页测试器的显示名；内部 tally 仍使用 navigator/rebel/traitor/none 便于回归测试。
  UI.factionLabels = {
    navigator: '领航员&无名客',
    loyalist: '无名客',
    rebel: '虚卒',
    traitor: '内鬼',
    none: '救世主',
    draw: '平局',
    error: '错误'
  };
  UI.factionLabel = function (key) {
    return UI.factionLabels[key] || key;
  };

  UI.init = function () {
    const charSelect = document.getElementById('character');
    const chars = SR.data.characters.slice();
    charSelect.innerHTML = chars.map(c =>
      `<option value="${U.escapeHtml(c.id)}">${U.escapeHtml(c.name)}（${c.hp} 体力）</option>`
    ).join('');
    const pathSelect = document.getElementById('path');
    pathSelect.innerHTML = SR.data.paths.map(p =>
      `<option value="${U.escapeHtml(p.id)}">${U.escapeHtml(p.name)}</option>`
    ).join('');
    charSelect.addEventListener('change', function () {
      UI.updatePathVisibility();
      UI.updateCharacterInfo();
    });
    document.getElementById('path').addEventListener('change', UI.updateCharacterInfo);
    UI.updatePathVisibility();
    UI.updateCharacterInfo();

    document.getElementById('startBtn').addEventListener('click', UI.start);
    document.getElementById('batchBtn').addEventListener('click', UI.batch);
    document.getElementById('saveBtn').addEventListener('click', UI.save);
    document.getElementById('loadBtn').addEventListener('click', UI.load);
  };

  UI.save = function () {
    if (!UI.current) {
      alert('还没有可保存的对局。');
      return;
    }
    try {
      SR.sim.saveGame(UI.current);
      alert('已保存到本机 localStorage。');
    } catch (e) {
      alert('保存失败：' + (e && e.message || e));
    }
  };

  UI.load = function () {
    try {
      const state = SR.sim.loadGame();
      if (!state) {
        alert('没有找到存档。');
        return;
      }
      UI.current = state;
      UI.render(state);
    } catch (e) {
      alert('读取失败：' + (e && e.message || e));
    }
  };

  UI.updatePathVisibility = function () {
    const charId = document.getElementById('character').value || '';
    document.getElementById('pathLabel').hidden = charId.indexOf('trailblazer') !== 0;
  };

  // 角色信息区：只展示卡牌数据中的角色资料，不接触对局隐藏身份。
  UI.updateCharacterInfo = function () {
    const el = document.getElementById('characterInfo');
    if (!el) return;
    const charId = document.getElementById('character').value || '';
    const c = SR.data.characters.find(x => x.id === charId);
    if (!c) {
      el.innerHTML = '<p class="hint">请选择一个角色。</p>';
      return;
    }
    const esc = U.escapeHtml;
    const isTrailblazer = c.id.indexOf('trailblazer') === 0;
    const pathId = document.getElementById('path').value || '';
    const path = isTrailblazer ? SR.data.paths.find(x => x.id === pathId) : null;
    const skillCard = (label, data) => data
      ? `<article class="skill-card">
           <div class="skill-title"><span class="skill-label">${esc(label)}</span>${esc(data.name || '')}</div>
           <div class="skill-effect">${esc(data.effect || '')}</div>
         </article>`
      : '';
    const pathCard = path
      ? `<article class="skill-card">
           <div class="skill-title"><span class="skill-label">命途</span>${esc(path.name)}</div>
           <div class="skill-effect">${esc(path.effect || '')}</div>
           <div class="skill-style">${esc(path.style || '')}</div>
         </article>`
      : '';
    el.innerHTML = `
      <div class="character-preview">
        <div class="character-avatar" aria-hidden="true">${esc(c.name.slice(0, 1))}</div>
        <div class="character-heading">
          <div class="character-name">${esc(c.name)}</div>
          <div class="character-meta">${esc(c.faction || '')} · ${esc(c.gender || '')} · 体力 ${esc(c.hp)}</div>
        </div>
      </div>
      <div class="skill-grid">
        ${skillCard('秘技', c.secret)}
        ${skillCard('天赋', c.talent)}
        ${pathCard}
      </div>
    `;
  };

  UI.options = function () {
    const seedRaw = document.getElementById('seed').value;
    const seed = seedRaw === '' ? undefined : Number(seedRaw);
    const fieldMode = document.getElementById('fieldMode').value;
    const charId = document.getElementById('character').value;
    return {
      playerCount: Number(document.getElementById('playerCount').value) || 3,
      characterId: charId,
      pathId: charId.indexOf('trailblazer') === 0 ? document.getElementById('path').value : undefined,
      seed,
      verbose: false,
      fullDeck: true,
      enableEvents: fieldMode === 'random'
    };
  };

  UI.start = function () {
    try {
      const state = SR.sim.runGame(UI.options());
      UI.current = state;
      UI.render(state);
      console.log('game complete', state.winner);
    } catch (err) {
      console.error(err);
      document.getElementById('summary').hidden = false;
      document.getElementById('summaryContent').innerHTML =
        `<div class="summary-title" style="color:#ff9aa2">运行出错</div><pre class="meta">${U.escapeHtml(err && err.stack || err)}</pre>`;
    }
  };

  UI.batch = function () {
    const opts = UI.options();
    const result = SR.sim.runMany(20, opts);
    const rows = Object.keys(result.tally).sort().map(k =>
      `<tr><td>${U.escapeHtml(UI.factionLabel(k))}</td><td>${result.tally[k]}</td></tr>`
    ).join('');
    document.getElementById('summary').hidden = false;
    document.getElementById('summaryContent').innerHTML = `
      <div class="summary-title">20 局批量结果</div>
      <div class="summary-meta">平均轮次：${result.avgRounds.toFixed(1)}　错误：${result.games.filter(g => g.error).length}</div>
      <table class="batch-table"><thead><tr><th>结果</th><th>局数</th></tr></thead><tbody>${rows}</tbody></table>
    `;
    document.getElementById('players').innerHTML = '';
    document.getElementById('log').innerHTML = '';
  };

  UI.identityText = function (state, p) {
    if (state.over || p.isNavigator || !p.alive) return p.identityName;
    return '身份未公开';
  };

  UI.render = function (state) {
    const summary = document.getElementById('summary');
    summary.hidden = false;
    const winner = state.winner;
    let title = '平局';
    if (winner && winner.special === 'evernight') {
      title = `救世主：${(winner.names && winner.names[0]) || '未知'}`;
    } else if (winner && winner.faction !== 'draw') {
      title = `${UI.factionLabel(winner.faction)}获胜`;
    }
    const memberNames = winner && winner.names ? winner.names.join('、') : '—';
    const human = G.getPlayer(state, state.humanId);
    const aliveNames = state.players.filter(p => p.alive).map(p => p.name).join('、') || '无';
    const summaryTitle = state.humanDied && state.over ? `静默模拟结果：${title}` : title;
    document.getElementById('summaryContent').innerHTML = `
      <div class="summary-title">${U.escapeHtml(summaryTitle)}</div>
      <div class="summary-meta">轮次：${state.round}　获胜角色：${U.escapeHtml(memberNames)}　日志：${state.log.length} 条</div>
      <div class="summary-meta">你的身份：${U.escapeHtml(human ? human.identityName : '—')}　存活角色：${U.escapeHtml(aliveNames)}</div>
      ${state.humanDied ? '<div class="summary-meta">你已阵亡；后续对局已静默模拟至分出胜负，过程不展示。</div>' : ''}
    `;

    const playersEl = document.getElementById('players');
    playersEl.innerHTML = state.players.map(p => {
      const hpPct = Math.max(0, Math.min(100, p.maxHp ? p.hp / p.maxHp * 100 : 0));
      const equips = ['weapon', 'armor', 'vehicle']
        .map(slot => p.equipment[slot])
        .filter(Boolean)
        .map(c => `<span class="tag">${U.escapeHtml(c.name)}</span>`)
        .join('') || '<span class="meta">无装备</span>';
      const statuses = p.statuses.length
        ? p.statuses.map(s => `<span class="tag status">${U.escapeHtml(s.name || s.id)}</span>`).join('')
        : '';
      const hand = p.id === state.humanId
        ? p.hand.map(c => `<span class="tag">${U.escapeHtml(c.name)} ${U.escapeHtml(c.element)}${U.escapeHtml(c.rank)}</span>`).join('')
        : `<span class="meta">手牌 ${p.hand.length} 张</span>`;
      return `
        <article class="player-card ${p.alive ? '' : 'dead'} ${p.id === state.humanId ? 'human' : ''}">
          <div class="player-head">
            <span class="player-name">${U.escapeHtml(p.name)}</span>
            <span class="player-id">${U.escapeHtml(p.id)} · 座位 ${p.seat + 1}</span>
          </div>
          <div class="meta">
            <span class="tag ${p.isNavigator ? 'navigator' : ''}">${U.escapeHtml(UI.identityText(state, p))}</span>
            ${p.alive ? '' : '<span class="tag">已阵亡</span>'}
          </div>
          <div class="hp-row">
            <span class="meta">${p.hp}/${p.maxHp}</span>
            <span class="hp-bar"><span class="hp-fill" style="width:${hpPct}%"></span></span>
            <span class="meta">护盾 ${p.shield || 0}</span>
          </div>
          <div class="equip-line">${equips}</div>
          <div class="meta" style="margin-top:6px">${statuses}</div>
          <div class="meta" style="margin-top:6px">${hand}</div>
        </article>
      `;
    }).join('');

    const logEl = document.getElementById('log');
    const visibleLog = state.humanDied && state.humanDeathLogIndex != null
      ? state.log.slice(0, state.humanDeathLogIndex)
      : state.log;
    const lines = visibleLog.map(e => {
      let cls = 'log-line';
      if (/受到|伤害|阵亡|濒死/.test(e.text)) cls += ' log-damage';
      if (/回复|救回/.test(e.text)) cls += ' log-heal';
      if (/胜负已分|获胜|平局/.test(e.text)) cls += ' log-win';
      return `<div class="${cls}"><span class="log-round">R${e.round}</span> ${U.escapeHtml(e.text)}</div>`;
    }).join('');
    // 玩家阵亡后仍会运行完整模拟；日志区只补一行最终结果，不展开后续过程。
    const finalNote = state.humanDied && state.over
      ? `<div class="log-line log-win"><span class="log-round">R${state.round}</span> 静默模拟结果：${U.escapeHtml(title)}${memberNames && memberNames !== '—' ? '（' + U.escapeHtml(memberNames) + '）' : ''}；你的身份：${U.escapeHtml(human ? human.identityName : '—')}；存活角色：${U.escapeHtml(aliveNames)}；总回合数：${state.round}</div>`
      : '';
    logEl.innerHTML = (lines + finalNote) || '<div class="meta">暂无日志</div>';
    logEl.scrollTop = logEl.scrollHeight;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
