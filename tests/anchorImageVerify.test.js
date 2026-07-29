/**
 * Anchor image verification — the guard against Discord silently failing to unfurl a
 * map image and never retrying.
 *
 * Background (2026-07-29): three of ~25 anchor edits inside one ~33-minute window came
 * back with `loading_state: 1` and stayed that way, against images Discord had served
 * fine for two days. Discord resolves a Media Gallery URL once, at edit time; a failure
 * there is permanent until something edits the message again. Hosts have no way to know
 * that, so a broken map image reads as "the bot is broken".
 *
 * isImageResolved is the pure decision function; the retry around it is I/O.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isImageResolved } from '../mapCellUpdater.js';

const gallery = (loadingState) => ({
  components: [{
    type: 17,
    components: [
      { type: 10, content: '## A1 — Somewhere' },
      { type: 12, items: [{ media: { url: 'https://cdn.discordapp.com/x.png', loading_state: loadingState } }] }
    ]
  }]
});

describe('anchor image verification — isImageResolved', () => {
  it('treats LOADED_SUCCESS (2) as resolved', () => {
    assert.equal(isImageResolved(gallery(2)), true);
  });

  it('treats LOADING (1) as UNresolved — this is the stuck state we repair', () => {
    assert.equal(isImageResolved(gallery(1)), false);
  });

  it('finds the gallery nested at any depth', () => {
    const deep = { components: [{ type: 17, components: [{ type: 17, components: [
      { type: 12, items: [{ media: { loading_state: 1 } }] }
    ]}]}] };
    assert.equal(isImageResolved(deep), false);
  });

  it('flags the message when ANY image in it is unresolved', () => {
    const mixed = { components: [{ type: 17, components: [
      { type: 12, items: [{ media: { loading_state: 2 } }, { media: { loading_state: 1 } }] }
    ]}]};
    assert.equal(isImageResolved(mixed), false);
  });

  it('treats a message with no gallery as fine — nothing to repair', () => {
    // Text-only anchors (no location image) must never trigger a pointless re-PATCH.
    assert.equal(isImageResolved({ components: [{ type: 17, components: [{ type: 10, content: 'x' }] }] }), true);
    assert.equal(isImageResolved({ components: [] }), true);
  });

  it('never throws on junk, missing fields, or a failed fetch result', () => {
    for (const junk of [null, undefined, {}, { components: null }, { components: [{ type: 12 }] }]) {
      assert.doesNotThrow(() => isImageResolved(junk));
      assert.equal(isImageResolved(junk), true); // unknown → assume fine, don't churn
    }
  });

  it('treats an unknown loading_state as resolved (only 1 means still loading)', () => {
    assert.equal(isImageResolved(gallery(0)), true);
    assert.equal(isImageResolved(gallery(undefined)), true);
  });
});
