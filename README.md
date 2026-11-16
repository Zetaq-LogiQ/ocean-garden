# Ocean Garden

A dreamy underwater world you can swim through in your browser. Everything is made by code: no images, no 3D models, no sound files, one ~98 KB HTML file.

**Play:** https://zetaq-logiq.github.io/ocean-garden/ (Chrome or Edge, needs WebGPU)

This is a remix of [Abyssal Garden](https://github.com/Noniv/abyssal-garden) by Maksymilian Dendura (MIT licence), with:

- brighter, clearer turquoise water and warmer sunlight
- a new generative soundtrack: slow warm chords, a soft bell melody and a gentle bass

`original.html` is the untouched original for comparison.

## Controls

Mouse to look, `W` `A` `S` `D` to swim, `E` / `Q` up and down, `Shift` faster, `1`–`6` jump to viewpoints, `M` sound on/off, `Esc` menu. On a phone: hold a finger to swim, slide to steer.

## Build

Edit `source/src/*.js`, then:

```
cd source
npm install
node build.mjs
```

This writes `index.html`.
