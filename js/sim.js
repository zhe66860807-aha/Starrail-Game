/* 星穹铁道身份局 - 无界面模拟器 / 冒烟测试 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const S = SR.sim = SR.sim || {};
  const G = SR.game;

  S.phase1DeckFilter = function (card) {
    if (!card) return false;
    if (card.type === 'basic' || card.type === 'equip') return true;
    return card.type === 'trick' && card.subtype === '延时';
  };

  S.runGame = function (options) {
    const opts = Object.assign({}, options || {});
    if (!opts.deckFilter && !opts.fullDeck) opts.deckFilter = S.phase1DeckFilter;
    return G.runGame(opts);
  };

  S.snapshot = function (state) {
    const copy = JSON.parse(JSON.stringify(state, (k, v) => k === 'rng' ? undefined : v));
    copy.rngState = state.rng && state.rng.getState ? state.rng.getState() : null;
    return copy;
  };

  S.restore = function (snapshot) {
    // 快照可能被多次重放；必须复制，不能把传入对象本身当作新状态消耗。
    const state = typeof snapshot === 'string' ? JSON.parse(snapshot) : JSON.parse(JSON.stringify(snapshot));
    const rngState = state.rngState;
    delete state.rngState;
    state.rng = SR.util.rng(state.seed == null ? 0 : state.seed);
    if (rngState != null) state.rng.setState(rngState);
    return state;
  };

  S.saveGame = function (state, key) {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key || 'sr_game_save_v1', JSON.stringify(S.snapshot(state)));
    return true;
  };

  S.loadGame = function (key) {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key || 'sr_game_save_v1');
    return raw ? S.restore(raw) : null;
  };

  S.runMany = function (count, options) {
    const games = [];
    const tally = {};
    let totalRounds = 0;
    for (let i = 0; i < count; i++) {
      const seed = (options && options.seed != null) ? options.seed + i : (1000 + i * 7919);
      let state;
      try {
        state = S.runGame(Object.assign({}, options, { seed, verbose: false }));
      } catch (err) {
        games.push({ seed, error: String(err && err.stack || err) });
        tally.error = (tally.error || 0) + 1;
        continue;
      }
      const faction = state.winner ? state.winner.faction : 'none';
      tally[faction] = (tally[faction] || 0) + 1;
      totalRounds += state.round;
      games.push({
        seed,
        faction,
        round: state.round,
        winner: state.winner,
        logCount: state.log.length,
        players: state.players.map(p => ({
          id: p.id,
          name: p.name,
          characterId: p.characterId,
          identity: p.identity,
          hp: p.hp,
          maxHp: p.maxHp,
          alive: p.alive
        }))
      });
    }
    return {
      count,
      tally,
      avgRounds: count ? totalRounds / count : 0,
      games
    };
  };

  S.smoke = function () {
    const r = S.runMany(20, { playerCount: 3 });
    console.log('Phase 1 smoke:', JSON.stringify(r.tally), 'avgRounds=', r.avgRounds.toFixed(1));
    const errors = r.games.filter(g => g.error);
    if (errors.length) {
      console.log('Errors:', errors.slice(0, 3));
      throw new Error('smoke failed');
    }
    return r;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
