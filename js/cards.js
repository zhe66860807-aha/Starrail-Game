/* 星穹铁道身份局 - 牌堆与牌面 */
(function (root) {
  const SR = root.SR = root.SR || {};
  const C = SR.cards = SR.cards || {};
  const U = SR.util;

  C.ELEMENTS = ['物理', '火', '冰', '雷', '风', '量子', '虚数'];
  C.RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  C.WEAPON_RANGE = {
    '银河球棒': 1,
    '菇菇嘎嘎': 2,
    '击云': 2,
    '伊甸之星': 3,
    '高周波电锯': 3,
    '侵晨': 3,
    '斩首行动': 3,
    '火力风暴潮': 3,
    '反重力皮靴': 2
  };

  C.isBasic = (card) => card && card.type === 'basic';
  C.isTrick = (card) => card && card.type === 'trick';
  C.isEquip = (card) => card && card.type === 'equip';
  C.isDelayed = (card) => C.isTrick(card) && card.subtype === '延时';
  C.isRealAnDa = (card) => card && card.name === '再见安打' && card.type === 'basic';

  C.getSlot = function (card) {
    if (!C.isEquip(card)) return null;
    if (card.subtype.indexOf('武器') === 0) return 'weapon';
    if (card.subtype === '防具') return 'armor';
    if (card.subtype.indexOf('载具') >= 0) return 'vehicle';
    return null;
  };

  C.getWeaponRange = function (card) {
    if (!card || !C.isEquip(card)) return 0;
    return C.WEAPON_RANGE[card.name] || 0;
  };

  C.cardText = function (card) {
    if (!card) return '';
    return `【${card.name}】${card.element || ''}${card.rank || ''}`;
  };

  // 每套牌的张数微调：总数仍为 91 张，元素+点数组合仍各用一次。
  C.SET_ADJUST = {
    remove: { '星核猎手': 1, '随蝴蝶一起消散吧': 1 },
    duplicate: { '帝弓光矢': 1, '同谐共鸣': 1 }
  };

  C.makeDeck = function (data, rng, filter) {
    const setCount = (data.deck && data.deck.setCount) || 2;
    const allTemplates = data.cards;
    const templates = filter ? allTemplates.filter(filter) : allTemplates;
    if (!filter && templates.length !== 91) throw new Error('deck data must contain 91 templates');
    if (filter && !templates.length) throw new Error('deck filter removed every card');
    const all = [];
    for (let set = 1; set <= setCount; set++) {
      let setTemplates = templates.slice();
      if (!filter) {
        for (const name of Object.keys(C.SET_ADJUST.remove)) {
          for (let i = 0; i < C.SET_ADJUST.remove[name]; i++) C.removeOneByName(setTemplates, name);
        }
        for (const name of Object.keys(C.SET_ADJUST.duplicate)) {
          const src = setTemplates.find(t => t.name === name);
          if (!src) throw new Error('deck adjust source missing: ' + name);
          for (let i = 0; i < C.SET_ADJUST.duplicate[name]; i++) setTemplates.push(src);
        }
      }
      if (!filter && setTemplates.length !== 91) throw new Error('adjusted deck set must contain 91 cards');
      const pairs = [];
      for (const e of C.ELEMENTS) {
        for (const r of C.RANKS) pairs.push({ element: e, rank: r });
      }
      const shuffledPairs = U.shuffle(pairs, rng);
      for (let i = 0; i < setTemplates.length; i++) {
        const t = setTemplates[i];
        const pair = shuffledPairs[i];
        all.push({
          uid: `S${set}-C${String(i + 1).padStart(3, '0')}`,
          setId: set,
          slotIndex: i + 1,
          templateId: t.id,
          name: t.name,
          type: t.type,
          subtype: t.subtype,
          effect: t.effect,
          polarity: t.polarity || null,
          targetScope: t.targetScope || null,
          element: pair.element,
          rank: pair.rank,
          zone: 'deck',
          ownerId: null,
          flags: {}
        });
      }
    }
    return U.shuffle(all, rng);
  };

  C.findByName = function (cards, name) {
    return (cards || []).filter(c => c && c.name === name);
  };

  C.hasName = function (cards, name) {
    return (cards || []).some(c => c && c.name === name);
  };

  C.removeOneByName = function (cards, name) {
    const i = (cards || []).findIndex(c => c && c.name === name);
    if (i < 0) return null;
    return cards.splice(i, 1)[0];
  };

  C.isAttackCard = function (card) {
    return card && (card.name === '再见安打' || card.name === '闪身步');
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
