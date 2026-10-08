// The story sequencer's pure parts (code-world 4.8): once-only narrator lines, one line at a time, at most four waiting,
// hints dropped when busy, narrator lines never lost (the backlog), captions 2 s / 4 s.
import { describe, expect, it } from 'vitest';
import { CAPTION_HOLD, CAPTION_REPEAT, CaptionGuard, MAX_WAITING, PAIR_KEEP, STALE_SECONDS, STALE_SECONDS_LEFT, StoryQueue, URGENT_READ, countWord, lateOk, lineClass, neverStale, stemOf } from '../../src/world/story.ts';

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
    for (const k of ['nar_a', 'nar_b', 'nar_c', 'nar_d', 'nar_e']) q.say(k);
    run(q, 2);
    q.say('nar_seven'); q.say('nar_other');
    q.front('nar_event');
    run(q, 60 * 90);
    expect(started.slice(0, 2)).toEqual(['nar_a', 'nar_event']);
    expect(started).toContain('nar_seven');
    expect(dropped).toEqual(['nar_other']);
  });
  it('lines put in front on two moments are told in the order of the moments', () => {
    const { q, started } = stale(1);
    q.say('nar_room'); q.say('nar_wall');
    run(q, 1);
    q.front('nar_two_rise');                                // the knot is shot
    run(q, 5);
    q.front('nar_nine');                                    // the fight it started is over, a moment later
    run(q, 600);
    expect(started).toEqual(['nar_room', 'nar_two_rise', 'nar_nine', 'nar_wall']);
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

describe('release pass p0: urgent lines, and station lines the story stands on', () => {
  const make = (keep: (k: string) => boolean = () => false): { q: StoryQueue; started: string[]; ended: string[] } => {
    const started: string[] = [], ended: string[] = [], played = new Set<string>();
    const q = new StoryQueue(() => 4, (k) => played.has(k), (k) => { started.push(k); if (k.startsWith('nar_')) played.add(k); }, (k) => ended.push(k), { keep });
    return { q, started, ended };
  };
  it('an urgent line cuts a room description on screen and stands ahead of everything waiting', () => {
    const { q, started, ended } = make();
    q.say('nar_room'); run(q, 1); q.say('nar_wall'); q.front('nar_knot');
    run(q, 30);
    expect(q.current).toBe('nar_room');
    expect(q.urgent('nar_file_behind')).toBe('queued');
    expect(q.current).toBe('nar_file_behind');                 // on the tick it is asked for
    expect(ended).toEqual(['nar_room']);                       // the line cut counts as said
    run(q, 4 * 60 + 20);
    expect(started).toEqual(['nar_room', 'nar_file_behind', 'nar_knot']);
  });
  it('it never cuts a line the story stands on, another urgent line, or a line in its last second: then it is the very next', () => {
    const kept = make((k) => k === 'nar_plate_2');
    kept.q.say('nar_plate_2'); run(kept.q, 1); kept.q.front('nar_knot'); kept.q.say('nar_room');
    run(kept.q, 30);
    kept.q.urgent('nar_file');
    expect(kept.q.current).toBe('nar_plate_2');
    expect(kept.q.keyAt(0)).toBe('nar_file');                  // ahead of the line front() put there
    run(kept.q, 4 * 60);
    expect(kept.started).toEqual(['nar_plate_2', 'nar_file']);
    // two waves four seconds apart: the second line waits for the first, in order, ahead of the rest
    const two = make();
    two.q.say('nar_room'); run(two.q, 10);
    two.q.urgent('nar_file_behind'); two.q.front('nar_knot'); run(two.q, 60);
    two.q.urgent('nar_file_more'); two.q.urgent('nar_third');
    expect(two.q.current).toBe('nar_file_behind');
    expect([two.q.keyAt(0), two.q.keyAt(1), two.q.keyAt(2)]).toEqual(['nar_file_more', 'nar_third', 'nar_knot']);
    run(two.q, 1000);
    expect(two.started).toEqual(['nar_room', 'nar_file_behind', 'nar_file_more', 'nar_third', 'nar_knot']);
    // the last second of a line is left to it
    const late = make();
    late.q.say('nar_room'); run(late.q, 4 * 60 - 40);
    late.q.urgent('nar_file');
    expect(late.q.current).toBe('nar_room');
    run(late.q, 60);
    expect(late.q.current).toBe('nar_file');
  });
  it('an urgent narrator line is still said once only, and clear() forgets the urgent lines waiting', () => {
    const { q, started } = make((k) => k === 'nar_kept');
    q.urgent('nar_file'); run(q, 300);
    expect(q.urgent('nar_file')).toBe('dropped');
    q.say('nar_kept'); run(q, 5); q.urgent('nar_a'); q.clear();
    q.say('nar_b'); q.front('nar_c'); run(q, 20);
    expect(started).toEqual(['nar_file', 'nar_kept', 'nar_c']);
  });
  it('a station line the story stands on waits in the backlog when four are waiting; any other is dropped', () => {
    const { q, started } = make((k) => k === 'stn_tally_wake_2');
    q.say('nar_0'); run(q, 1);
    for (let i = 1; i <= 4; i++) q.say('nar_' + i);
    expect(q.say('stn_tally_wake_1')).toBe('dropped');
    expect(q.say('stn_tally_wake_2')).toBe('backlog');
    run(q, 6 * 4 * 60 + 200);
    expect(started.at(-1)).toBe('stn_tally_wake_2');
  });
});

describe('release pass p0: two urgent lines four seconds apart', () => {
  it('the second cuts the first once it has had three seconds (not a line the story stands on), so a wave is named within a second of it', () => {
    const started: [string, number][] = []; let t = 0;
    const q = new StoryQueue(() => 4.5, () => false, (k) => started.push([k, t]), () => {}, { keep: (k) => k === 'nar_plate_3' });
    const go = (n: number): void => { for (let i = 0; i < n; i++) { t++; q.tick(); } };
    q.say('nar_plate_3'); go(1);                              // lore the story stands on: on screen for 4.5 s
    go(150); q.urgent('nar_file_behind');                     // the rear pair: waits for the lore to end (2 s more)
    go(240); q.urgent('nar_file_more');                       // the door, 4 s after the pair: "behind" has been up about 1.8 s
    go(600);
    const at = Object.fromEntries(started);
    expect(started.map((s) => s[0])).toEqual(['nar_plate_3', 'nar_file_behind', 'nar_file_more']);
    expect((at.nar_file_behind as number) - 151).toBeLessThanOrEqual(4.5 * 60 - 150 + 16);
    // "behind" started about 2.3 s after its wave; "more" starts when "behind" has had 3 s: 1.3 s after its own wave, not 2.8
    expect(Math.abs((at.nar_file_more as number) - (at.nar_file_behind as number) - 3 * 60)).toBeLessThanOrEqual(1);
    expect((at.nar_file_more as number) - 391).toBeLessThanOrEqual(90);
  });
});

describe('pass i1: an urgent line that lets the line on screen be read first (URGENT_READ)', () => {
  const make = (keep: (k: string) => boolean = () => false): { q: StoryQueue; started: [string, number][]; ended: string[]; t: () => number; go: (n: number) => void } => {
    const started: [string, number][] = [], ended: string[] = [], played = new Set<string>();
    let now = 0;
    const q = new StoryQueue(() => 5, (k) => played.has(k), (k) => { started.push([k, now]); if (k.startsWith('nar_')) played.add(k); }, (k) => ended.push(k), { keep });
    return { q, started, ended, t: () => now, go: (n) => { for (let i = 0; i < n; i++) { now++; q.tick(); } } };
  };
  it('nothing on screen: at once', () => {
    const { q } = make();
    q.urgent('stn_wake', '', URGENT_READ);
    expect(q.current).toBe('stn_wake');
  });
  it('pass i2: a NARRATOR line on screen is never taken down by it: it is the very next line, and the line behind it follows', () => {
    const { q, started, ended, go } = make();
    q.say('nar_room'); go(60);
    expect(q.current).toBe('nar_room');
    q.urgent('stn_wake', '', URGENT_READ); q.front('stn_wake_2');
    go(Math.round(URGENT_READ * 5 * 60));                         // past two thirds of the five-second line (pass i1 cut it here)
    expect(q.current).toBe('nar_room');
    go(5 * 60 - 60 - Math.round(URGENT_READ * 5 * 60) + 17);      // the line's end and the breath after it
    expect(q.current).toBe('stn_wake');
    expect(ended).toEqual(['nar_room']);
    const at = (started.find((s) => s[0] === 'stn_wake') as [string, number])[1];
    expect(at).toBeGreaterThanOrEqual(5 * 60);                    // the room line had all of its five seconds
    go(5 * 60 + 20);
    expect(q.current).toBe('stn_wake_2');
  });
  it('a STATION line up for one second: it waits until that line has had two thirds of its time, then cuts it', () => {
    const { q, started, ended, go } = make();
    q.say('stn_ask'); go(60);
    q.urgent('nar_knot', '', URGENT_READ);
    expect(q.current).toBe('stn_ask');                           // not cut unread
    const READ = Math.round(URGENT_READ * 5 * 60);
    go(READ - 60 - 2);
    expect(q.current).toBe('stn_ask');
    go(4);
    expect(q.current).toBe('nar_knot');                          // at 3.25 s, not at five and a quarter
    expect(ended).toEqual(['stn_ask']);
    const at = (started.find((s) => s[0] === 'nar_knot') as [string, number])[1];
    expect(at).toBeGreaterThanOrEqual(READ);
    expect(at).toBeLessThanOrEqual(READ + 2);
  });
  it('a station line already up two thirds of its time is cut on the tick; a line the story stands on never is', () => {
    const a = make();
    a.q.say('stn_ask'); a.go(200);
    a.q.urgent('stn_wake', '', URGENT_READ);
    expect(a.q.current).toBe('stn_wake');
    const b = make((k) => k === 'nar_kept');
    b.q.say('nar_kept'); b.go(200);
    b.q.urgent('stn_wake', '', URGENT_READ);
    b.go(60);
    expect(b.q.current).toBe('nar_kept');
    b.go(60);
    expect(b.q.current).toBe('stn_wake');                        // the very next
    expect(b.started.map((s) => s[0])).toEqual(['nar_kept', 'stn_wake']);
  });
});

describe('pass i2: a line and its continuation are not parted (PAIR_KEEP)', () => {
  const make = (seconds = 5): { q: StoryQueue; started: string[]; go: (n: number) => void } => {
    const started: string[] = [], played = new Set<string>();
    const q = new StoryQueue(() => seconds, (k) => played.has(k), (k) => { started.push(k); if (k.startsWith('nar_')) played.add(k); }, () => {});
    return { q, started, go: (n) => { for (let i = 0; i < n; i++) q.tick(); } };
  };
  it('the stem of a key is the key without its number', () => {
    expect(stemOf('nar_pegs_1')).toBe('nar_pegs');
    expect(stemOf('nar_pegs_2')).toBe('nar_pegs');
    expect(stemOf('nar_tally_chair')).toBe('nar_tally_chair');
    expect(stemOf('nar_tally_chair_2')).toBe('nar_tally_chair');
    expect(stemOf('nar_cradle_2')).toBe(stemOf('nar_cradle'));
    expect(stemOf('nar_tally_wall')).not.toBe(stemOf('nar_tally_1'));
    expect(stemOf('nar_lamps_count')).not.toBe(stemOf('nar_lamps'));
    expect(PAIR_KEEP).toBe(1);
  });
  it('the Tally House at five seconds a shutter: the station wakes under the chair line and waits for both chair lines', () => {
    const { q, started, go } = make();
    q.say('nar_tally_chair'); q.say('nar_tally_chair_2'); q.say('nar_tally_cloth');
    go(60);
    q.urgent('stn_tally_wake_1', '', URGENT_READ); q.front('stn_tally_wake_2');
    go(60 * 40);
    expect(started).toEqual(['nar_tally_chair', 'nar_tally_chair_2', 'stn_tally_wake_1', 'stn_tally_wake_2', 'nar_tally_cloth']);
  });
  it('the peg stair: the watcher is looked at under "Coats on pegs": its two lines follow the peg pair, ahead of the third line', () => {
    const { q, started, go } = make();
    q.say('nar_pegs_1'); q.say('nar_pegs_2'); q.say('nar_ask');
    go(120);
    q.urgent('nar_watcher_1', '', URGENT_READ); q.front('nar_watcher_2');
    go(60 * 40);
    expect(started).toEqual(['nar_pegs_1', 'nar_pegs_2', 'nar_watcher_1', 'nar_watcher_2', 'nar_ask']);
  });
  it('the cradle: a station line said "now" under its first line goes behind its second, and in the breath between them too', () => {
    const a = make();
    a.q.front('nar_cradle'); a.q.front('nar_cradle_2');
    a.go(30);
    a.q.now('stn_ask_done');
    a.go(60 * 20);
    expect(a.started).toEqual(['nar_cradle', 'nar_cradle_2', 'stn_ask_done']);
    const b = make();
    b.q.front('nar_cradle'); b.q.front('nar_cradle_2');
    b.go(5 * 60 + 3);                                            // the first line is over: the breath before the second
    expect(b.q.current).toBe('');
    expect(b.q.pairWaiting).toBe(true);
    b.q.now('stn_ask_1'); b.q.urgent('nar_knot', '', URGENT_READ);
    b.go(60 * 20);
    expect(b.started).toEqual(['nar_cradle', 'nar_cradle_2', 'nar_knot', 'stn_ask_1']);
  });
  it('only the next continuation is held to its line: of three, the third may be parted', () => {
    const { q, started, go } = make();
    q.say('nar_tally_1'); q.say('nar_tally_2'); q.say('nar_tally_3');
    go(30);
    q.front('nar_first_seat');
    go(60 * 30);
    expect(started).toEqual(['nar_tally_1', 'nar_tally_2', 'nar_first_seat', 'nar_tally_3']);
  });
  it('a line about this second (plain urgent) still comes at once, and the pair goes on behind it', () => {
    const { q, started, go } = make();
    q.say('nar_pegs_1'); q.say('nar_pegs_2'); go(60);
    q.urgent('nar_file_more');
    expect(q.current).toBe('nar_file_more');
    go(60 * 12);
    expect(started).toEqual(['nar_pegs_1', 'nar_file_more', 'nar_pegs_2']);
  });
  it('a pair that has not started stays whole behind what is put in front of it', () => {
    const { q, started, go } = make();
    q.say('nar_room'); go(10);
    q.say('nar_tally_chair'); q.say('nar_tally_chair_2');
    q.urgent('stn_tally_wake_1', '', URGENT_READ); q.front('stn_tally_wake_2');
    go(60 * 30);
    expect(started).toEqual(['nar_room', 'stn_tally_wake_1', 'stn_tally_wake_2', 'nar_tally_chair', 'nar_tally_chair_2']);
  });
});

describe('pass i1: a line about two places (a trigger on the seam between two sets)', () => {
  it('is not stale four seconds after she has walked from the one into the other', () => {
    const started: string[] = [], dropped: string[] = [];
    const q = new StoryQueue(() => 5, () => false, (k) => started.push(k), () => {}, { onDrop: (k) => dropped.push(k) });
    q.scope = 'tally_house';
    q.say('nar_long'); q.tick();
    q.say('nar_room', 'tally_house'); q.tick();
    q.say('nar_pegs', 'tally_house', 'the_gallery');
    for (let i = 0; i < 20; i++) q.tick();
    q.scope = 'the_gallery';                                     // she is down the hatch
    for (let i = 0; i < 12 * 60; i++) q.tick();
    expect(started).toEqual(['nar_long', 'nar_pegs']);
    expect(dropped).toEqual(['nar_room']);                       // the room's own line is behind her
  });
});

describe('pass i3: PRESENT lines (about what she is looking at this second)', () => {
  const make = (opts: { moot?: (k: string) => boolean; stale?: number } = {}): { q: StoryQueue; started: string[]; dropped: string[]; go: (n: number) => void } => {
    const started: string[] = [], dropped: string[] = [], played = new Set<string>();
    const q = new StoryQueue(() => 5, (k) => played.has(k), (k) => { started.push(k); if (k.startsWith('nar_')) played.add(k); }, () => {}, { onDrop: (k) => dropped.push(k), moot: opts.moot, staleSeconds: opts.stale });
    return { q, started, dropped, go: (n) => { for (let i = 0; i < n; i++) q.tick(); } };
  };
  it('is the very next line: ahead of the continuation of the line on screen, and of everything that waits', () => {
    const { q, started, go } = make();
    q.say('nar_pegs_1'); q.say('nar_pegs_2'); q.say('nar_ask'); go(60);
    q.present('nar_watcher_1'); q.present('nar_watcher_2');
    expect(q.current).toBe('nar_pegs_1');                          // a narrator's line is never taken down for it
    go(60 * 30);
    expect(started).toEqual(['nar_pegs_1', 'nar_watcher_1', 'nar_watcher_2', 'nar_pegs_2', 'nar_ask']);
  });
  it('with part = false it stands behind ONE continuation (PAIR_KEEP), not behind every line of the same stem', () => {
    const { q, started, go } = make();
    q.say('nar_tally_1'); q.say('nar_tally_2'); q.say('nar_tally_3'); go(60);
    q.present('nar_tally_cloth', '', false);
    go(60 * 30);
    expect(PAIR_KEEP).toBe(1);
    expect(started).toEqual(['nar_tally_1', 'nar_tally_2', 'nar_tally_cloth', 'nar_tally_3']);
  });
  it('takes a station line or a hint that has been read off the screen; with nothing on screen it starts at once', () => {
    const a = make();
    a.q.say('stn_ask_1'); a.go(60 * 5 * URGENT_READ + 2);
    a.q.present('nar_embers_1');
    expect(a.q.current).toBe('nar_embers_1');
    const b = make();
    b.q.say('stn_ask_1'); b.go(30);
    b.q.present('nar_embers_1');
    expect(b.q.current).toBe('stn_ask_1');                         // not read yet: next
    b.go(60 * 5);
    expect(b.q.current).toBe('nar_embers_1');
    const c = make();
    c.q.present('nar_windlass_seen');
    expect(c.q.current).toBe('nar_windlass_seen');
  });
  it('is dropped unheard when its subject is behind her by its turn, and does not make stale what it stood in front of', () => {
    let gone = false;
    const { q, started, dropped, go } = make({ moot: (k) => k === 'nar_tally_cloth' && gone, stale: 12 });
    q.say('nar_a'); go(1); q.say('nar_wall'); go(60);
    q.present('nar_tally_cloth'); q.present('nar_kneeler');
    gone = true;                                                   // the cord is shot under nar_a
    go(60 * 30);
    expect(dropped).toEqual(['nar_tally_cloth']);
    // nar_wall waited 5 s behind nar_a and 5.25 behind the present line: inside its 12 s only because that time is allowed for
    expect(started).toEqual(['nar_a', 'nar_kneeler', 'nar_wall']);
  });
  it('an urgent line (a wave, this second) still stands ahead of it', () => {
    const { q, started, go } = make();
    q.say('nar_seal'); go(10);                                     // (kept: not cut) -> both wait
    const keep = new StoryQueue(() => 5, () => false, (k) => started.push('k:' + k), () => {}, { keep: (k) => k === 'nar_seal' });
    keep.say('nar_seal'); keep.tick();
    keep.urgent('nar_file_more'); keep.present('nar_watcher_1');
    for (let i = 0; i < 60 * 12; i++) keep.tick();
    expect(started.filter((k) => k.startsWith('k:'))).toEqual(['k:nar_seal', 'k:nar_file_more', 'k:nar_watcher_1']);
  });
});
