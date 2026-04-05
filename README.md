# ARTEMIS II — Nothing Tracker

Real-time 3D tracker for NASA's Artemis II mission with a Nothing-inspired design system.

## Features

- **3D Visualization** — Earth and Moon as wireframe spheres, Orion capsule as a glowing red dot with trajectory trail
- **Crew POV** — Camera positioned at Orion looking back at Earth, showing the "Overview Effect" as the planet shrinks
- **Dense Telemetry** — Distance to Earth/Moon, velocity, altitude, angular diameter, mission phase
- **Timeline** — Scrubable timeline with phase markers and time warp controls (1x to 10,000x)
- **Crew Roster** — Wiseman (CDR), Glover (PLT), Koch (MS1), Hansen (MS2/CSA)

## Tech

Zero build tools. Vanilla HTML + CSS + JS.

- Three.js r128 via CDN
- Trajectory data pre-baked from JPL Horizons API (COMMAND=-1024 for Orion, 301 for Moon)
- Ecliptic J2000 geocentric coordinates, km
- Design system: Nothing (Space Grotesk + Space Mono + Doto, OLED black, monochrome + red accent)

## Data

Ephemeris window: April 2–10, 2026 (30-min steps for Orion, 30-min for Moon).

## Deploy

Push to `main` → GitHub Pages via Actions workflow.
