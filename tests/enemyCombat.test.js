import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ═════════════════════════════════════════════════════════════
// Pure logic replicated inline (no file I/O, no Discord imports)
// ═════════════════════════════════════════════════════════════

function resolveCombat(state) {
    if (state.playerAttack <= 0) {
        return { playerWon: false, finalPlayerHp: state.playerHp, finalEnemyHp: state.enemyHp, turns: [], totalTurns: 0 };
    }

    let playerHp = state.playerHp;
    let enemyHp = state.enemyHp;
    const turns = [];
    const MAX_TURNS = 50;

    for (let turnNumber = 1; turnNumber <= MAX_TURNS && playerHp > 0 && enemyHp > 0; turnNumber++) {
        const turn = { number: turnNumber, events: [] };

        if (state.turnOrder === 'enemy_first') {
            playerHp = Math.max(0, playerHp - state.enemyAttack);
            turn.events.push({ actor: 'enemy', damage: state.enemyAttack, targetHp: playerHp, targetMaxHp: state.playerMaxHp });
            if (playerHp > 0) {
                enemyHp = Math.max(0, enemyHp - state.playerAttack);
                turn.events.push({ actor: 'player', damage: state.playerAttack, targetHp: enemyHp, targetMaxHp: state.enemyMaxHp });
            }
        } else if (state.turnOrder === 'simultaneous') {
            enemyHp = Math.max(0, enemyHp - state.playerAttack);
            turn.events.push({ actor: 'player', damage: state.playerAttack, targetHp: enemyHp, targetMaxHp: state.enemyMaxHp });
            playerHp = Math.max(0, playerHp - state.enemyAttack);
            turn.events.push({ actor: 'enemy', damage: state.enemyAttack, targetHp: playerHp, targetMaxHp: state.playerMaxHp });
        } else {
            // player_first (default)
            enemyHp = Math.max(0, enemyHp - state.playerAttack);
            turn.events.push({ actor: 'player', damage: state.playerAttack, targetHp: enemyHp, targetMaxHp: state.enemyMaxHp });
            if (enemyHp > 0) {
                playerHp = Math.max(0, playerHp - state.enemyAttack);
                turn.events.push({ actor: 'enemy', damage: state.enemyAttack, targetHp: playerHp, targetMaxHp: state.playerMaxHp });
            }
        }

        turns.push(turn);
    }

    return {
        playerWon: enemyHp <= 0,
        finalPlayerHp: playerHp,
        finalEnemyHp: enemyHp,
        turns,
        totalTurns: turns.length
    };
}

function buildCombatDisplay(enemy, combatResult, playerName) {
    const e = enemy.emoji || '🐙';
    const won = combatResult.playerWon;
    const components = [];

    components.push({ type: 10, content: `## ${e} ${enemy.name} battle!` });
    if (enemy.description) {
        components.push({ type: 10, content: `-# ${enemy.description}` });
    }
    components.push({ type: 14 });

    const turnLines = [];
    let turnsToShow = combatResult.turns;
    let truncated = false;

    if (turnsToShow.length > 8) {
        const first = turnsToShow.slice(0, 2);
        const last = turnsToShow.slice(-2);
        truncated = turnsToShow.length - 4;
        turnsToShow = [...first, null, ...last];
    }

    for (const turn of turnsToShow) {
        if (turn === null) {
            turnLines.push(`-# *...${truncated} more turns of combat...*`);
            turnLines.push('');
            continue;
        }
        turnLines.push(`### Turn ${turn.number}`);
        for (const event of turn.events) {
            if (event.actor === 'player') {
                turnLines.push(`⚔️ You attack ${e} **${enemy.name}** for **${event.damage}** damage — ${e} ${event.targetHp}/${event.targetMaxHp}`);
            } else {
                turnLines.push(`${e} **${enemy.name}** attacks you for **${event.damage}** damage — ❤️ ${event.targetHp}/${event.targetMaxHp}`);
            }
        }
        turnLines.push('');
    }

    components.push({ type: 10, content: turnLines.join('\n') });
    components.push({ type: 14 });

    if (won) {
        components.push({ type: 10, content: `## ✅ Victory!\n${e} **${enemy.name}** has been defeated!` });
    } else {
        components.push({ type: 10, content: `## 💀 Defeat\nYou were beaten by ${e} **${enemy.name}**...` });
    }

    const statsLine = `💥 **${combatResult.totalTurns}** turns  ❤️ **${combatResult.finalPlayerHp}** HP remaining  ${e} **${combatResult.finalEnemyHp}**/${enemy.hp} HP`;
    components.push({ type: 10, content: `-# ${statsLine}` });

    return {
        type: 17,
        accent_color: won ? 0x57F287 : 0xED4245,
        components
    };
}

function getPlayerAttackValue(items, inventory) {
    let bestAttack = 0;
    let bestItemId = null;
    let bestIsConsumable = false;
    for (const [itemId, invEntry] of Object.entries(inventory)) {
        const quantity = typeof invEntry === 'number' ? invEntry : (invEntry?.quantity || 0);
        if (quantity <= 0) continue;
        const itemDef = items[itemId];
        if (!itemDef || !itemDef.attackValue || itemDef.attackValue <= 0) continue;
        if (itemDef.attackValue > bestAttack) {
            bestAttack = itemDef.attackValue;
            bestItemId = itemId;
            bestIsConsumable = itemDef.consumable === 'Yes';
        }
    }
    return { attack: bestAttack, itemId: bestItemId, isConsumable: bestIsConsumable };
}


// ═════════════════════════════════════════════════════════════
// resolveCombat — player_first (default)
// ═════════════════════════════════════════════════════════════

describe('resolveCombat — player_first', () => {
    it('player wins when stronger', () => {
        const result = resolveCombat({
            playerHp: 6, playerMaxHp: 8, playerAttack: 3,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 2,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.finalPlayerHp, 4);
        assert.equal(result.totalTurns, 2);
    });

    it('enemy does not attack on the turn it dies', () => {
        const result = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 10,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 100,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 1);
    });

    it('defaults to player_first when turnOrder undefined', () => {
        const result = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 10,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 100
            // turnOrder not set
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 1);
    });

    it('player loses when outmatched', () => {
        const result = resolveCombat({
            playerHp: 2, playerMaxHp: 2, playerAttack: 1,
            enemyHp: 10, enemyMaxHp: 10, enemyAttack: 3,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.finalPlayerHp, 0);
    });
});


// ═════════════════════════════════════════════════════════════
// resolveCombat — enemy_first
// ═════════════════════════════════════════════════════════════

describe('resolveCombat — enemy_first', () => {
    it('player loses when enemy attacks first and is stronger', () => {
        const result = resolveCombat({
            playerHp: 3, playerMaxHp: 8, playerAttack: 2,
            enemyHp: 10, enemyMaxHp: 10, enemyAttack: 5,
            turnOrder: 'enemy_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.finalPlayerHp, 0);
    });

    it('player does not attack on the turn they die', () => {
        const result = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 100,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 10,
            turnOrder: 'enemy_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.finalEnemyHp, 5);
    });

    it('player wins despite enemy going first when player has more HP', () => {
        const result = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 5,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 2,
            turnOrder: 'enemy_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.totalTurns, 1);
        assert.equal(result.finalPlayerHp, 8); // took 2 damage, then killed enemy
    });
});


// ═════════════════════════════════════════════════════════════
// resolveCombat — simultaneous
// ═════════════════════════════════════════════════════════════

describe('resolveCombat — simultaneous', () => {
    it('double KO = player wins', () => {
        const result = resolveCombat({
            playerHp: 2, playerMaxHp: 2, playerAttack: 2,
            enemyHp: 2, enemyMaxHp: 2, enemyAttack: 2,
            turnOrder: 'simultaneous'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 0);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.totalTurns, 1);
    });

    it('both attack every turn regardless of HP', () => {
        const result = resolveCombat({
            playerHp: 3, playerMaxHp: 3, playerAttack: 2,
            enemyHp: 3, enemyMaxHp: 3, enemyAttack: 1,
            turnOrder: 'simultaneous'
        });
        // Turn 1: enemy 1/3, player 2/3
        // Turn 2: enemy 0/3 (dead), player 1/3 (still attacked)
        assert.equal(result.playerWon, true);
        assert.equal(result.totalTurns, 2);
        assert.equal(result.finalPlayerHp, 1);
        assert.equal(result.finalEnemyHp, 0);
        // Both attacked in turn 2 even though enemy died
        assert.equal(result.turns[1].events.length, 2);
    });
});


// ═════════════════════════════════════════════════════════════
// resolveCombat — edge cases
// ═════════════════════════════════════════════════════════════

describe('resolveCombat — edge cases', () => {
    it('50-turn safety cap, player loses', () => {
        const result = resolveCombat({
            playerHp: 9999, playerMaxHp: 9999, playerAttack: 1,
            enemyHp: 9999, enemyMaxHp: 9999, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.totalTurns, 50);
        assert.equal(result.playerWon, false);
    });

    it('playerAttack = 0 returns immediate failure with no turns', () => {
        const result = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 0,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.totalTurns, 0);
        assert.equal(result.turns.length, 0);
        assert.equal(result.finalPlayerHp, 10); // no damage taken
        assert.equal(result.finalEnemyHp, 5); // no damage dealt
    });

    it('negative playerAttack treated same as 0', () => {
        const result = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: -5,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.totalTurns, 0);
    });

    it('RaP example: Player HP 6/8 ATK 2 vs Octorok HP 4/4 ATK 2, player_first', () => {
        const result = resolveCombat({
            playerHp: 6, playerMaxHp: 8, playerAttack: 2,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 2,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 4);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.totalTurns, 2);
    });

    it('one-shot kill (player attack >= enemy HP)', () => {
        const result = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 100,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 50,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.totalTurns, 1);
        assert.equal(result.finalPlayerHp, 5); // enemy died before attacking
    });

    it('exact damage kills on last possible turn', () => {
        // Player attack 2, enemy HP 4 = exactly 2 turns
        const result = resolveCombat({
            playerHp: 100, playerMaxHp: 100, playerAttack: 2,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.totalTurns, 2);
        assert.equal(result.finalEnemyHp, 0);
    });

    it('turn events have correct structure', () => {
        const result = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 2,
            enemyHp: 3, enemyMaxHp: 3, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const turn1 = result.turns[0];
        assert.equal(turn1.number, 1);
        assert.equal(turn1.events.length, 2); // both attack (enemy survived)
        assert.equal(turn1.events[0].actor, 'player');
        assert.equal(turn1.events[0].damage, 2);
        assert.equal(turn1.events[0].targetHp, 1); // enemy at 1/3
        assert.equal(turn1.events[1].actor, 'enemy');
        assert.equal(turn1.events[1].damage, 1);
        assert.equal(turn1.events[1].targetHp, 4); // player at 4/5
    });

    it('HP never goes below 0', () => {
        const result = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 1,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 999,
            turnOrder: 'player_first'
        });
        assert.equal(result.finalEnemyHp, 0); // not negative
        assert.equal(result.finalPlayerHp, 1); // enemy died first, didn't attack
    });
});


// ═════════════════════════════════════════════════════════════
// resolveCombat — determinism verification
// ═════════════════════════════════════════════════════════════

describe('resolveCombat — determinism', () => {
    it('same inputs always produce same output', () => {
        const state = {
            playerHp: 7, playerMaxHp: 10, playerAttack: 3,
            enemyHp: 6, enemyMaxHp: 6, enemyAttack: 2,
            turnOrder: 'player_first'
        };
        const r1 = resolveCombat(state);
        const r2 = resolveCombat(state);
        assert.equal(r1.playerWon, r2.playerWon);
        assert.equal(r1.finalPlayerHp, r2.finalPlayerHp);
        assert.equal(r1.totalTurns, r2.totalTurns);
    });

    it('outcome is predictable: ceil(enemyHP/playerATK) vs ceil(playerHP/enemyATK)', () => {
        // Player kills in ceil(6/3)=2 turns, enemy kills in ceil(7/2)=4 turns → player wins
        const result = resolveCombat({
            playerHp: 7, playerMaxHp: 10, playerAttack: 3,
            enemyHp: 6, enemyMaxHp: 6, enemyAttack: 2,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.totalTurns, 2);
    });
});


// ═════════════════════════════════════════════════════════════
// getPlayerAttackValue
// ═════════════════════════════════════════════════════════════

describe('getPlayerAttackValue', () => {
    it('picks highest attackValue item', () => {
        const items = {
            sword: { attackValue: 5, consumable: 'No' },
            dagger: { attackValue: 2, consumable: 'No' }
        };
        const inventory = { sword: 1, dagger: 3 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 5);
        assert.equal(result.itemId, 'sword');
        assert.equal(result.isConsumable, false);
    });

    it('skips items with quantity 0', () => {
        const items = {
            sword: { attackValue: 10, consumable: 'No' },
            dagger: { attackValue: 2, consumable: 'No' }
        };
        const inventory = { sword: 0, dagger: 1 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 2);
        assert.equal(result.itemId, 'dagger');
    });

    it('handles object format inventory', () => {
        const items = { axe: { attackValue: 7, consumable: 'Yes' } };
        const inventory = { axe: { quantity: 2 } };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 7);
        assert.equal(result.isConsumable, true);
    });

    it('returns 0 when no attack items', () => {
        const items = { potion: { attackValue: 0 }, shield: {} };
        const inventory = { potion: 5, shield: 1 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 0);
        assert.equal(result.itemId, null);
    });

    it('returns 0 for empty inventory', () => {
        const result = getPlayerAttackValue({}, {});
        assert.equal(result.attack, 0);
    });

    it('skips items not in item definitions', () => {
        const items = { sword: { attackValue: 5, consumable: 'No' } };
        const inventory = { sword: 1, deleted_item: 3 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 5);
        assert.equal(result.itemId, 'sword');
    });

    it('skips items with negative attackValue', () => {
        const items = { cursed: { attackValue: -5, consumable: 'No' } };
        const inventory = { cursed: 1 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 0);
    });

    it('identifies consumable correctly', () => {
        const items = {
            bomb: { attackValue: 10, consumable: 'Yes' },
            stick: { attackValue: 1, consumable: 'No' }
        };
        const inventory = { bomb: 1, stick: 1 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 10);
        assert.equal(result.isConsumable, true);
        assert.equal(result.itemId, 'bomb');
    });

    it('consumable with quantity 0 falls back to non-consumable', () => {
        const items = {
            bomb: { attackValue: 10, consumable: 'Yes' },
            stick: { attackValue: 1, consumable: 'No' }
        };
        const inventory = { bomb: 0, stick: 1 };
        const result = getPlayerAttackValue(items, inventory);
        assert.equal(result.attack, 1);
        assert.equal(result.isConsumable, false);
    });
});


// ═════════════════════════════════════════════════════════════
// buildCombatDisplay
// ═════════════════════════════════════════════════════════════

describe('buildCombatDisplay — structure', () => {
    const enemy = { name: 'Octorok', emoji: '🐙', description: 'A pesky octopus', hp: 4 };

    it('returns Container (type 17)', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 5,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.equal(display.type, 17);
    });

    it('green accent for victory', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 5,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.equal(display.accent_color, 0x57F287);
    });

    it('red accent for defeat', () => {
        const combat = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 1,
            enemyHp: 100, enemyMaxHp: 100, enemyAttack: 10,
            turnOrder: 'enemy_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.equal(display.accent_color, 0xED4245);
    });

    it('includes enemy name and emoji in header', () => {
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.ok(display.components[0].content.includes('🐙'));
        assert.ok(display.components[0].content.includes('Octorok'));
    });

    it('uses default emoji 🐙 when none provided', () => {
        const noEmoji = { name: 'Slime', hp: 1 };
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(noEmoji, combat, 'Reece');
        assert.ok(display.components[0].content.includes('🐙'));
    });

    it('includes description when present', () => {
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const allContent = display.components.map(c => c.content || '').join('\n');
        assert.ok(allContent.includes('A pesky octopus'));
    });

    it('omits description when not present', () => {
        const noDesc = { name: 'Blob', hp: 1 };
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(noDesc, combat, 'Reece');
        // Should have: header, separator, turns, separator, result, stats = 6 components
        // Without description it's 6, with description it's 7
        assert.equal(display.components.length, 6);
    });

    it('victory text includes "Victory"', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 10,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const allContent = display.components.map(c => c.content || '').join('\n');
        assert.ok(allContent.includes('Victory'));
    });

    it('defeat text includes "Defeat"', () => {
        const combat = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 1,
            enemyHp: 100, enemyMaxHp: 100, enemyAttack: 50,
            turnOrder: 'enemy_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const allContent = display.components.map(c => c.content || '').join('\n');
        assert.ok(allContent.includes('Defeat'));
    });

    it('includes stats summary line', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 5,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const lastContent = display.components[display.components.length - 1].content;
        assert.ok(lastContent.includes('turns'));
        assert.ok(lastContent.includes('HP remaining'));
    });
});


// ═════════════════════════════════════════════════════════════
// buildCombatDisplay — turn truncation
// ═════════════════════════════════════════════════════════════

describe('buildCombatDisplay — turn truncation', () => {
    const enemy = { name: 'Tank', emoji: '🛡️', hp: 100 };

    it('truncates combat with >8 turns to first 2 + last 2', () => {
        const combat = resolveCombat({
            playerHp: 50, playerMaxHp: 50, playerAttack: 5,
            enemyHp: 50, enemyMaxHp: 50, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        // 10 turns to kill enemy (50/5). Should truncate.
        assert.ok(combat.totalTurns > 8);
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const turnContent = display.components.find(c => c.content?.includes('Turn'));
        assert.ok(turnContent.content.includes('Turn 1'));
        assert.ok(turnContent.content.includes('Turn 2'));
        assert.ok(turnContent.content.includes('more turns of combat'));
    });

    it('does NOT truncate combat with <=8 turns', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 2,
            enemyHp: 6, enemyMaxHp: 6, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.ok(combat.totalTurns <= 8);
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        const allContent = display.components.map(c => c.content || '').join('\n');
        assert.ok(!allContent.includes('more turns of combat'));
    });
});


// ═════════════════════════════════════════════════════════════
// Two-phase execution logic (unit-testable portion)
// ═════════════════════════════════════════════════════════════

describe('Two-phase execution — fightResult override', () => {
    it('fightResult null preserves conditionsResult (no fight)', () => {
        const fightResult = null;
        const conditionsResult = true;
        const finalResult = fightResult !== null ? fightResult : conditionsResult;
        assert.equal(finalResult, true);
    });

    it('fightResult null preserves conditionsResult (conditions fail)', () => {
        const fightResult = null;
        const conditionsResult = false;
        const finalResult = fightResult !== null ? fightResult : conditionsResult;
        assert.equal(finalResult, false);
    });

    it('fightResult true overrides conditions', () => {
        const fightResult = true;
        const conditionsResult = false; // conditions failed but fight won
        const finalResult = fightResult !== null ? fightResult : conditionsResult;
        assert.equal(finalResult, true);
    });

    it('fightResult false overrides conditions', () => {
        const fightResult = false;
        const conditionsResult = true; // conditions passed but fight lost
        const finalResult = fightResult !== null ? fightResult : conditionsResult;
        assert.equal(finalResult, false);
    });
});
