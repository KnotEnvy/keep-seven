// The story sequencer's pure parts (code-world 4.8): once-only narrator lines, one line at a time, at most four waiting,
// hints dropped when busy, narrator lines never lost (the backlog), captions 2 s / 4 s.
import { describe, expect, it } from 'vitest';
import { CAPTION_HOLD, CAPTION_REPEAT, CaptionGuard, MAX_WAITING, STALE_SECONDS, STALE_SECONDS_LEFT, StoryQueue, countWord, lateOk, lineClass, neverStale } from '../../src/world/story.ts';

function queue(seconds = 1): { q: StoryQueue; started: string[]; ended: string[]; played: Set<string> } {
  const started: string[] = [], ended: string[] = [], played = new Set<string>();
  const q = new StoryQueue(() => seconds, (k) => played.has(k), (k) => { started.push(k); if (k.startsWith('nar_')) played.add(k); }, (k) => ended.push(k));
  return { q, started, ended, played };
}
const run = (q: StoryQueue, ticks: number): void => { for (let i = 0; i < ticks; i++) q.tick(); };

describe('StoryQueue', () => {
  it('classifies keys', () => {
    expect(lineClass('nar_open_1')).toBe('nar');
    expect(lineClass('hint_jugs_2')).toBe('hint');
    expect(lineClass('stn_ask_1')).toBe('other');
  });
  it('plays one line at a time, each for its seconds, in order', () => {
    const { q, started, ended } = queue(1);
    q.say('nar_a'); q.say('stn_b');
    run(q, 1);
    expect(started).toEqual(['nar_a']);
    run(q, 60);
    expect(ended).toEqual(['nar_a']);
    run(q, 16);
    expect(started).toEqual(['nar_a', 'stn_b']);
  });
  it('every nar_* key plays at most once per run; stn_* repeat', () => {
    const { q, started } = queue(0.1);
    q.say('nar_a'); run(q, 40); q.say('nar_a'); run(q, 40);
    q.say('stn_b'); run(q, 40); q.say('stn_b'); run(q, 40);
    expect(started).toEqual(['nar_a', 'stn_b', 'stn_b']);
    // the same narrator line asked twice while it waits is one line
    const b = queue(1);
    b.q.say('nar_x'); b.q.say('nar_x');
    run(b.q, 200);
    expect(b.started).toEqual(['nar_x']);
  });
  it('never more than four waiting; station lines past four are dropped, narrator lines wait in the backlog', () => {
    const { q, started } = queue(0.5);
    q.say('stn_0');
    run(q, 1);                                              // on screen
    for (let i = 1; i <= 4; i++) expect(q.say('stn_' + i)).toBe('queued');
    expect(q.count).toBe(MAX_WAITING);
    expect(q.say('stn_5')).toBe('dropped');
    expect(q.say('nar_6')).toBe('backlog');
    expect(q.say('nar_7')).toBe('backlog');
    expect(q.count).toBe(MAX_WAITING);
    run(q, 2000);
    expect(started).toEqual(['stn_0', 'stn_1', 'stn_2', 'stn_3', 'stn_4', 'nar_6', 'nar_7']);
    expect(q.peak).toBeLessThanOrEqual(MAX_WAITING);
  });
  it('hints are dropped whenever anything is on screen or waiting', () => {
    const { q, started } = queue(0.5);
    q.say('nar_a');
    expect(q.say('hint_x')).toBe('dropped');
    run(q, 1);
    expect(q.say('hint_x')).toBe('dropped');
    run(q, 200);
    expect(q.say('hint_x')).toBe('queued');
    run(q, 2);
    expect(started).toEqual(['nar_a', 'hint_x']);
  });
  it('front puts a line next; now replaces a station line on screen but never a narrator line', () => {
    const { q, started, ended } = queue(1);
    q.say('stn_q'); run(q, 1);
    q.say('nar_b');
    q.front('nar_a');
    q.now('stn_answer');                                   // the station line on screen is cut
    expect(ended).toEqual(['stn_q']);
    expect(q.current).toBe('stn_answer');
    run(q, 200);
    expect(started).toEqual(['stn_q', 'stn_answer', 'nar_a', 'nar_b']);
    const n = queue(1);
    n.q.say('nar_long'); run(n.q, 1);
    n.q.now('stn_answer');                                 // a narrator line is never cut: the answer is next
    expect(n.q.current).toBe('nar_long');
    run(n.q, 200);
    expect(n.started).toEqual(['nar_long', 'stn_answer']);
  });
});

// polish round 2: narrator lines went on playing one or two rooms late (a serial queue that never let go of a line)
describe('StoryQueue: stale lines', () => {
  const stale = (seconds = 5, keep: (k: string) => boolean = () => false): { q: StoryQueue; started: string[]; dropped: string[] } => {
    const started: string[] = [], dropped: string[] = [];
    const q = new StoryQueue(() => seconds, () => false, (k) => started.push(k), () => {}, { keep, onDrop: (k) => dropped.push(k) });
    return { q, started, dropped };
  };
  it('a batch said on one tick plays whole, however long it is: each line may wait for the ones before it', () => {
    const { q, started, dropped } = stale(6);
    q.scope = 'tally_house';
    for (const k of ['nar_a', 'nar_b', 'nar_c', 'nar_d', 'nar_e', 'nar_f']) q.say(k);      // 36 s of narration, two in the backlog
    run(q, 60 * 60);
    expect(started).toEqual(['nar_a', 'nar_b', 'nar_c', 'nar_d', 'nar_e', 'nar_f']);
    expect(dropped).toEqual([]);
  });
  it('a line that waited past its allowance behind other things is dropped, not played late', () => {
    const { q, started, dropped } = stale(6);
    q.scope = 'yard';
    for (const k of ['nar_room_1', 'nar_room_2', 'nar_room_3', 'nar_room_4', 'nar_room_5']) q.say(k);   // 31 s ahead
    run(q, 60);
    q.say('nar_late');                                      // a moment's line behind half a minute of description
    run(q, 60 * 60);
    expect(STALE_SECONDS).toBeLessThan(30);
    expect(started).not.toContain('nar_late');
    expect(dropped).toEqual(['nar_late']);
    expect(q.stale).toBe(1);
  });
  it('once she has left the place a line was said in, it goes stale after 4 s', () => {
    const { q, started, dropped } = stale(6);
    q.scope = 'yard';
    q.say('nar_yard_1'); q.say('nar_yard_2');
    run(q, 60);
    q.say('nar_yard_bell');                                 // would start about 12 s from now: inside 20 s, were she still there
    q.scope = 'tally_house';
    q.say('nar_tally_1');                                   // said in the new place
    run(q, 60 * 60);
    expect(STALE_SECONDS_LEFT).toBe(4);
    expect(dropped).toEqual(['nar_yard_bell']);
    // (nar_yard_2 was said with the line on screen: its allowance covers that line)
    expect(started).toEqual(['nar_yard_1', 'nar_yard_2', 'nar_tally_1']);
  });
  it('a load-bearing line is never dropped; front puts a line next, and what it delays may go stale', () => {
    const { q, started, dropped } = stale(6, (k) => k === 'nar_seven');
    q.scope = 'lip';
    for (const k of ['nar_1', 'nar_2', 'nar_3', 'nar_4', 'nar_5']) q.say(k);
    run(q, 2);
    q.say('nar_seven'); q.say('nar_other');
    q.front('nar_event');
    run(q, 60 * 90);
    expect(started.slice(0, 2)).toEqual(['nar_1', 'nar_event']);
    expect(started).toContain('nar_seven');
    expect(dropped).toEqual(['nar_other']);
  });
  it('lines put in front on two moments are told in the order of the moments', () => {
    const { q, started } = stale(1);
    q.say('nar_room_1'); q.say('nar_room_2');
    run(q, 1);
    q.front('nar_two_rise');                                // the knot is shot
    run(q, 5);
    q.front('nar_nine');                                    // the fight it started is over, a moment later
    run(q, 600);
    expect(started).toEqual(['nar_room_1', 'nar_two_rise', 'nar_nine', 'nar_room_2']);
    // and after they have gone, front is the head again
    q.say('nar_x'); q.say('nar_y'); run(q, 1); q.front('nar_z'); run(q, 300);
    expect(started.slice(4)).toEqual(['nar_x', 'nar_z', 'nar_y']);
  });
  it('flush drops what has not started, sparing the named keys; the load-bearing set of the stage', () => {
    const { q, started, dropped } = stale(1);
    q.say('nar_rim_3'); q.say('nar_rim_4'); q.say('nar_stone_1'); q.say('nar_lamps');
    run(q, 1);
    q.flush((k) => k.startsWith('nar_stone'));
    run(q, 600);
    expect(started).toEqual(['nar_rim_3', 'nar_stone_1']);
    expect(dropped).toEqual(['nar_lamps', 'nar_rim_4']);
    for (const k of ['nar_seven', 'nar_plate_2', 'nar_cradle', 'nar_cradle_2', 'nar_seal', 'nar_office', 'nar_kept', 'nar_first_seat', 'nar_first_fell', 'nar_stone_4', 'nar_take_2', 'nar_leave', 'nar_fire', 'nar_last', 'rv_ask', 'stn_proven']) expect(neverStale(k), k).toBe(true);
    for (const k of ['nar_transit', 'nar_file', 'nar_tamper_1', 'nar_tally_cloth', 'stn_ask_done', 'nar_two_rise', 'nar_rim_3']) expect(neverStale(k), k).toBe(false);
    // the rim's scenery lines may come late (the stone's go ahead of them) but are not spared by the ending's flush
    for (const k of ['nar_rim_1', 'nar_rim_2', 'nar_rim_3']) expect(lateOk(k), k).toBe(true);
    expect(lateOk('nar_lamps')).toBe(false);
  });
});

describe('countWord', () => {
  it('spells the lamp count as the narrator would say it, 0 to 48', () => {
    expect(countWord(9)).toBe('Nine');
    expect(countWord(37)).toBe('Thirty-seven');
    expect(countWord(0)).toBe('Zero');
    expect(countWord(20)).toBe('Twenty');
    expect(countWord(48)).toBe('Forty-eight');
    expect(countWord(13, false)).toBe('thirteen');
    for (let n = 0; n <= 48; n++) expect(countWord(n)).toMatch(/^[A-Z][a-z]+(-[a-z]+)?$/);
  });
});

describe('CaptionGuard', () => {
  it('holds 2 s and never shows the same key again within 4 s', () => {
    expect(CAPTION_HOLD).toBe(2);
    expect(CAPTION_REPEAT).toBe(4);
    const g = new CaptionGuard(['cap_a', 'cap_b']);
    expect(g.allow('cap_a', 10)).toBe(true);
    expect(g.allow('cap_a', 11)).toBe(false);
    expect(g.allow('cap_b', 11)).toBe(true);
    expect(g.allow('cap_a', 13.99)).toBe(false);
    expect(g.allow('cap_a', 14)).toBe(true);
    expect(g.allow('cap_unknown', 20)).toBe(false);
  });
});

describe('polish round 3: a line whose subject is over when its turn comes is not said', () => {
  it('moot is asked at the head of the queue, not when the line is said; a moot line is dropped even if it is one the story keeps', () => {
    const started: string[] = [], dropped: string[] = [];
    let cleared = false;
    const q = new StoryQueue(() => 2, () => false, (k) => started.push(k), () => {}, {
      keep: (k) => k === 'nar_two_rise', onDrop: (k) => dropped.push(k), moot: (k) => k === 'nar_two_rise' && cleared,
    });
    q.say('nar_a'); q.say('nar_two_rise'); q.say('nar_b');
    for (let i = 0; i < 60; i++) q.tick();
    cleared = true;                                        // the two sat down again while nar_a was still on screen
    for (let i = 0; i < 600; i++) q.tick();
    expect(started).toEqual(['nar_a', 'nar_b']);
    expect(dropped).toEqual(['nar_two_rise']);
  });
  it('and it is said when its subject still stands', () => {
    const started: string[] = [];
    const q = new StoryQueue(() => 2, () => false, (k) => started.push(k), () => {}, { moot: () => false });
    q.say('nar_a'); q.say('nar_two_rise');
    for (let i = 0; i < 600; i++) q.tick();
    expect(started).toEqual(['nar_a', 'nar_two_rise']);
  });
});
