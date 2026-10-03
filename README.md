# It Only Moves Where You Would Be

A hide-and-seek horror game where the creature hunting you is blind to the present: it can only chase its prediction of you.

**Play:** https://princesudaim.github.io/predictive-movement-horror-concept/

## How to play

- Move with **WASD** or the **arrow keys**; hold **Shift** to creep quietly.
- Collect all three relays and reach the gate.
- Break your habits at junctions to keep the creature's prediction away from you.
- Use **Space** or **Enter** to start or continue after being caught. Touch controls are available on small screens.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Create a production build with `npm run build`.

## Saves and fresh runs

Game state exists only in memory. A page reload starts a new game at the title screen; no browser save data is read, replaced, or deleted.

## Deployment

This is a client-side static Vite app. GitHub Actions builds it and deploys the `dist/` directory to GitHub Pages on pushes to `main`.
