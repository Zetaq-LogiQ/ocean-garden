// ============================================================================
// audio: procedural underwater music + ambience (no sample files)
// ============================================================================
// A fixed Web Audio graph, built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop.
// Music: a slow four-chord progression in D major (warm pads that cross-fade, a soft sine bass) with a bell melody
// made of short repeating motifs from the D major pentatonic. Ambience: surface wash, water rush (follows camera
// speed), occasional bubbles and a rare, quiet whale call.
let AC, OUT, muted = false;
const VOL = 0.8;
function mkSound(ac) {
  const sr = ac.sampleRate;
  // node of class C with options o, connected to every node / param in `to`; sources start at once
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop (the end cross-fades into the start)
  const nb = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  // reverb impulse: 6 s of noise that fades out and gets darker, a little brighter than before for the bells
  const ir = noise(6, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.06 + 0.6 * exp(-t * 1.6)); d[i] = b * (1 - exp(-t * 40)) * exp(-t * 1.1) * (1 - i / n); } });

  const lim = N(DynamicsCompressorNode, { threshold: -8, knee: 8, ratio: 12, attack: 0.004, release: 0.35 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, G(0.9, out));
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);

  // ---------------------------------------------------------------- ambience
  const rum = G(0.14, out); src(1, BQ('lowpass', 120, 0.7, rum)); lfo(0.07, 0.05, rum.gain);
  const wash = G(0.16, out), wave = G(1, wash), rush = G(0, out), rushF = BQ('bandpass', 300, 0.9, rush);
  src(0.63, BQ('bandpass', 520, 0.5, wave), rushF); lfo(0.09, 0.3, wave.gain); lfo(0.151, 0.25, wave.gain);

  // ---------------------------------------------------------------- music
  const music = G(1, out);
  // chords: [bass, four pad notes] in Hz. Dmaj9 - Bm11 - Gmaj9 - A6sus2
  const CH = [
    [73.42, 220.00, 277.18, 329.63, 369.99],
    [61.74, 185.00, 220.00, 293.66, 329.63],
    [98.00, 185.00, 246.94, 293.66, 440.00],
    [110.0, 246.94, 293.66, 329.63, 369.99],
  ];
  // melody notes: D major pentatonic A4..B5, consonant over every chord above
  const MEL = [440.00, 493.88, 587.33, 659.26, 739.99, 880.00, 987.77];
  const BEAT = 60 / 66, CHL = 8 * BEAT; // 66 bpm, one chord per 8 beats (about 7.3 s)

  // pads: two banks of four voices, each voice two slightly detuned triangles through a soft low-pass.
  // The idle bank is retuned while silent, then the banks cross-fade, so chord changes are smooth and click-free.
  const padF = BQ('lowpass', 1100, 0.5, music, G(1.1, wet)); lfo(0.05, 350, padF.frequency);
  const banks = [0, 1].map(() => {
    const g = G(0, padF);
    const vs = Array.from({ length: 4 }, () => { const vg = G(0.028, g); return [N(OscillatorNode, { type: 'triangle' }, vg), N(OscillatorNode, { type: 'triangle' }, vg)]; });
    return { g, vs };
  });
  // bass: one sine an octave below the chord root, with a slow swell
  const bassG = G(0, music, G(0.3, wet)), bassO = N(OscillatorNode, { frequency: 73.42 }, bassG);
  // bells: pooled voices, a sine plus a quiet sine an octave and a fifth up, short attack and a long ring
  const bells = Array.from({ length: 6 }, () => {
    const p = N(StereoPannerNode, {}, music, G(0.9, wet)), g = G(0, p);
    return { p, g, a: N(OscillatorNode, {}, g), b: N(OscillatorNode, {}, G(0.18, g)) };
  });
  const bell = (t, f, vol) => {
    const v = bells.shift(); bells.push(v);
    v.p.pan.setValueAtTime(rr(-0.5, 0.5), t);
    v.a.frequency.setValueAtTime(f, t); v.b.frequency.setValueAtTime(f * 3, t);
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(0, t);
    v.g.gain.linearRampToValueAtTime(vol, t + 0.008); v.g.gain.setTargetAtTime(0, t + 0.008, 0.9);
  };
  let bank = 0, chord = -1;
  const setChord = (t, i) => {
    const c = CH[i], nb2 = banks[bank ^= 1], ob = banks[bank ^ 1];
    nb2.vs.forEach((v, k) => { v[0].frequency.setValueAtTime(c[k + 1], t); v[1].frequency.setValueAtTime(c[k + 1] * 1.0035, t); });
    nb2.g.gain.setTargetAtTime(1, t, 1.2); ob.g.gain.setTargetAtTime(0, t, 1.2);
    bassO.frequency.setTargetAtTime(c[0], t, 0.4);
    bassG.gain.setValueAtTime(bassG.gain.value, t); bassG.gain.linearRampToValueAtTime(0.16, t + 1.5); bassG.gain.setTargetAtTime(0.07, t + 1.5, 2);
  };
  // melody: a motif of 3-5 notes on beat positions, played twice per chord and varied a little each chord,
  // with rests so it breathes. Steps move mostly by neighbour notes, which keeps it singable.
  let motif = [];
  const newMotif = () => {
    motif = []; let k = 2 + rnd() * 3 | 0;
    for (let b = 0; b < 4; b += rnd() < 0.6 ? 1 : 0.5) {
      if (rnd() < 0.72) { motif.push([b, k]); k = clamp(k + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.8 ? 1 : 2), 0, MEL.length - 1); }
    }
    if (!motif.length) motif.push([0, 3]);
  };
  const vary = () => { for (const m of motif) if (rnd() < 0.3) m[1] = clamp(m[1] + (rnd() < 0.5 ? -1 : 1), 0, MEL.length - 1); };

  let lt = ac.currentTime, t0 = lt + 0.5, nextChord = t0, tB = lt + 4, tW = lt + 40, lx = F[CX], ly = F[CY], lz = F[CZ];
  const queue = []; // [time, freq, vol] bells scheduled for this chord, played as the timer reaches them
  out.gain.setTargetAtTime(VOL, lt, 1.5);
  newMotif();
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 60) v = 0; // ignore jumps to a viewpoint
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    rush.gain.setTargetAtTime(0.4 * pow(min(v / 26, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(220 + v * 14, t, 0.3);
    const s = clamp(1 + ly / 30, 0, 1); wash.gain.setTargetAtTime(0.16 + 0.4 * s * s, t, 0.5);

    // next chord: retune the idle pad bank and lay out this chord's bell notes
    if (now + 0.3 > nextChord) {
      const tc = max(nextChord, t);
      chord = (chord + 1) % 4; setChord(tc, chord);
      if (chord === 0) newMotif(); else vary();
      const play = rnd() < 0.85; // now and then a chord passes with pads only
      if (play) for (let r = 0; r < 2; r++) for (const [b, k] of motif) queue.push([tc + (r * 4 + b) * BEAT + rr(0, 0.02), MEL[k], rr(0.05, 0.075) * (r ? 0.8 : 1)]);
      nextChord += CHL;
    }
    while (queue.length && queue[0][0] < now + 0.25) { const [tq, f, vol] = queue.shift(); bell(max(tq, t), f, vol); }

    if (t > tB) { // a few soft bubbles: short rising blips
      let tt = t;
      for (let n = 1 + rnd() * 3 | 0; n--;) { const f = rr(500, 1300); bell(tt, f, rr(0.008, 0.02)); tt += rr(0.08, 0.2); }
      tB = tt + rr(4, 12);
    }
    if (t > tW) { // a rare, quiet whale call: one slow downward glide on the oldest bell voice
      const w = bells.shift(), f = rr(220, 320); bells.push(w);
      w.a.frequency.setValueAtTime(f, t); w.a.frequency.exponentialRampToValueAtTime(f * 0.7, t + 3);
      w.b.frequency.setValueAtTime(f * 3, t); w.g.gain.cancelScheduledValues(t); w.g.gain.setValueAtTime(0, t);
      w.g.gain.linearRampToValueAtTime(0.03, t + 1.2); w.g.gain.setTargetAtTime(0, t + 1.6, 0.8);
      tW = t + rr(45, 90);
    }
  };
}
// called on every click / key / touch: builds the graph once and resumes it when the browser allows
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { muted = !muted; OUT.gain.setTargetAtTime(muted ? 0 : VOL, AC.currentTime, 0.08); };
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
