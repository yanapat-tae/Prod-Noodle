import test from 'node:test';
import assert from 'node:assert/strict';
import { StaffSoundPlayer } from '../src/staff-sounds.ts';

function audioHarness() {
  const original = globalThis.AudioContext;
  const starts = [], contexts = [];
  class Context {
    currentTime = 0; state = 'running'; destination = {}; resumeWait = null;
    constructor() { contexts.push(this); }
    resume() { return this.resumeWait ?? Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createOscillator() {
      const node = { type: 'sine', frequency: { value: 0 }, connect() {}, disconnect() {}, stop() {}, addEventListener() {},
        start(at) { starts.push({ at, type: node.type, frequency: node.frequency.value }); } };
      return node;
    }
  }
  globalThis.AudioContext = Context;
  return { starts, contexts, restore: () => { globalThis.AudioContext = original; } };
}

test('A burst of order notifications cannot queue minutes of bells ahead of a payment', async () => {
  const audio = audioHarness(); const player = new StaffSoundPlayer();
  try {
    await player.enable();
    for (let i = 0; i < 40; i++) await player.play('order');
    await player.play('payment');
    const payment = audio.starts.find(note => note.type === 'triangle');
    assert.ok(payment.at < 2, `Payment cue was delayed until ${payment.at} seconds`);
    assert.ok(audio.starts.filter(note => note.type === 'sine').length <= 12, 'Coalesce the burst into bounded bell cues');
  } finally { player.dispose(); audio.restore(); }
});

test('An old playback failure after mute/re-enable cannot disable the new audio session', async () => {
  const audio = audioHarness(); const player = new StaffSoundPlayer();
  try {
    await player.enable();
    let rejectResume;
    audio.contexts[0].resumeWait = new Promise((_, reject) => { rejectResume = reject; });
    const pending = player.play('order');
    player.disable(); audio.contexts[0].resumeWait = null;
    await player.enable();
    rejectResume(new Error('old audio failure'));
    assert.equal(await pending, true, 'A superseded request must not report failure to the current UI');
    assert.equal(await player.play('payment'), true);
    assert.equal(audio.starts.filter(note => note.type === 'triangle').length, 4);
  } finally { player.dispose(); audio.restore(); }
});

test('Disabling sound while enable is pending prevents a late resume from enabling it', async () => {
  const audio = audioHarness(); const player = new StaffSoundPlayer();
  try {
    await player.enable(); player.disable();
    let resume;
    audio.contexts[0].resumeWait = new Promise(resolve => { resume = resolve; });
    const pending = player.enable();
    player.disable(); resume();
    assert.equal(await pending, false);
    await player.play('order');
    assert.equal(audio.starts.length, 0);
  } finally { player.dispose(); audio.restore(); }
});
