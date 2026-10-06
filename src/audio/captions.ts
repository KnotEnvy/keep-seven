// Captions for sounds (GDD 17, ARCHITECTURE 3.6): audio raises every `cap_*` key with `story/say` when it starts the
// sound; world's sequencer guards the rate, UI displays. A key of design/story.json that is not here is a bug
// (tests/audio checks both directions).

/** key -> the sound(s) it belongs to (names as `recent()` reports them) and the event that starts them */
export const CAPTIONS: Readonly<Record<string, { sounds: readonly string[]; on: string }>> = {
  cap_bider_rattle: { sounds: ['bider_rattle', 'bider_bark'], on: 'enemy/telegraph (bider, lunge); enemy/state -> circle_strafe' },
  cap_bider_sits: { sounds: ['bider_breath'], on: 'enemy/freed' },
  cap_transit_clack: { sounds: ['transit_clack'], on: 'enemy/spawned (transit); its gait loop while it walks outside the view cone' },
  cap_transit_tone: { sounds: ['transit_tone'], on: 'enemy/telegraph (transit, aim)' },
  cap_stake: { sounds: ['stake_whirr'], on: 'projectile/spawned (stake)' },
  cap_tamper_hiss: { sounds: ['tamper_hiss'], on: 'enemy/telegraph (tamper, slam)' },
  cap_tamper_howl: { sounds: ['tamper_howl'], on: 'enemy/telegraph (tamper, charge)' },
  cap_tamper_pound: { sounds: ['tamper_pound'], on: 'vignette/state (vig_tamper, started)' },
  cap_chairs: { sounds: ['chairs_scrape'], on: 'audio/cue chairs_scrape' },
  cap_station_chime: { sounds: ['station_line'], on: 'the chime before the first story/line of the station in each zone' },
  cap_listening: { sounds: ['listen_lamps'], on: 'asking/listen with lit = 1' },
  cap_ratchet: { sounds: ['ratchet', 'run_down'], on: 'boss/indexing; boss/hush on; boss/defeated' },
  cap_canister: { sounds: ['canister_thump'], on: 'projectile/spawned (canister)' },
  cap_lance: { sounds: ['lance_tone'], on: 'boss/discharge (lance)' },
  cap_refill: { sounds: ['refill_gurgle'], on: 'boss/mouth (relit)' },
  cap_dry_click: { sounds: ['dry_click_big'], on: 'boss/discharge (dry), the first three of phase 3b' },
  cap_hum_stops: { sounds: ['hum_stops'], on: 'boss/proven' },
  cap_water_below: { sounds: ['water_below'], on: 'audio/cue water_below' },
  cap_gate: { sounds: ['gate_bang'], on: 'audio/cue gate_bang' },
  cap_shutter: { sounds: ['shutter_bang'], on: 'audio/cue shutter_bang' },
  cap_locker_chime: { sounds: ['locker_chime'], on: 'audio/cue locker_chime' },
  cap_fire_kindles: { sounds: ['fire_kindle'], on: 'ending/fire' },
  cap_wire_resolves: { sounds: ['wire_resolve'], on: 'audio/cue wire_resolve' },
};
export const CAPTION_KEYS: readonly string[] = Object.keys(CAPTIONS);
