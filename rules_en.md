# Astral Express Wonder Night · Rulebook

> The core gameplay follows the standard hidden-role framework, with names and flavor reskinned to Honkai: Star Rail.
> One deck = 91 cards = 7 elements × ranks A–K. A game uses two decks, 182 cards total. Within each deck every element+rank combination appears once; duplicates are allowed between the two decks.

---

## 1. Deck Structure

### 1. Elements (equivalent to suits)

Physical, Fire, Ice, Lightning, Wind, Quantum, Imaginary — 7 elements. Each element has 13 cards per deck, 26 across two decks.

### 2. Ranks

A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K — 13 ranks.

### 3. How to Read a Judgment

When a judgment is required, reveal the top card of the deck and **read both its element and its rank**. Reveal it to all players first; after resolution, the card goes to the discard pile.

| Judgment Source | Trigger Condition |
|---|---|
| Yellow-Purple Shirt | Element is one of **Physical / Fire / Wind** → counts as playing [Sidestep] |
| Memory Freeze | [Negative · Single (self or others, judgment zone)] Element is one of **Ice / Quantum / Physical / Wind** → skip the play phase |
| Final Verdict | [Negative · Single (self or others, judgment zone)] **Judged when the attached player starts their action**; element is **Lightning** → the target takes 3 lightning damage (sourceless, un-dodgeable), then the card goes directly to the discard pile and no longer transfers; otherwise it transfers |
| Anti-Grav Boots | Element is one of **Physical / Ice / Imaginary / Quantum** → the round action-order effect triggers |
| Retaliation Armor | Rank is one of **2 / 4 / 6 / 8 / 10** → retaliation triggers |

### 4. Card Categories

| Category | Contains | Notes |
|---|---|---|
| **Character cards** | Trailblazer (Male/Female), Dan Heng, March 7th, Himeko, Welt Yang, Sunday | 7 cards total; the player and each other character use one |
| **Identity cards** | Navigator, Nameless, Voidranger, Traitor | Dealt at random; only the Navigator is public |
| **Basic cards** | Farewell Hit, Sidestep, Medicine King, Trick Snack | The "basic cards" referenced by loot |
| **Equipment cards** | All weapons, armor, vehicles | Equipment cards are also **rare cards** and **relics** |
| **Trick cards** | All remaining cards (including loot and delayed tricks) | IX Mechanism and Final Verdict are **rare tricks** |

> In short: **relic = equipment card**; **rare card = equipment card + rare trick**.

> Note: the element+rank ↔ card-face mapping for each deck is **randomized independently before every game** and fixed for that game. The two decks are assigned separately, shuffled, then combined. Card faces, counts, and effects are fixed; the rulebook does not list fixed element/rank assignments.
>
> **Per-deck count adjustments**: Stellaron Hunter and Fade with Butterflies have 2 copies each; Reignbow Arrow and Harmony Resonance have 2 copies each. All other card counts are unchanged; each deck still has 91 cards and each element+rank combination is still used once.

---

## 2. Setup

1. **Choose player count**: 3 / 4 / 5 / 6.
2. **Choose a character card**: the player picks one of the 7 character cards — Trailblazer (Male), Trailblazer (Female), Dan Heng, March 7th, Himeko, Welt Yang, Sunday.
3. **Draw other characters**: randomly draw (player count − 1) cards from the remaining character cards, without duplicates. **The male and female Trailblazers cannot both be present**: if the player picks one, the other is removed from the pool; if the player does not pick a Trailblazer, **one of the two is chosen at random** for the pool, then the remaining character cards fill the rest.
4. **Other characters' Paths**: if another character is chosen as the Trailblazer, it is **randomly assigned one Path** at setup (Destruction / Preservation / Harmony / Remembrance / Elation), fixed for the game.
5. **Assign identities**: shuffle all identity cards and **deal one to each player at random (including the human player)**. **Except for the Navigator, identities are never public**; each player can only see their own identity.
6. **HP adjustment**: the character chosen as the **Navigator** gains +1 max HP (including Himeko, 5 → 6); starting HP equals the new maximum.
7. **Deal cards**: each player draws 4 starting hand cards; the deck is shuffled; **the Navigator acts first**.

| Total players | Navigator | Nameless | Voidranger | Traitor |
|---|---:|---:|---:|---:|
| 3 | 1 | 0 | 1 | 1 |
| 4 | 1 | 1 | 1 | 1 |
| 5 | 1 | 1 | 2 | 1 |
| 6 | 1 | 2 | 2 | 1 |

---

## 3. Turn Flow and Time Units

**Time units:**
- **Action**: one character's complete action from the judgment phase through the discard phase.
- **Turn (character property)**: from the start of that character's action until just before their next action. It includes other characters' actions. **End of turn = just before that character's next action starts**; "this turn" effects expire at that point. Each character's turn is their own property and does not interfere with others.
- **Round (global property)**: from the Navigator's action until just before the Navigator's next action.
- **Initial action order**: starting with the Navigator, proceeding clockwise.

**The four phases of an action:**

1. **Judgment phase**: Memory Freeze and Final Verdict have been moved to "when starting an action"; this phase handles only other delayed tricks (see below).
2. **Draw phase**: draw 2 cards; the Navigator's first turn also draws 2 normally.
3. **Play phase**: you may use any number of cards, but [Farewell Hit] is limited to once per turn. Galactic Bat allows unlimited use; High-Freq Chainsaw still counts as one use; Eden Star's extra hit, Decapitation's extra targets, and the hit forced by Elation Trick do not count; Himeko's skill does not count as a hit use.
4. **Discard phase**: after your action ends, discard hand cards until your hand count is ≤ your hand limit (current HP + permanent hand-limit modifier, minimum 0); you choose which cards to discard. **Sunday has no special "HP − 1" rule.**

**Delayed tricks and IX Mechanism judgments:**

- **IX Mechanism prompt**: both judgment prompts and normal trick prompts start from the Navigator and proceed in the current round's action order, asking each player who has an [IX Mechanism] in hand whether to use it; players without [IX Mechanism] are not asked. The player who initiated a trick does not participate in the prompt for that trick and cannot use their own [IX Mechanism] to cancel a trick they just played. If someone uses one, an IX Mechanism chain begins; after the chain resolves, if any IX Mechanism remains uncanceled, that judgment is skipped entirely (no judgment card is revealed). All used IX Mechanisms go to the discard pile.
- **Chain**: an IX Mechanism can cancel another IX Mechanism; the same judgment can form a chain, and the final uncanceled IX Mechanism decides whether that judgment is skipped.
- **Memory Freeze**: the attached player judges when starting their action (after all "start of action" effects and after Final Verdict); if the element is [Ice], [Quantum], [Physical], or [Wind], the target skips their play phase. The judgment card goes to the discard pile. If skipped by IX Mechanism before judgment, this judgment is skipped and the [Memory Freeze] remains in the judgment zone.
- **Final Verdict**: the attached player makes the first judgment when starting their action (after all "start of action" effects and before Memory Freeze); if the element is [Lightning], the target takes 3 lightning damage (sourceless, un-dodgeable), then the card goes directly to the discard pile and no longer transfers; only if it does not trigger does it transfer to the next targetable character in action order and continue judging when they start their action.
  - If someone uses IX Mechanism when the card is played, [Final Verdict] goes directly to the discard pile.
  - If someone uses IX Mechanism before judgment, only this judgment is skipped; [Final Verdict] does not disappear and then transfers.

**Before each game (before round 1)**: generate two decks of 91 cards each; each deck independently randomizes the mapping between "element+rank" and card names, then each is shuffled and combined into a 182-card deck. The mapping is **fixed for the game**; each deck uses each of its 91 element+rank combinations once, and duplicates between decks are allowed. Players can only see the current element/rank of cards they are entitled to see.

**Deck and discard pile (standard hidden-role mechanics)**: draw from the top of the deck, judge, and reveal; used, played, and discarded cards go to the discard pile (face up, public); equipment cards go to the equipment zone, delayed tricks go to the judgment zone. When drawing/judging/revealing/loot-searching requires N cards or a specific type and the deck is insufficient or lacks the requirement, first return all discards to the deck and shuffle, then continue; if still insufficient, take what is actually available.

**Dying resolution**: HP can go below zero; HP ≤ 0 means dying. **Starting from the Navigator and proceeding in the current round's action order**, each player is asked whether to rescue; a player who chooses to rescue may play multiple [Medicine King] or [Trick Snack] cards in a row, each recovering 1 HP; reaching 1 HP immediately ends dying. If no one rescues, the character is eliminated and their identity card is revealed.

**Rescue cost**: after being rescued, **max HP −1** immediately (minimum 1), current HP becomes 1; **one dying event deducts only 1 max HP**. If the same damage resolution causes another dying state through nested/AoE effects, it still deducts only 1; separate damage events are counted separately. **A character whose max HP is already 1 cannot be rescued again**; the next dying state results in immediate elimination with no rescue prompt.

---

## 4. Distance and Attack Range

- The equipment zone has **3 slots**: weapon, armor, vehicle (+1 vehicle and −1 vehicle share the vehicle slot; one card per slot).
- Seats are arranged in a circle; adjacent distance is 1, and the maximum is ⌊player count / 2⌋.
- **+1 vehicle**: other players calculate distance to you as +1.
- **−1 vehicle**: you calculate distance to other players as −1.
- **Weapon +n** adds n to the base attack range of 1; Himeko's talent +1 stacks on top; actual attack range = 1 + weapon n + other modifiers.

| Weapon | Range Bonus |
|---|---|
| Galactic Bat | +1 |
| Gugu Gaga / Cloud-Piercer / Anti-Grav Boots | +2 |
| Star of Eden / High-Freq Chainsaw / Daybreak / Firestorm | +3 |
| Decapitation | +3 |

The base attack range is 1, so with Galactic Bat the actual range is 2, and with Decapitation it is 4.

---

## 5. Equipment Cards (18 Cards)

| Card | Type | Effect |
|---|---|---|
| Galactic Bat | Weapon +1 | During your play phase, you may use any number of [Farewell Hit] |
| Gugu Gaga | Weapon +2 | When you target a character of the opposite gender with [Farewell Hit], you may make them choose: discard one hand card, or let you draw one card |
| Cloud-Piercer | Weapon +2 | Locked skill. When using [Farewell Hit], ignore the target's armor and shield |
| Star of Eden | Weapon +3 | After [Farewell Hit] is canceled by [Sidestep], you may use another [Farewell Hit] on the same target; this extra use does not count toward the per-turn limit |
| High-Freq Chainsaw | Weapon +3 | You may use or play two hand cards as a [Farewell Hit]; this card still counts toward the per-turn use limit; this virtual hit deals D1 physical damage, can be canceled by [Sidestep], and does not trigger effects that only recognize real [Farewell Hit] cards |
| Daybreak | Weapon +3 | After [Farewell Hit] is canceled by Sidestep, you may discard two cards to make it still deal damage |
| Decapitation | Weapon +3 | When using [Farewell Hit] as your last hand card, you may designate up to two extra targets; each extra target takes 1 D1 damage and can dodge separately; this does not consume extra uses |
| Firestorm | Weapon +3 | Locked skill. When the target has no hand cards, your [Farewell Hit] deals +1 damage; only applies to real [Farewell Hit] cards you initiate, and stacks with Trick Snack / Destruction |
| Anti-Grav Boots | Weapon +2 | At the start of the round, if you hold this equipment, judge: triggers on Physical / Ice / Imaginary / Quantum; on failure you act in normal order. When triggered, you have only one action opportunity this round. Before any character is about to act (including the holder's normal action timing), ask the holder whether to insert before that character; after choosing to act, they act immediately, are no longer asked this round, cannot act again, and skip their normal timing. If the normal timing has passed without acting, continue asking before each subsequent character acts; if all other characters have acted and no choice was made, stop asking and the holder acts last this round. If already the last actor, act directly at the normal timing. Only this round's action order changes; seating, distance, and attack range do not. If the equipment is lost, stop asking |
| Absolute Heat | Armor | Locked skill. Each damage you take is at most 1; when you lose this equipment, recover 1 HP |
| Yellow-Purple Shirt | Armor | When you need to play [Sidestep], you may judge: on Physical / Fire / Wind, it counts as playing [Sidestep] |
| Hard Armor | Armor | Locked skill. [Farewell Hit] of the Lightning / Wind / Physical elements is ineffective against you |
| Light Shield | Armor | When you take damage, you may prevent it and discard two of your cards instead; cannot activate with fewer than two cards |
| Retaliation Armor | Armor | When you take damage, you may judge (once per turn): if the rank is 2/4/6/8/10 and this damage actually reduces HP, first complete dying/rescue/elimination (or Firechase conversion); if a winner is already determined immediately after elimination, no retaliation occurs; if rescued or no winner is produced, the damage source (must be a character) then takes damage equal to the HP loss (un-dodgeable); this cannot trigger any chain reactions |
| Warp Engine ×2 | +1 Vehicle | Other characters calculate distance to you as +1 |
| Phase Dash ×2 | −1 Vehicle | You calculate distance to other characters as −1 |

---

## 6. Loot (5 Cards)

The [Loot] series replaces the old "Ex Nihilo" card; all cards are taken **from the deck**, not created from nothing.

| Card | Effect |
|---|---|
| Common Loot | [Positive · Self] Gain 1 random basic card from the deck |
| Refined Loot | [Positive · Self] Reveal the top 3 basic cards of the deck; choose 2 to gain |
| Precious Loot | [Positive · Self] Reveal the top 3 cards of the deck (including rare cards); choose 2 to gain |
| Ornate Loot | [Positive · Self] Reveal the top 3 cards of the deck; choose 1 to gain, and gain 1 relic |
| Priceless Loot | [Positive · Self] Search the deck for 3 trick cards; choose 1 to gain, and gain 1 relic |

- If the deck has insufficient cards, or lacks the relic/trick type required by the loot, first return all discards to the drawable deck and shuffle, then search; if still insufficient, take what is actually available.
- "Gain a relic" = search the deck for an equipment card and put it into your equipment zone (if the zone is full, put it into your hand instead).

---

## 7. Character Cards

| Character | HP | Technique | Talent |
|---|---:|---|---|
| Trailblazer (Male/Female) | 4 | **Path Choice**: before the game, choose one of the five Paths; it lasts the whole game and cannot be changed | **Stellaron Resonance**: after dealing damage for the first time each turn, draw one card |
| Dan Heng | 4 | **Cloud Knights Spearplay**: after [Farewell Hit] deals damage (shield absorption counts), if the target has hand cards, you must randomly discard one of the target's hand cards; if none, discard none | **Dragon's Roar**: locked skill; you cannot be the target of [Path Collision] |
| March 7th | 3 | **Six-Phase Ice Bow**: up to twice per turn, discard one card to give a character 1 shield; shield absorption still counts as that character taking damage | **Full of Energy**: after you take damage, draw one card |
| Himeko | 5 | **Trailblazing Star**: [once per turn] discard two cards to deal 1 damage to another character within attack range; the target may play [Sidestep] to cancel; this still counts toward the per-turn [Farewell Hit] use limit; this virtual hit is D2 and does not trigger effects that only recognize real [Farewell Hit] cards | **Press the Advantage**: locked skill; attack range +1 (stacks with weapon range) |
| Welt Yang | 4 | **Gravity Collapse**: at the start of each turn, choose another character; until the start of their next action they cannot use [Sidestep] and gain [Weightless] | **Simulated Black Hole**: limited skill; when a character is dying, first ask for rescue normally; if no one rescues, you may discard all hand cards and equipped equipment cards (judgment zone unaffected) to restore them to 2 HP; once per game |
| Sunday | 4 | **Grace of Order**: at turn start, you may make a character draw one card (3 times per game) | **Gate of Paradise**: locked skill; the first time a character recovers HP each round, you draw one card |

**Character genders**: Trailblazer (Male) is male and Trailblazer (Female) is female, as chosen by the player; Himeko and March 7th are female; Dan Heng, Welt Yang, and Sunday are male.

**Shield**: absorbs an equal amount of damage and is not HP. Shields granted by March 7th's skill **last 2 rounds independently per layer and cap at 2 points**; when gained again, if below the cap add a new layer; if at the cap, refresh only the earliest-expiring layer. **When a shield absorbs damage, the character is still considered to have taken damage**; damage prevented by [Light Shield], nullified by [Hard Armor], or reduced to 0 does not count as taking damage.

---

## 8. The Trailblazer's Five Paths (Path Choice)

**Choose one before the game; it lasts the whole game and cannot be changed.**

| Path | Effect | Role |
|---|---|---|
| **Destruction** | The first [Farewell Hit] you use each turn deals +1 damage; **after this effect triggers**, you take +1 damage this turn | Burst-oriented, but you suffer backlash after dealing bonus damage |
| **Preservation** | The first damage you take each turn is −1; **after this effect triggers**, the damage you deal this turn is −1 | Defensive; output drops after being hit, suited to holding the line |
| **Harmony** | At the start of each turn, you may discard one card; if you do, you may use one extra [Farewell Hit] this turn | Trade cards for tempo; strongest with a full hand |
| **Remembrance** | The first time you become the target of a negative trick each turn, you may discard one card; a single-target negative trick is canceled entirely; an AoE negative trick only lets you avoid responding and its effects | Pay cards to answer tricks; strong against trick decks but drains your hand |
| **Elation** | After you deal damage for the first time each turn, judge: A–4 draw one card; 5–10 discard one hand card, or take 1 sourceless damage if you have no hand cards; J–K recover 1 HP | A judgment gamble; high risk, high reward |

Balance notes:

- Destruction's bonus damage and backlash are **bound to the same trigger**: if you do not act there is no cost, but after acting you are more fragile that turn.
- Preservation works similarly; after being hit your output drops that turn, preventing pure turtling.
- Harmony turns an extra attack into "discard a card for tempo"; you cannot get it for free when short on cards.
- Remembrance changed from free immunity to a paid cancel, only against negative tricks; single-target cancels the whole trick, AoE only exempts yourself.
- Elation is a judgment gamble: draw one / discard one (or take 1 damage with no hand cards) / recover 1; it no longer overlaps with the Trailblazer talent [Stellaron Resonance]'s fixed draw.

---

## 9. Other Tricks

| Card | Effect |
|---|---|
| Fade with Butterflies | [Negative · Single (self or others)] Discard one hand card or one equipment-zone card from a character. Choose the target after use; if the target has both hand cards and equipment, then choose hand or equipment: a hand card is lost at random; an equipment card is chosen by the user |
| Stellaron Hunter | [Negative · Single (others only)] Gain one hand card or one equipment-zone card from another character within distance 1. Choose the target after use; if the target has both hand cards and equipment, then choose hand or equipment: a hand card is gained at random; an equipment card is chosen by the user |
| Path Collision | [Negative · Single (others only)] Take turns playing [Farewell Hit] with another character; the target plays first, then you. Hits played this way only satisfy the requirement, do not resolve attack damage, and do not count toward the per-turn use limit; the first player who chooses not to play or cannot play takes 1 damage |
| Swarm Disaster | [Negative · AoE (all other characters)] Starting from the character after the user, resolve in the current round's action order; all other characters must play [Farewell Hit] or take 1 damage |
| Reignbow Arrow | [Negative · AoE (all other characters)] Starting from the character after the user, resolve in the current round's action order; all other characters must play [Sidestep] or take 1 damage |
| Harmony Resonance | [Positive · AoE (all characters)] All characters recover 1 HP (up to their maximum) |
| IX Mechanism | [Positive · Special (trick/judgment)] Cancel the effect of a trick card played by another character; cannot cancel a trick you just played; may be used before each delayed-trick judgment to skip that judgment (see judgment rules) |
| Elation Trick | [Negative · Two other characters] Make one other character use a [Farewell Hit] on another other character; if that character does not use [Farewell Hit], they take 1 sourceless, un-dodgeable damage; this use does not count toward that character's per-turn limit |
| Beauty Knight Cameo | [Positive · AoE (all characters)] Starting from the user, in the current round's action order, reveal cards equal to the number of surviving characters; each player chooses 1 in turn |
| Dream Pool | [Positive · Self] May only be used on yourself at the start of your turn; at most one per turn; after use, judge immediately: odd rank takes effect normally, entering [Memory Is the Prologue of a Dream], skipping this action with HP unchanged; even rank fails. The judgment card and [Dream Pool] both go to the discard pile. At the start of your next turn, if below max HP recover 1 HP first, then remove the state; can be canceled by another player's IX Mechanism; Dream Pool players can also receive [Eternal Recurrence] and convert to [Firechase] |
| Memory Freeze | [Negative · Single (self or others, judgment zone)] Delayed trick. The attached player judges when starting an action (after all start effects and after Final Verdict); on Ice / Quantum / Physical / Wind, skip the play phase; the judgment card goes to the discard pile; if skipped by IX Mechanism before judgment, this judgment is skipped and the card remains in the judgment zone |
| Final Verdict | [Negative · Single (self or others, judgment zone)] Delayed trick. The attached player makes the first judgment when starting an action (after all start effects and before Memory Freeze); on Lightning, take 3 lightning damage (sourceless, un-dodgeable), then the card goes directly to the discard pile and no longer transfers; otherwise it transfers to the next targetable character and judges at their action start; if canceled by IX Mechanism when played it goes to the discard pile; if skipped by IX Mechanism before judgment, this judgment is skipped and it then transfers; if the target dies before triggering, it also transfers |

**Trick targeting rules**: the Loot series and [Dream Pool] can only target yourself; other single-target tricks can target yourself or others, but [Stellaron Hunter], [Path Collision], and [Elation Trick] cannot target yourself. Trick effects are labeled [Positive/Negative · Target] before their text.

---

## 10. Basic Cards

| Card | Effect |
|---|---|
| Farewell Hit | Once per play phase, deal 1 damage to another character within attack range; the target may play [Sidestep] to cancel |
| Sidestep | Play only in response to [Farewell Hit] to cancel one [Farewell Hit]; cannot be actively used during the play phase |
| Medicine King | During your play phase (your turn), use on yourself to recover 1 HP (cannot be used at full HP); when a character is dying, use on them to recover 1 HP |
| Trick Snack | During your play phase (your turn), use on yourself: the next [Farewell Hit] this turn deals +1 damage (once per turn; only the next hit; only real [Farewell Hit] cards you initiate); when a character is dying, use on them to recover 1 HP, in which case it grants no damage bonus |

---

## 11. Victory Conditions

- **Navigator faction wins**: the Navigator is alive and all Voidrangers and Traitors are eliminated; when the Navigator wins, all Nameless also win.
- **Voidrangers win**: the Navigator is dead and the Traitor is not the sole survivor (regardless of whether any Voidranger is alive).
- **Traitor wins**: the Navigator is dead and the Traitor is the sole survivor.
- The Navigator's death immediately ends the game and decides victory.

### Elimination and Rewards

- **Eliminated players**: cannot act, cannot be targeted or affected, do not count as "all players", lose all hand cards, equipment-zone and judgment-zone cards and all effects ([Final Verdict] in the judgment zone is the exception and transfers to the next character), and reveal their identity card; if their identity's faction eventually wins, that player also wins.
- **Defeat a Voidranger**: when the damage source is that player and the Voidranger is eliminated, that player immediately draws 3 cards.
- **Navigator defeats a Nameless**: the Navigator immediately discards all hand cards and equipment-zone cards.
- **Final statistics**: winning faction, winning characters (including eliminated characters who win with their faction), round count, and game count.

### Handling After the Player Dies

- If the player dies but **victory has not been decided** (for example, the player is a Voidranger and other Voidrangers are still alive), the system **automatically simulates the rest of the game until a winner is decided**.
- **The simulation is not shown**: no card plays and no other characters' hands or actions are shown.
- After it ends, **only the result is shown**: winning side, player identity, surviving characters, total rounds.
- The simulation uses exactly the same rules as a normal game and does not read any hidden identities or hands.
- The round cap is 100; exceeding it is a draw.

---

## 12. Field Effects

- Round 1 has no field effect. Starting from round 2, one field effect is drawn before each round; all 10 effects are equally likely and cannot repeat the previous round's effect.
- A round starts when the Navigator acts and ends before the Navigator's next action. Field effects apply to all surviving players and are public; after death the effect state is removed; silent simulation also applies them.
- Round sequence: previous effect's end-of-round resolution/clear → draw and announce the new effect → effect start → Anti-Grav Boots judgment → Navigator's action begins.
- Initial action order: starting with the Navigator, clockwise.
- IX Mechanism: field effects can only be removed by the player themselves using their own IX Mechanism at the specified timing; normal trick cards can be canceled by any player other than the initiator using IX Mechanism; the initiator cannot use their own IX Mechanism to cancel a trick they just played; rules for use before delayed-trick judgment are in the judgment section.
- Irremovable: cannot be canceled/removed by any active means; highest priority. Whether specific damage can be prevented depends on damage type: dot damage can be prevented; end-of-round Mara Snack damage cannot.
- Sourceless un-dodgeable damage: resolved per the damage flow; does not trigger [Retaliation Armor] retaliation or [Mara] healing; Final Verdict's 3 lightning damage is the same. For which shields/damage reduction/prevention apply, see the damage type table.
- Active card play: playing a hand card yourself or installing an equipment card in your own equipment zone; includes responses; does not count losing hand cards, end-of-action discards, shouting voice lines, or using skill points.
- Hand limit = current HP + permanent hand-limit modifier (minimum 0).
- After judgment the card goes to the discard pile; cards canceled by IX Mechanism when played and cards whose judgment is skipped by effect 6 also go to the discard pile. When a delayed trick's judgment is skipped by IX Mechanism before judgment: the skipped trick remains in the judgment zone (neither Memory Freeze nor Final Verdict disappears); only this judgment is skipped.
- The equipment zone holds at most one of each of the three equipment types, all public; new equipment replaces old equipment, and the old equipment goes to the discard pile.
- "Lose hand cards" effects take hand cards first; if none, randomly take one equipment; if no equipment either, HP is deducted only when the original description requires HP compensation; otherwise no deduction.
- Shuffle: when drawing/judging/revealing/loot-searching needs N cards or a specific type and the deck is insufficient or lacks the requirement, first return all discards to the deck and shuffle, then continue; if still insufficient, take what is actually available.
- Before each game, each of the two decks independently randomizes the "element+rank ↔ card name" mapping once; each deck is shuffled, then combined, and fixed for the game.
- There is only one field effect per round; effect 3's Reminiscence and Cave Allegory do not affect each other.
- Eliminated players: cannot act, cannot be targeted or affected, do not count as "all players", lose all cards and effects, and reveal their identity card; if their identity's faction eventually wins, they also win.
- Defeat rewards: defeating a Voidranger (damage source is that player) draws 3 cards immediately; when the Navigator defeats a Nameless, immediately discard all hand cards and equipment-zone cards.
- Final statistics: winning faction, winning characters (including eliminated ones who win with their faction), round count, game count.

| # | Field Effect | Effect |
|---|---|---|
| 1 | Aha Gets Embarrassed | All surviving players spin 3 times in action order; each spin draws one of Diamonds/Spades/Clubs/Hearts with equal probability. Single spin: Diamonds = search the deck for 1 random card and gain it; Spades = take 1 sourceless, un-dodgeable damage; Clubs = randomly lose 1 hand card; if no hand cards, randomly lose 1 equipment card; if no equipment either, nothing happens (no HP compensation); Hearts = recover 1 HP. On three of a kind, replace the three normal effects: Diamonds ×3 = permanent hand limit +1; Spades ×3 = permanent max HP −1 (current HP drops with it if it equals the original max; if max becomes 0, eliminated immediately and cannot be rescued); Clubs ×3 = permanent hand limit −1 (minimum 0); Hearts ×3 = permanent max HP +1 (current HP unchanged). With no three of a kind, HP and hand cards resolve separately: Hearts (+1 HP) and Spades (−1 HP) cancel, Diamonds (+1 hand) and Clubs (−1 hand) cancel; if the net HP is positive, recover that much HP; if negative, take that much sourceless damage (as one damage event); if the net hand is positive, draw that many cards; if negative, randomly lose that many hand cards (if no hand cards, randomly lose equipment cards; if no equipment, nothing happens, no HP compensation). If both nets are 0, no effect triggers. Example: Hearts + Spades + Diamonds → net HP 0, net hand +1; Hearts + Hearts + Spades → net HP +1. Three of a kind does not participate in the net cancellation. Permanent modifiers and max HP are calculated separately; actual hand limit = current HP + permanent hand-limit modifier (minimum 0); permanent modifiers persist across rounds and effects. Each player's entire set of spins this time can be canceled by 1 IX Mechanism at the moment it is granted; only the player themselves can use their own IX Mechanism to cancel their own result. |
| 2 | Madam Herta Is Peerless | All surviving players gain [Interpretation] as a uniformly random integer from 0–15 (inclusive); it cannot be removed actively. When Interpretation is gained, the avatar shows diamond layers; if below 42 and Interpretation is lost, the mirror shatters; at 42, a wand blessing is shown first, then full-heal/draw resolves. During this round, when a player actively plays cards (not limited to their own play phase; the whole round; including responses; including active equipping; including Himeko's [Trailblazing Star] (using the sum of the two discarded cards' ranks); when multiple hand cards are played together, use the sum of their ranks; discarding does not count; shouting voice lines and using skill points do not count), after the card effect resolves, Interpretation increases by layers equal to that card's rank (A=1, 2–10 face value, J=11, Q=12, K=13). Interpretation >42: take 1 sourceless, un-dodgeable damage, then clear Interpretation. Interpretation =42: fully heal (counts as one recovery and can trigger Gate of Paradise); if hand cards are below the hand limit, draw up to exactly the hand limit at once, then clear Interpretation. Check only once at the end of the round: only count Interpretation of players who are alive and not removed; swap only if exactly one highest and one lowest can be found; otherwise do not swap; swap all hand cards between them; only hand cards are swapped, not equipment/identities, and no gain-card effects trigger; after the swap, both players can see each other's hands. At the end of the round, clear all Interpretation. |
| 3 | Romantic Guru | During this round, [Reminiscence] appears on the table. Its initial value when it first appears = 18 − (this game's initial player count × 2), and it persists across rounds. During this round, whenever any surviving player actively plays cards, immediately increase the number of cards actively played and check (active equipping also counts; when multiple cards are played together, count the actual number, e.g. Himeko discarding two counts as 2 layers). Reminiscence must first reach 24 to trigger the 24 effect once per game; before triggering 24, reaching 12 does not trigger the 12 effect. When Reminiscence reaches 24: all surviving players gain 1 hand card and recover 1 HP (recovery can trigger Gate of Paradise), Reminiscence −24; this effect triggers at most once per game. After the 24 trigger, whenever Reminiscence reaches 12: all surviving players gain 1 hand card, Reminiscence −12. Reminiscence is hidden at the end of the round and shown again when it reappears. During this round, [Cave Allegory] appears on the table; initial value 8 − this game's initial player count, persists across rounds; each 1 HP loss by a player increases it by 1, accumulated point by point (including damage, HP loss, and current HP loss caused by max HP reduction; recovery does not count). It triggers after effects (check actual HP loss after each damage resolution); check all players in action order; each player at or above 13 triggers one sourceless Reignbow Arrow effect in turn — all surviving players take 1 damage, Sidestep cannot cancel it, and equipment effects apply as with Reignbow Arrow; then −13. HP loss caused by D14 does not count toward Cave Allegory and cannot chain. Cave Allegory is hidden at the end of the round and shown again when it reappears. Reminiscence and Cave Allegory do not affect each other. Both [Reminiscence] and [Cave Allegory] are global in-game parameters, one each, influenced by all characters on the field; they are not character states. |
| 4 | Magic Trick | All surviving players gain the chance to send the voice line [Magic Trick]; each time this field effect is drawn, all players' shout counts reset to 0. The first player to shout 10 times searches the drawable deck for 1 random [Trick Snack] and gains it; each player can gain this at most once, and after gaining it they leave the reward race but may continue shouting. If there is no [Trick Snack] in the drawable deck, immediately notify the players, the effect ends, but everyone may continue shouting (no reward); if there is no snack in the deck at the start of the round, also notify. The effect ends when all surviving players have gained the reward. Dead players are excluded. Shouting a voice line does not count as playing a hand card. Players send the voice line [Magic Trick] through the chat bar; each send adds 1 to the count. |
| 5 | Hua Hua Huo Huo | All surviving players gain [Don't Make Sparkle Laugh]. They currently have (number of skill points) skill points. Each layer equals 1 skill point; each time this effect is drawn, gain 6 layers; if it appears again, add 6 more layers. During their play phase, a player may spend 1 skill point to spin: 50% search the deck for 1 random card and gain it, 50% lose 1 hand card; if no hand cards, randomly lose 1 equipment card; if no hand cards and no equipment, this loss effect produces no change (no HP compensation). Unlimited uses per play phase. Skill points persist across rounds and become irrelevant after death. Using skill points does not count as playing hand cards. |
| 6 | Jing Yuan Rises Again | All surviving players gain [100% Effect RES] and [Help Me, General] until the end of the round. 100% Effect RES: unaffected by negative tricks. Negative tricks can be played but have no effect; those requiring judgment skip judgment and go to the discard pile. Positive tricks work normally. Help Me, General: after actively playing a [Farewell Hit], search the drawable deck for 1 [Farewell Hit] and gain it; playing it is enough, regardless of whether it is dodged or deals damage; at most 2 times per player per round; the gained hit does not disappear at the end of the round. |
| 7 | Wait for the Next Dawn | All surviving players gain [The DOT Girl Never Loses]. During this round, the first time each character deals damage with [Farewell Hit] (shield absorption also counts), attach 1 layer of [dot] to the damaged target, then that character removes [The DOT Girl Never Loses]; those who do not trigger remove it at the end of the round. When a character is attached with [dot], only the player themselves can remove 1 layer with their own 1 IX Mechanism, and only at the moment of attachment; prevented damage does not attach dot; if the target dies from this damage, dot is not attached (if rescued, it attaches normally). A player with [dot] may, during their own play phase, use [Medicine King] or [Trick Snack] to remove 1 layer, multiple times in one action; the two cards are consumed only; they do not heal or grant the snack's damage bonus, and can be used at full HP. At the end of that player's action (after the discard phase and before the turn ends), they take damage equal to the remaining [dot] layers; each layer counts as one damage event; sourceless, un-dodgeable, cannot be actively removed, but can be prevented or reduced by shields/Light Shield/Preservation/Destruction etc. according to the damage type table. After resolution, clear all [dot]. dot persists across rounds until the player's next action ends and resolves. |
| 8 | I've Got Mara Snacks | All surviving players gain [Mara]. When you deal damage as the damage source, recover HP equal to that damage for each damaged target separately; D2 can trigger healing, D3 cannot; [Retaliation Armor] retaliation, Swarm Disaster, Reignbow Arrow, and shield-absorbed damage cannot trigger healing; no use limit. At the end of the round, Mara is removed, then take 1 sourceless, irremovable, unpreventable damage. When Mara is applied, only the player themselves may choose whether to remove it with their own IX Mechanism. Mara healing can trigger Gate of Paradise. |
| 9 | In Love with Thunder | All surviving players gain [Eternal Recurrence] (including players in [Memory Is the Prologue of a Dream]); it is removed at the end of the round and cannot be actively removed by any means. Action order this round: start from the player who would act last in the normal round and proceed counterclockwise, with the Navigator acting last; after the round, return to normal clockwise order (Navigator first). Attack distance is unchanged. Anti-Grav Boots resolve in this reversed order; if the Boots holder is in [Firechase], skip all their prompts. When a player with [Eternal Recurrence] enters dying, they instead enter [Firechase]: their [Eternal Recurrence] state converts to [Firechase] (Dream Pool players can also convert), they cannot act, cannot be rescued, cannot be targeted, and no card or effect can affect them; other attributes remain. No character is eliminated this round, and victory cannot be decided by normal victory conditions; all [Firechase] players are released at the end of the round, their HP becomes 1, and their max HP is reduced by 1 according to the rescue rules (minimum 1; if already 1, stays 1), treated as recovery. Each time a character enters [Firechase], check once: if only 1 character remains not in [Firechase], that player wins directly, the game ends, all other players are considered eliminated, and there is no winning faction. Entering [Firechase] resolves in action order, so under normal flow "all surviving characters simultaneously in Firechase" cannot occur; if it somehow occurs, no special victory triggers and they recover at round end per the above rules. At the end of the round, if special victory did not trigger, display a full-screen yellow notice "Rebirth arrives as normal"; if it triggered, replace the normal pre-result screen with a dark-red full-screen notice "All will part with one, and only that one shall behold the miracle" for about 4.25 seconds. During the notice no character can act and the system resolves nothing else. |
| 10 | Stick Mother | All surviving players gain [Rolling Log]. This effect does nothing and is display-only; removed at the end of the round. |

---

## 13. Rules Edge Cases (FAQ)

| Situation | Handling |
|---|---|
| Deck and discard pile | Draw/judge/reveal from the top of the deck; used, played, and discarded cards go to the discard pile (face up, public); equipment cards go to the equipment zone, delayed tricks to the judgment zone. When drawing/judging/revealing/loot-searching needs N cards or a specific type and the deck is insufficient or lacks the requirement, first return all discards to the deck and shuffle, then continue; if still insufficient, take what is actually available |
| Per-game reshuffle | Before each game, each of the two decks independently randomizes the mapping between "element+rank" and card name/effect once; each deck uses each of its 91 combinations once; duplicates between decks are allowed; card names/counts/effects stay unchanged; **fixed for the game**, not reshuffled every round |
| Equipment zone | 3 slots: weapon, armor, vehicle (+1/−1 vehicle share the vehicle slot), one card per slot, all public. Using equipment from hand may replace the same slot; the old equipment goes to the discard pile. When gaining equipment through loot or a relic, if the corresponding slot already has equipment (or the zone is full), put it into your hand instead; it cannot replace directly |
| Losing hand cards | Take hand cards first; if none, randomly take one equipment; if no equipment either, deduct HP only when the original description requires HP compensation; otherwise do not |
| Damage resolution order | Base order: source damage bonus (Trick Snack/Destruction/Firestorm) → target damage reduction (Preservation) → armor (Hard Armor nullifies/Absolute Heat caps at 1/Light Shield prevents) → shield → HP → if dying: source-side after-damage triggers (Mara → Stellaron Resonance → Elation) → dying/rescue/death (or Firechase conversion) → Retaliation Armor retaliation → target-side after-damage triggers (March 7th Full of Energy → Dan Heng → dot attachment) → Cave Allegory check; if not dying: Retaliation Armor retaliation → source-side → target-side after-damage triggers → Cave Allegory check. Damage numbers/source-side effects are shown before the dying prompt; Retaliation Armor and target-side triggers still resolve after dying per the original rules. For which damage types apply to which armor/effects, see the damage type table |
| Sourceless un-dodgeable damage | Resolved per the damage flow; does not trigger [Retaliation Armor] retaliation or [Mara] healing; Final Verdict's 3 lightning damage is the same. For applicable shields/reduction/prevention, see "Damage Types and Applicable Effects" |
| Irremovable | Cannot be canceled/removed by any active means; highest priority |
| Shields and damage | Shields absorb damage before HP and disappear when consumed; March 7th's shield caps at 2 points, each layer lasts 2 rounds independently and expires layer by layer. When a shield absorbs damage, the character is still considered to have taken damage; damage prevented by [Light Shield], nullified by [Hard Armor], or reduced to 0 does not count as taking damage |
| Retaliation Armor | Retaliates only when this damage actually reduces HP; retaliation value = HP loss; the source must be a character; first complete dying/rescue/elimination (or Firechase conversion) and immediately check victory; if a winner already exists, no retaliation, otherwise resolve retaliation afterward; cannot trigger any chain reactions |
| Light Shield | Discard two of your own cards instead; cannot activate with fewer than two cards |
| [Farewell Hit] uses | Once per turn: Galactic Bat allows unlimited use; High-Freq Chainsaw still counts as 1; Eden Star's extra hit, Decapitation's extra targets, and the hit forced by Elation Trick do not count; Himeko's skill does not count; "playing" in Path Collision/Swarm Disaster does not count as a use |
| Medicine King / Trick Snack | Can only be used on yourself during your own play phase; when a character is dying, can be used on the dying character. Using a snack while dying only recovers 1 HP and grants no damage bonus; its damage bonus only applies to the next [Farewell Hit] this turn, once per turn |
| Anti-Grav Boots | Judge at round start (Physical/Ice/Imaginary/Quantum); only success triggers; on failure act in normal order. After triggering, one action opportunity per round; prompts occur at the timings above; after choosing to act, no more prompts and no second action; if no choice is made, act last this round; if already the last actor, act directly at the normal timing. "After the normal action timing" means the timing has passed, not that the holder has acted. Only this round's action order changes; seating, distance, and attack range do not. Delaying the Navigator does not change the round boundary; turn-start effects trigger at the actual action; if the equipment is lost, stop asking |
| Multiple simultaneous effects | For non-AoE effects, the current turn's character goes first, then the rest in counterclockwise order; AoE effects resolve character by character in the current round's action order (reverse order during Eternal Recurrence), fully resolving one before the next; [Swarm Disaster] and [Reignbow Arrow] damage starts from the character after the user and follows the current action order; [Beauty Knight Cameo] card selection starts from the user, then continues in the current action order |
| IX Mechanism canceled by IX Mechanism | Allowed; forms a chain; an IX Mechanism used before judgment can also be canceled by another IX Mechanism, and the final uncanceled IX Mechanism decides whether that judgment is skipped |
| Using IX Mechanism before delayed-trick judgment | Starting from the Navigator, all players with IX Mechanism are asked in the current round's action order; if someone uses one, an IX chain begins, and the final uncanceled IX skips that judgment. The skipped trick remains in the judgment zone; Final Verdict then transfers to the next character |
| Final Verdict canceled by IX Mechanism | Using IX Mechanism when the card is played sends it directly to the discard pile; using it before judgment only skips this judgment and does not remove Final Verdict |
| Illegal target (out of range, no card to discard) | The card cannot be used |
| Sunday's hand limit | No special "HP − 1" rule; hand limit = current HP + permanent modifier |

---

## 14. Damage Types and Applicable Effects

### 1. Damage Types

| ID | Type | Source | Dodge |
|---|---|---|---|
| D1 | [Farewell Hit] damage (7 elements) | User | Dodgeable |
| D2 | Himeko [Trailblazing Star] | Himeko | **Dodgeable** |
| D3 | [Path Collision] | User | Un-dodgeable |
| D4 | [Swarm Disaster] | User | Un-dodgeable |
| D5 | [Reignbow Arrow] | User | Un-dodgeable |
| D6 | [Final Verdict] 3 lightning damage | Sourceless | Un-dodgeable |
| D7 | [Retaliation Armor] retaliation | Armor owner | Un-dodgeable; cannot trigger any chain reactions |
| D8 | Aha net HP loss | Sourceless | Un-dodgeable; HP and hand cards resolve separately; net value 2 is one 2-damage event |
| D9 | Herta Interpretation >42 | Sourceless | Un-dodgeable |
| D11 | dot resolution (each layer is one damage event) | Sourceless | Un-dodgeable; cannot be actively removed; can be prevented/reduced |
| D12 | Mara Snack end of round | Sourceless | Un-dodgeable; irremovable; unpreventable |
| D13 | Current HP loss from max HP reduction | Sourceless | Not damage; max 0 means immediate elimination |
| D14 | Cave Allegory's Reignbow Arrow | Sourceless | Un-dodgeable; equipment effects apply as D5 |
| D15 | [Elation Trick] target did not play [Farewell Hit] | Sourceless | Un-dodgeable |
| D16 | [Elation] judgment 5–10 with no hand cards | Sourceless | Un-dodgeable |

> D10 has been removed; event 5 with no hand cards and no equipment produces no effect and deducts no HP. The [Elation] 5–10 no-hand damage uses D16.

### 2. Equipment / Effect Applicability

- **Hard Armor**: only nullifies D1 hits of the Lightning/Wind/Physical elements; D2–D5 have no element and cannot be nullified; D6 lightning damage cannot be nullified.
- **Cloud-Piercer**: only against D1; ignores the target's armor and shield.
- **Absolute Heat**: applies to D1–D9, D16, D12 (D12 is 1 point itself); **does not include D11**.
- **Light Shield**: can prevent all except D7 and D12.
- **Shield**: includes D6, D7, D11; excludes D12, D13.
- **Preservation**: counts for all except D12, D13.
- **Destruction**: counts for all except D6, D7, D12.
- **Retaliation Armor**: retaliates only when this damage **actually reduces HP**; retaliation value = HP loss; source = armor owner; first complete dying/rescue/elimination (or Firechase conversion) and immediately check victory; if a winner already exists, no retaliation, otherwise resolve retaliation afterward; cannot trigger any chain reactions (only prohibits another Retaliation Armor + Mara healing; Full of Energy/Stellaron Resonance/Elation can still trigger); D6/D8–D12, D16 are sourceless and do not retaliate; D7 does not chain.
- **Full of Energy**: triggers only for damage that **actually reduces HP**; check separately after each layer of damage; shield absorption, Light Shield prevention, and damage reduced to 0 do not count. D12 still triggers.
- **Stellaron Resonance / Elation**: damage whose source is you counts, including shield absorption; otherwise it does not; triggers per the character "turn" definition.
- **Cloud Knights Spearplay**: only damage from **real [Farewell Hit] cards** you initiate; shield absorption counts; if the target has hand cards, **must randomly discard one**; if none, discard none.
- **Firestorm**: only damage from **real [Farewell Hit] cards** you initiate; stacks with Trick Snack/Destruction.
- **Trick Snack**: only damage from **real [Farewell Hit] cards** you initiate; stacks with Destruction/Firestorm.
- **Gugu Gaga / Eden / Decapitation / Chainsaw / Bat**: only affect D1; the chainsaw's virtual hit does not trigger effects that only recognize real hits.
- **Mara**: D1, D2 can heal; D3, D4, D5, D7, and shield absorption do not trigger healing; D6, D8–D12, D16 are sourceless and do not trigger; calculated per damaged target.
- **dot attachment**: only D1; shield absorption counts; prevented damage does not count; if the target dies from this damage, dot is not attached (if rescued, it attaches).
- **Gate of Paradise**: all recoveries except full-HP recovery count; Medicine King cannot be used on a full-HP target.
- **D11**: each layer is one damage event; can be prevented/reduced, cannot be actively removed.
- **D12**: 1 point, sourceless, irremovable, unpreventable; does not trigger Retaliation Armor/Mara.
- **D14**: 1 point, sourceless, un-dodgeable; defensive equipment/Preservation/Destruction/Full of Energy etc. resolve as D5; does not trigger Retaliation Armor/Mara/Stellaron Resonance/Elation.

### 3. Confirmed Damage Priorities

- **D7 "cannot trigger any chain reactions"**: only prohibits another Retaliation Armor retaliation + Mara healing; Full of Energy, Stellaron Resonance, and Elation can still trigger.
- **D11 each layer is independent damage**: Preservation reduces only the first layer; Light Shield may discard 2 cards per layer; shields absorb layer by layer; Destruction adds +1 per layer; Full of Energy triggers after each layer only if that layer actually reduces HP.
- **D12**: unpreventable, but still triggers Full of Energy; sourceless, does not trigger Retaliation Armor/Mara.
- **D3 Path Collision**: does not trigger Mara healing; D2 Himeko can trigger; D4/D5/D7 do not heal.
- **D8 net HP 2**: resolved as one 2-damage event: Absolute Heat → 1, Preservation → 1, Full of Energy triggers only once; the hand net value resolves separately as a hand effect.

---

## 15. Status List

States are temporary effects granted to players and do not change rules by themselves; their mechanical effects are implemented by the corresponding rules/cards/field effects. States and their corresponding effects exist and disappear together. [Reminiscence] and [Cave Allegory] are global in-game parameters, one each; they are not character states.

| State | Source | Type | Effect | Duration |
|---|---|---|---|---|
| [Firechase] | Eternal Recurrence | Special state | Converted from [Eternal Recurrence]. Cannot act, cannot be rescued, cannot be targeted; no card or effect can affect this character; other attributes remain. Not eliminated this round, and victory cannot be decided by normal victory conditions. Released at the end of the round: HP becomes 1, max HP reduced by 1 per rescue rules (minimum 1; stays 1 if already 1), treated as recovery. | End of the Eternal Recurrence round |
| [Memory Is the Prologue of a Dream] | Dream Pool | Special state | Skip this action; HP unchanged; other attributes are the same as [Firechase] (cannot act, cannot be rescued/targeted, no card or effect can affect this character). At the start of your next turn, if HP is below max, recover 1 HP first, then remove the state and act normally. | Until the start of your next turn |
| [Weightless] | Welt [Gravity Collapse] | Displayed state | Corresponding effect: the character cannot use [Sidestep] until the start of their next action. The state itself does not change any rules. | Before the affected character's next action (removed at action start) |
| [Cute Is Justice] | March 7th [Six-Phase Ice Bow] | Displayed state | Corresponds to the shield applied by March 7th; shield cap 2, each layer lasts 2 rounds independently. The state itself does not change any rules. | While the shield lasts |
| [Disciplinary Flicker] | Trailblazer [Destruction] | Displayed state | Corresponding effect: the first [Farewell Hit] you use this turn deals +1 damage; after triggering, you take +1 damage this turn. The state itself does not change any rules. | Until the start of your next action |
| [I Can't Protect Anything] | Trailblazer [Preservation] | Displayed state | Corresponding effect: the first damage you take this turn is −1; after triggering, the damage you deal this turn is −1. The state itself does not change any rules. | Until the start of your next action |
| [Incineration] | Memory Freeze | Displayed state | Corresponds to [Memory Freeze]'s "skip play phase" effect; the state itself does not change any rules. | From Memory Freeze taking effect until the start of your next action |
| [Interpretation] | Madam Herta Is Peerless | Counter state | After actively playing cards, add layers equal to the card's rank; >42 take 1 sourceless un-dodgeable damage and clear; =42 fully heal and draw up to the hand limit, then clear; at round end swap hands by highest/lowest. At event start gain 0–15 layers at random (uniform, including 0 and 15); even 0 shows "Interpretation 0"; the avatar diamond color gradients from light blue at 0 to deep purple at 42, with the current layer count in white inside; if cleared below 42 or removed at round end, the mirror shatters; at 42, a wand blessing is shown first, then full heal and draw up to the hand limit, then clear. | End of the current round |
| [dot] | Wait for the Next Dawn | Counter state | Each layer deals 1 sourceless un-dodgeable damage at the end of the character's next action; can be prevented or reduced by shields/Light Shield/Preservation/Destruction etc.; cleared after resolution. The owner may remove 1 layer during their own play phase with [Medicine King] or [Trick Snack], multiple times per action; both cards are consumed only. | Persists across rounds until the next action ends and resolves |
| [The DOT Girl Never Loses] | Wait for the Next Dawn | Displayed state | The first time this character deals damage with a real [Farewell Hit] this round, attach 1 layer of dot to the target, then remove this state. | At the end of the current round or after triggering |
| [Mara] | I've Got Mara Snacks | Displayed state | When you deal damage as the damage source, recover HP equal to the damage per target; D2 can heal; D3/Retaliation/Swarm/Reignbow/shield absorption cannot. Removed at round end and take 1 sourceless irremovable unpreventable damage. | End of the current round |
| [Help Me, General] | Jing Yuan Rises Again | Displayed state | After actively playing a real [Farewell Hit], search the drawable deck for 1 [Farewell Hit]; at most 2 times per player per round; the gained hit does not disappear at round end. | End of the current round |
| [100% Effect RES] | Jing Yuan Rises Again | Displayed state | Unaffected by negative tricks. Negative tricks can be played but have no effect; those requiring judgment skip judgment and go to the discard pile. Positive tricks work normally. | End of the current round |
| [Don't Make Sparkle Laugh] | Hua Hua Huo Huo | Counter state | Currently has (number of skill points) skill points. Each layer equals 1 skill point; during the play phase spend 1 to spin: 50% search 1 random card, 50% lose 1 hand card (if none, equipment; if none, nothing happens); using does not count as playing hand cards; persists across rounds. | Persists across rounds; irrelevant after death |
| [Eternal Recurrence] | In Love with Thunder | Field state | All surviving players (including those in [Memory Is the Prologue of a Dream]) gain it; only players with this state can enter [Firechase]. On entering dying, this state converts to [Firechase]; action order this round is reversed; normal victory is suspended; when only 1 non-Firechase character remains, that player wins directly, all others are eliminated and there is no winning faction. At round end this state and all [Firechase] are cleared. | End of the current round |
| [Earth Beast Superfan] | Magic Trick | Field state | Shout counter; first to reach 10 gains 1 Trick Snack; at most once per player; if no snack, notify and players may continue shouting without reward. | End of the current round |
| [Rolling Log] | Stick Mother | Joke state | No effect; display only. | End of the current round |

---

## 16. Resolution Order (Confirmed)

1. **Multi-target damage**: resolve target by target in the current round's action order (from the Navigator in a normal round; reverse order during Eternal Recurrence); after each target takes damage, resolve its source-side after-damage triggers, then immediately insert its dying/rescue/death (if it enters dying), then resolve Retaliation Armor and target-side after-damage triggers, then move to the next target. Rescue also proceeds from the Navigator in the current round's action order. Because damage resolves target by target with dying inserted immediately, multiple simultaneous dying states do not normally occur.
2. **Single damage event**: source damage bonus → target reduction/armor → shield → HP → if dying: source-side after-damage triggers (Mara → Stellaron Resonance → Elation) → damage display → dying/rescue/death (or Firechase conversion) → Retaliation Armor retaliation → target-side after-damage triggers (March 7th Full of Energy → Dan Heng → dot attachment) → Cave Allegory check; if not dying: Retaliation Armor retaliation → source-side → target-side after-damage triggers → Cave Allegory check.
3. **End of turn**: just before that character's next action; the old turn ends before the new turn starts; this-turn effects expire at that point. Each character's turn is independent.
4. **End of round**: current action ends (including end-of-action dot) → that round's field effect end-of-round resolution → immediate victory check on each death → clear temporary states → next round: draw effect/effect start/Anti-Grav judgment/Navigator action.
5. **Eternal Recurrence round**: normal victory is suspended; only the special victory "only 1 non-Firechase character remains" can occur; entering Firechase proceeds in action order; non-Eternal rounds only produce normal victories.
6. **IX Mechanism**: IX prompts for judgments and normal tricks both start from the Navigator and proceed in the current round's action order; IX only skips this judgment/cancels this trick; the delayed trick itself (Memory Freeze, Final Verdict) remains in the judgment zone, and the card used for judgment goes to the discard pile.
7. **AoE effects**: resolve character by character in the current round's action order (reverse order during Eternal Recurrence, Navigator last); if multiple AoE effects occur simultaneously, fully resolve one (including its after-damage/dying/rescue effects) before the next. [Swarm Disaster] and [Reignbow Arrow] damage starts from the character after the user and follows the current action order; [Beauty Knight Cameo] card selection starts from the user and then continues in the current action order, not Navigator-first.

## 17. Action Start and IX Mechanism Timing

### 1. Action Start Order

1. **Previous turn ends**: just before the next action starts, the old turn ends (this-turn effects expire).
2. **This character starts their action**:
   - turn-start resets;
   - [Memory Is the Prologue of a Dream] recovers and is removed;
   - shield duration ticks down/expires;
   - "until next action start" effects are cleared: Weightless is removed at the start of the affected character's action;
   - character turn-start skills (Welt, Sunday, Harmony, etc.);
   - Dream Pool: judge immediately after use; odd takes effect normally and skips this action, even fails.
3. **Final Verdict**: only the holder judges at this point; if not triggered, it transfers to the next targetable character.
4. **Memory Freeze**: only the holder judges at this point; must be after Final Verdict.
5. If Dream Pool took effect, skip this action; otherwise enter the judgment phase (only other delayed tricks) → draw → play → discard → end-of-action dot.

Final Verdict/Memory Freeze belong to **the start of this character's current action**, not the end of the previous turn. A field effect's "start effect" belongs to **round start**; "end-of-round resolution" belongs to the end of the previous round.

### 2. When IX Mechanism Can Apply

- When a normal/delayed trick is played: any player may use IX to cancel that trick (Dream Pool can only be canceled by someone other than its user); the canceled card goes to the discard pile.
- Before a delayed-trick judgment: skip this Memory Freeze/Final Verdict judgment; IX goes to the discard pile; Memory Freeze remains, Final Verdict then transfers.
- Aha: the player themselves may use IX when the effect is granted to exempt themselves from all of this Aha result.
- Mara: the player themselves may use IX when just gaining it to exempt themselves from the state.
- dot: the player themselves may use IX when just attached to remove 1 layer.
- 100% Effect RES only blocks negative tricks, not IX.

### 3. When IX Mechanism Cannot Apply

- Cannot be actively used during the play phase; only at the response timings above.
- Cannot cancel basic cards, equipment cards, damage already resolved, or field effects already in effect.
- Cannot cancel irremovable effects/states (such as Eternal Recurrence, D12 end-of-round damage, etc.).
- Cannot skip judgments of non-delayed tricks (Elation, Anti-Grav Boots, Dream Pool, Retaliation Armor, etc.).
- Cannot remove dot at will after attachment; at attachment only 1 layer can be removed, afterward use Medicine King/Trick Snack.
- The Dream Pool user cannot cancel their own Dream Pool.
- IX can cancel IX, forming a chain: after each IX is played, starting from the Navigator, ask other players with IX in order whether to cancel; the final effective IX decides whether the original effect is canceled.

---

## 18. Controls (Manual Interface)

- **Choosing targets**: for cards or character skills that need a target, either use the target buttons listed in the action area or click the target character's status frame on the table. Targetable frames glow on hover; left-click confirms the play; non-targetable frames do not respond.
- **Skill card selection**: when a character skill or effect requires choosing cards from your hand, either use the option buttons or left-click the corresponding card in the hand area. Selectable cards have a gold border and highlight on hover; during selection other hand cards and actions are locked; for multiple cards, click one at a time as prompted.
- **Fade with Butterflies / Stellaron Hunter card selection**: choose the target first; if the target has both hand cards and equipment, then choose "hand" or "equipment". For hand, the system randomly loses/gains one; for equipment, the user chooses the specific card.
- **Status-bar card faces**: equipment cards show their enhancement value at the top right (e.g. +2, +1); pure-effect armor without a numeric modifier shows no enhancement value. Equipment and judgment cards use the same column grid; card left edges align vertically, and overflow wraps within the same column.
- **Dream Pool**: at turn start, if [Dream Pool] is in hand, the use choice appears under that hand card instead of a large modal. During the choice, other hand cards, character skills, and action buttons are locked; after choosing "use" or "do not use", the turn continues.

- **Judgment phase**: if there are no delayed cards requiring judgment at action start ([Final Verdict], [Memory Freeze]), the manual interface hides the judgment button and draws 2 cards directly into the play phase (character skills originally usable in the judgment phase can still be used before the first play). With judgment cards, each click of "Judge" resolves only one card; the revealed judgment card is shown to all players first, then goes to the discard pile. The result is also shown (e.g. "Judgment success · Skip play phase", "Judgment failure · Play phase continues"), so players do not need to compare elements or ranks themselves.
- **Identity reveal**: the Navigator's identity is always public; other living characters' identities are not public; any character's identity is revealed immediately on death.
- **Play/response reveal**: all characters reveal the card they play or respond with. AoE effect cards ([Swarm Disaster], [Reignbow Arrow], [Harmony Resonance], [Beauty Knight Cameo]) are shown at the center of the screen; other cards are shown beside the player's status frame; they are hidden when the next action begins.
- **Equipment confirmation**: when the player actively plays an equipment card, if the corresponding slot is empty, prompt "Equip this equipment?"; if a corresponding equipment already exists, prompt "Replace the old equipment with this one?". Only "Yes" equips it; "No" cancels.

- **Presentation pacing**: a revealed judgment card is shown for 2.25 seconds, then goes to the discard pile; each play/response is shown for about 2.25 seconds before the affected character gets a response chance; if [Sidestep] is played, the attack card and [Sidestep] are shown together for another 2.25 seconds before hiding; after confirming a use/discard there is no extra wait; resolution proceeds immediately after the display; AoE effects process in action order with about 2.75 seconds between characters; Aha shows each player's drawn suits and actual changes in resolution order for about 2.25 seconds each; Beauty Knight Cameo shows each chosen card for about 2.25 seconds; if this damage puts the target into dying, show the damage number/source-side effect for about 0.75 seconds first, then the dying rescue prompt; after the dying prompt, wait about 2.25 seconds before asking for rescue; when [Simulated Black Hole] rescues a character, show the black-hole effect on the target's status frame for about 2.25 seconds.
- **Aha Gets Embarrassed presentation**: at event start, first reveal this round's field effect normally; after the reveal, play the dedicated music and pause the background music, slide the subtitle "The Lord of Revelry graces the Astral Express" in from the left, and loop a random character image at the center of the table (one of two images at random, black background removed and size normalized). When the round ends or victory is decided during the round, the music, subtitle, and image stop together, then the background music resumes. The image is drawn inside the circular field-effect area at the center of the table; its lower edge stops above the top edge of the center player's status frame and never crosses that boundary. It remains behind the character status frames and the center reveal panel, and does not cover status bars, the reveal panel, or the slot machine. While the slot reels spin, a wheel-spinning sound plays; when they stop, a crisp "ding" plays; then it stays for about 2.25 seconds showing the drawn suits and actual changes; on three of a kind, after the effect reveal ends, red text with a gold border "Jackpot!" pops on the slot machine, then disappears together with that player's slot machine about 0.95 seconds later, before the next player. After the reels stop, both above the machine and in the center reveal, the direct changes from this spin are shown as concise deltas (e.g. "HP +1", "Hand −1", "Max HP +1", "Hand limit −1", "No net change"); hand-limit changes caused indirectly by HP changes are not shown; hand-limit changes are shown only for triple Diamonds/triple Clubs.
- **Hua Hua Huo Huo temporary voice**: during the field effect 5 round, the player's voice tab temporarily adds [Hua Hua Huo Huo]; sending it only shows the bubble "I place my bets, I play the game, I take the prize..." beside the player's avatar, plays no sound, and does not trigger skill points or any game resolution; the voice item is hidden at round end.
- **Sparkle dedicated music**: when field effect 5 starts, first reveal the round's field effect normally; after the reveal, play the dedicated music (only the 0:00–2:27 segment, looping) and pause the background music. When the round ends or victory is decided during the round, stop the dedicated music and resume the background music.
- **Romantic Guru counters**: during field effect 3, the center of the table shows the current value and cap of [Reminiscence] and [Cave Allegory]; Reminiscence caps at 24 before its 24 trigger and at 12 afterward; Cave Allegory caps at 13; both hide with the field effect at round end.
- **In Love with Thunder dedicated music**: when field effect 9 starts, pause the background music and play the local dedicated music once (no loop) when the field effect reveal appears; after the music ends, the background music remains paused. At round end, stop the dedicated music; when entering the next round or the result screen, resume the background music. The field effect name is shown at the exact center of the circular area and is removed together with the field effect at round end.
- **Music and sound settings**: background music, Aha round music, Hua Hua Huo Huo round music, and the music before In Love with Thunder are "music", controlled by the music toggle and music volume in settings; all other sounds (Magic Trick voice, Path Collision voice, card play/judgment/damage/shield/coffee/pillow, etc.) are "sound effects", controlled by the sound toggle. On first entry, music and sound effects are both on by default. Player and characters use the same sound trigger conditions for the same behaviors (playing cards, taking damage, Path Collision, Throw Pillow, Serve Coffee, Magic Trick, Aha slot machine, etc.). Each successful skill point use plays its dedicated sound; when the player uses skill points manually in succession, the button waits until the previous sound finishes (about 1 second) before it can be used again.
- **Chat panel display**: voice items show the original text directly, one line each; image emotes show the actual image without a text name, with only the hint "Click to send"; Throw Pillow/Serve Coffee show the actual image and keep their names and drag instructions. Throw Pillow uses a pink four-leaf-clover sticker; Serve Coffee is an effect that hands coffee directly to the target character. The player can use all emotes and voice lines from the start of the game. All emotes and voice lines share a 2-second send cooldown; sent emotes and voice lines appear in a speech bubble with a small tail pointing at the sender's avatar; image emotes display at two-thirds of their original size.
- **Madam Herta temporary voice**: during the field effect 2 round, the player's voice tab temporarily adds the three lines [Madam Herta outshines the moon!], [Madam Herta shames the flowers!], [Madam Herta is peerless!]; sending one only shows the corresponding bubble beside the player's avatar, plays no sound, and does not affect Interpretation or any game resolution; these three voice items are hidden at round end.
- **Jing Yuan emote**: during the field effect 6 round, the player's emote tab temporarily adds [Jing Yuan]; clicking it shows the background-removed image in a bubble beside the player's avatar, plays no sound, and does not affect any game resolution; the emote item and bubble are hidden at round end.
- **Wait for the Next Dawn temporary voice**: during the field effect 7 round, the player's voice tab temporarily adds [So I Made My Move]; sending it only shows the bubble "So I made my move." beside the player's avatar, plays no sound, and does not affect dot attachment, resolution, or any game; the voice item is hidden at round end.
- **Wait for the Next Dawn Black Swan emote**: during the field effect 7 round, the player's emote tab temporarily adds [Black Swan]; clicking it shows the original image (background kept, not removed) in a bubble beside the player's avatar, plays no sound, and does not affect any game resolution; the emote item and bubble are hidden at round end.
- **Romantic Guru emote**: during the field effect 3 round, the player's emote tab temporarily adds [Romantic Guru]; clicking it shows the background-removed pink image (background and bottom-right purple triangle removed) in a bubble beside the player's avatar, plays no sound, and does not affect Reminiscence, Cave Allegory, or any game; the emote item and bubble are hidden at round end.
- **Mara Snack temporary voice**: during the field effect 8 round, the player's voice tab temporarily adds [Five people, three prices...]; sending it only shows the bubble "Five people, three prices..." beside the player's avatar, plays no sound, and does not affect Mara healing, end-of-round damage, or any game; the voice item is hidden at round end.
- **Endgame presentation**: when the player wins or is defeated, the original interface remains for about 4.25 seconds, all states display normally but cannot be operated, then the result screen appears; when the player is eliminated first, the original interface is also kept for about 4.25 seconds before the spectate/settle choice, and the final result does not wait again.
- **Field effect display**: whenever the round's field effect updates, it is first shown enlarged at the center of the screen for about 2.25 seconds; during this time all characters cannot act; after the display, field effect resolution and normal flow continue.
- **HP display**: the number of hearts is drawn only according to max HP; when HP is negative, the number shows a negative value and all hearts are gray, with no extra hearts for negative HP; when recovering HP, the corresponding gray hearts light up according to current HP.

- **Character skills**: right-click a character skill button to view its full effect; left-click an active skill button to use it.

- **Right-click details**: character profiles, equipment, judgment cards, hand cards, and statuses support right-click details.

- **Action prompt**: the current actor's avatar shows "Acting"; when their action starts, the prompt "It's X's turn" appears.

---

## 19. Language Settings (English Version)

- Settings → Language switches between Simplified Chinese and English. Switching only changes the displayed interface and rulebook; it does not change the game state, deck, or rules.
- The first time you switch from Chinese to English, a bilingual notice appears; the English line reads: "All translations are machine-generated and may contain errors." English is applied after confirmation.
- English covers the in-game interface, card/character/field-effect/status text, and this rulebook. Switching back to Simplified Chinese restores the original text.
- The English rulebook (`rules_en.md` / `js/rules_en.js`) follows the same structure as the Chinese rulebook. If the two conflict, the Chinese rulebook and the code's resolution prevail.
