# Portfolio

**Live site:** [portfolio-1aj.pages.dev](https://portfolio-1aj.pages.dev)

Devansh Verma's portfolio: a live-broadcast home page built around a 1:18 model of the 2013 championship car, which drives a lap past his milestones as you scroll, plus a plain `/highlights` page for recruiters.

Built with Next.js (static export), React Three Fiber and Blender.

## Run it

```bash
npm run dev      # http://localhost:3000
npm run build    # static site in out/
npm start        # serve the build locally
```

`out/` can be hosted on any static host (Vercel, Netlify, S3 + CloudFront, GitHub Pages).

## Your details

Everything personal lives in `src/content/site.ts`. Anything left as `null` or `[]` shows up on the site as a clearly marked empty slot. For the resume, put the PDF in `public/` and set `resumeUrl` to its path (for example `/resume.pdf`).

## The car

The home page shows **“Red Bull RB9” by JUST GAME** ([Sketchfab](https://sketchfab.com/3d-models/red-bull-rb9-3c44792002c94d3887ebdce30cfec797), listed as CC BY 4.0), used exactly as downloaded: `public/models/rb9-sketchfab.glb`, with its original logos, textures and materials. The site only scales it to 1:18, stands it on the base and opens its DRS flap. The credit line on the home page is required by that licence.

Before publishing it, note that the uploader says in the model's Sketchfab comments that it was ripped from Assetto Corsa, so the CC BY listing may not be theirs to give, and it carries Red Bull, Infiniti, Total, Pirelli and other sponsors' logos.

`/?car=built` shows the logo-free car instead. `blender/build_rb9_figurine.py` builds it from the car's published dimensions and exports `public/models/rb9.glb`, using the car's colours only. To rebuild it (needs Blender on your PATH):

```bash
npm run figurine
```

For Blender preview renders, add `--preview <folder>` after the `--` in that script's command.

Material names in `rb9.glb` are matched to the web materials in `src/components/scene/materials.ts`, so its colours and finishes can be tuned there without re-exporting.

## Backdrops

The home page has a temporary **Backdrop** switcher (Studio, Pit lane, Start grid, Back straight) until one is chosen. The same choice works as a link: `/?bg=pit`, `/?bg=grid` or `/?bg=straight`.

The studio shows the 1:18 figurine on its display base. The three track backdrops show the car full size at Zwartkops Raceway, from Poly Haven's CC0 360° photos:

- The photo lights the car and is projected onto the ground the car stands on.
- The camera stays where the photo was taken, the one spot where a projected photo isn't distorted.
- Dragging turns the car instead of the camera, and the scroll wheel zooms.

`scripts/build_backdrops.py` turns Poly Haven's HDR photos into web-sized files in `public/backdrops/`: a 1K HDR for lighting, plus 1536 and 1024 px cube-map faces for the backdrop. It downloads the 8K sources (about 100 MB each) once into `.cache/`, which is never deployed. To rebuild (needs [uv](https://docs.astral.sh/uv/)):

```bash
npm run backdrops
```

Images the project makes are kept under 2000 px on each side. The one exception is the downloaded car's body texture (2048 px), left as downloaded.

## Posters

`public/poster.jpg` (1920×1080) and `public/poster-portrait.jpg` (900×1948) replace the 3D scene on devices that can't run WebGL. After changing the car or the scene, re-capture them (needs Google Chrome):

```bash
npm run posters
```

## Layout

The home page is one continuous broadcast. The 3D stage is fixed behind the page: lights out on the opening shot, a cut to the circuit for the lap, then the written coverage scrolls in over the parked car (on wide screens the car sits to the right of the text while the scene dims behind it). The broadcast bar, sector rail and ticker stay on screen throughout, and the page switches from the RACE channel (the work) to the MATCH channel (the personal half) at About. While you read, the scene only renders when something moves.

- `src/components/home/`: the opening shot, the lap's captions and track map (`Lap.tsx`), broadcast bar, sector rail, channel change, ticker and start lights
- `src/components/coverage/`: the portfolio content, shared by the home page and `/highlights` (the plain, no-3D version)
- `src/components/graphics/`: the data graphics, the strategy chart and the proof map
- `src/components/scene/`: 3D stage (studio lighting, display case, car, track backdrops, the circuit in `circuit/`, camera, scroll choreography in `FlowDirector.tsx`, effects)
- `src/lib/flow.ts`: scroll tracking; `src/lib/sectors.ts`: the sector list
- `src/lib/lap.ts`: the circuit and the lap plan (see below)
- `src/lib/drivetrain.ts`, `src/lib/engine-audio.ts`: the lap car's gears and its synthesised engine sound
- `src/lib/stage-store.ts`: state shared between the page and the scene
- `src/lib/backdrops.ts`, `src/lib/cars.ts`: the backdrops and the two cars

## The lap

Scrolling past the opening shot cuts to a procedural circuit, and the car drives one lap as you scroll. Scroll only picks the next gantry: the car then drives there on its own clock (about three seconds), brakes, parks, and only then does the caption come up, so every milestone gets a proper stop however you scroll. It holds at least a moment at each gantry before moving on; scroll far ahead and it jump-cuts to the stretch before your target, scroll back and it cuts straight there. It pulls up at a gantry for each entry in `site.lap`: the board shows the entry's `headline` and `unit` (what the number counts) and lights up as its caption comes on screen, the caption below shows the full line, and the bar and track map show which turn you're at. The ‹ › buttons under the track map, or the ← → keys, jump to the previous or next gantry. Add or remove an entry and the gantries are re-spaced round the lap to match. On narrow screens the panel keeps only the skills meter and the ‹ › buttons, so the board and caption have the screen.

`src/lib/lap.ts` is plain math with no three.js: the track's centre line (a closed spline), where the gantries stand, which gantry the scroll position asks for and how long each drive takes. The 3D scene and the track map both read it. The circuit itself (track, kerbs, barriers, grandstand, trees, gantry boards drawn in the page's own fonts, the camera) is in `src/components/scene/circuit/`.

**Skills on the lap.** A milestone with a `place` proves the skills whose `where` list names that place (the same links as the proof map). Its caption lists them, flagging the ones proven there for the first time, and the meter in the onboard panel counts skills as they light up; the flag shows the full set, including any the lap never reaches.

**The director.** Parked at a gantry, the camera holds a still reading frame: on the board's own axis behind the car, so the board sits square-on in the upper third with the car below it, clear of the caption (on a phone held upright it rises and tilts down, so the board sits just under the bar). Each drive is one continuous camera move: it holds and pans as the car pulls away, swings out to ride three-quarters behind it (on alternate sides), and lands on the next reading frame as the car brakes. Letterbox bars and a vignette come in for the drive only, and the board flashes as the car arrives. Going back, or far ahead, is a jump cut. All of it is in `LapRig` (`src/components/scene/circuit/Circuit.tsx`); the bars are the `--cine` layer in `Lap.tsx`.

With reduced motion, without WebGL, or before the page's script has loaded, the milestones show as a plain list instead.

While the car drives, the panel above the track map shows its onboard telemetry (speed, gear, shift lights, throttle and brake). That's the 3D car's own motion, its speed scaled to a race-car range and geared by `src/lib/drivetrain.ts` (eight gears, shift points, blips on the way down), the same model the engine sound runs, so the gear and the shift lights match what you hear. It isn't data about anything.

**Onboard audio** (the speaker button in the top bar) is off until someone clicks it. It's synthesised in the browser with the Web Audio API (`src/lib/engine-audio.ts`), with no recordings to license: a 2.4-litre V8 voiced at its firing frequency through an exhaust resonance, with exhaust rasp, the crack of each upshift's ignition cut, pops on the overrun when the driver lifts, a lumpy idle when parked, and wind with speed. The scene tells it where the car is from the camera, so it's louder and brighter close up, pans across the stereo field and drops in pitch as the car pulls away (Doppler). It runs on its own 25 ms clock from the car's actual speed, so it reacts the moment the car moves. A team-radio blip plays as each caption comes up. It fades out away from the lap and in the coverage, and goes quiet when the tab is hidden.

## Plain language

Jargon is explained where it appears: hover or focus a dotted term (TLS 1.3, OPAQUE, demographic parity, vLLM…) for a one-line definition, and every stack chip and skill chip has one too. The definitions live in `src/content/glossary.ts` and explain what a thing is in general, never a claim about the work. The first mention of each term in a block of text is marked automatically (`Glossed`, `src/components/glossary/`); screen readers get the same definition through `aria-describedby`. Each skill also has an `about` line in `site.ts`, and each data graphic a `tip` that says how to read it.

## Data graphics

Each milestone, project and award can carry a `graphic` in `site.ts`: a podium, a unit chart (one mark per person, unit or lakh), the papers by year, a stack by role, a flow diagram, a span of years, a measured range, the password vault or the AES keyspace. They're drawn by `src/components/graphics/Graphic.tsx` as plain HTML and SVG, build in when they come on screen, and are hidden from screen readers because the text beside each one says the same thing. The rule for adding one: every number and label in it must already be in the text next to it. The numbers in the stat band get a small mark of their own the same way (`glyph`, drawn by `StatGlyph.tsx`).

Two charts are drawn straight from the content: the strategy chart in Experience (`StintChart.tsx`, one stint per role from its `period`, by year only) and the proof map in Skills (`ProofMap.tsx`, each skill wired to the places in its `where` list). The proof map shows on wide screens; narrow screens and screen readers get the skills list. The About section opens with a team sheet (`TeamSheet.tsx`, from `site.teamSheet`): a few short lines lifted from the paragraphs under it. Under the Profile thesis, its three examples (`site.calls`) each link to the project card they come from.
