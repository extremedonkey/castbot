import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate resolveCombat inline (pure logic, no file I/O)
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

// Replicate buildCombatDisplay inline (pure formatting)
function buildCombatDisplay(enemy, combatResult, playerName) {
    const enemyEmoji = enemy.emoji || '👹';
    const lines = [];
    lines.push(`## ${enemyEmoji} ${enemy.name} battle!`);
    if (enemy.description) lines.push(enemy.description);
    lines.push('');
    for (const turn of combatResult.turns) {
        lines.push(`**Turn ${turn.number}**`);
        for (const event of turn.events) {
            if (event.actor === 'player') {
                lines.push(`⚔️ ${playerName} attacks ${enemyEmoji} **${enemy.name}** for **${event.damage}** damage (${enemyEmoji} ${event.targetHp}/${event.targetMaxHp})`);
            } else {
                lines.push(`${enemyEmoji} **${enemy.name}** attacks ${playerName} for **${event.damage}** damage (❤️ ${event.targetHp}/${event.targetMaxHp})`);
            }
        }
        lines.push('');
    }
    if (combatResult.playerWon) {
        lines.push(`### ✅ Victory! ${enemyEmoji} **${enemy.name}** has been defeated!`);
    } else {
        lines.push(`### 💀 Defeat! You were beaten by ${enemyEmoji} **${enemy.name}**...`);
    }
    let content = lines.join('\n');
    return {
        type: 17,
        accent_color: combatResult.playerWon ? 0x57F287 : 0xED4245,
        components: [{ type: 10, content }]
    };
}

// Replicate getPlayerAttackValue logic inline (no I/O)
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


// ===== resolveCombat tests =====

describe('resolveCombat — player_first', () => {
    it('player wins when stronger', () => {
        const result = resolveCombat({
            playerHp: 6, playerMaxHp: 8, playerAttack: 3,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 2,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.finalPlayerHp, 4); // Turn 1: enemy 1/4, player 4/8. Turn 2: enemy 0/4, player not hit
        assert.equal(result.totalTurns, 2);
    });

    it('enemy does not attack on the turn it dies', () => {
        const result = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 10,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 100,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 1); // player survived because enemy died first
    });
});

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
        assert.equal(result.finalEnemyHp, 5); // enemy untouched
    });
});

describe('resolveCombat — simultaneous', () => {
    it('double KO when both die same turn', () => {
        const result = resolveCombat({
            playerHp: 2, playerMaxHp: 2, playerAttack: 2,
            enemyHp: 2, enemyMaxHp: 2, enemyAttack: 2,
            turnOrder: 'simultaneous'
        });
        assert.equal(result.playerWon, true); // enemy reached 0, so player "won"
        assert.equal(result.finalPlayerHp, 0);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.totalTurns, 1);
    });
});

describe('resolveCombat — edge cases', () => {
    it('50-turn safety cap, player loses', () => {
        const result = resolveCombat({
            playerHp: 9999, playerMaxHp: 9999, playerAttack: 1,
            enemyHp: 9999, enemyMaxHp: 9999, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.totalTurns, 50);
        assert.equal(result.playerWon, false); // neither dead, but cap reached = loss
    });

    it('playerAttack = 0 returns immediate failure', () => {
        const result = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 0,
            enemyHp: 5, enemyMaxHp: 5, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        assert.equal(result.playerWon, false);
        assert.equal(result.totalTurns, 0);
        assert.equal(result.turns.length, 0);
    });

    it('RaP example: Player HP 6/8 ATK 2 vs Octorok HP 4/4 ATK 2, player_first', () => {
        const result = resolveCombat({
            playerHp: 6, playerMaxHp: 8, playerAttack: 2,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 2,
            turnOrder: 'player_first'
        });
        // Turn 1: enemy 2/4, player 4/8
        // Turn 2: enemy 0/4, player not hit
        assert.equal(result.playerWon, true);
        assert.equal(result.finalPlayerHp, 4);
        assert.equal(result.finalEnemyHp, 0);
        assert.equal(result.totalTurns, 2);
    });
});


// ===== getPlayerAttackValue tests =====

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
});


// ===== buildCombatDisplay tests =====

describe('buildCombatDisplay', () => {
    const enemy = { name: 'Octorok', emoji: '🐙', description: 'A pesky octopus' };

    it('returns green accent for victory', () => {
        const combat = resolveCombat({
            playerHp: 10, playerMaxHp: 10, playerAttack: 5,
            enemyHp: 4, enemyMaxHp: 4, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.equal(display.type, 17);
        assert.equal(display.accent_color, 0x57F287);
        assert.ok(display.components[0].content.includes('Victory'));
    });

    it('returns red accent for defeat', () => {
        const combat = resolveCombat({
            playerHp: 1, playerMaxHp: 1, playerAttack: 1,
            enemyHp: 100, enemyMaxHp: 100, enemyAttack: 10,
            turnOrder: 'enemy_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.equal(display.accent_color, 0xED4245);
        assert.ok(display.components[0].content.includes('Defeat'));
    });

    it('includes enemy name and emoji', () => {
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(enemy, combat, 'Reece');
        assert.ok(display.components[0].content.includes('🐙'));
        assert.ok(display.components[0].content.includes('Octorok'));
    });

    it('uses default emoji when none provided', () => {
        const noEmoji = { name: 'Slime' };
        const combat = resolveCombat({
            playerHp: 5, playerMaxHp: 5, playerAttack: 5,
            enemyHp: 1, enemyMaxHp: 1, enemyAttack: 1,
            turnOrder: 'player_first'
        });
        const display = buildCombatDisplay(noEmoji, combat, 'Reece');
        assert.ok(display.components[0].content.includes('👹'));
    });
});
