# Clarity — Learning Studio

[Live demo](https://clarity-learning-studio.netlify.app/) · [Source](https://github.com/Rolling-Log/clarity-learning-studio)

Turn complex reading into a podcast and an interactive visual guide. A UX design sprint exploring how people can understand difficult ideas with less effort.

Built with a restrained iris palette, a glass navigation bar, a continuous text-to-understanding Hero, and source-linked 3D explainers.

## Explore

Upload a PDF/TXT/Markdown file or paste text. Select **Quick Overview** for a concise, audio-first experience or **Deep Dive** for a visual-first explanation. Three small example pills sit below the upload form.

| Reviewed example | Default mode | Explore |
| --- | --- | --- |
| Inside a bicycle | Quick Overview · pasted text | Rotate the bicycle, inspect its drivetrain, change gears and cadence. |
| *Flatland*, Edwin A. Abbott | Deep Dive · complete book | Move a sphere through a plane, compare viewpoints and read all 22 sections. |
| *Flocks, Herds, and Schools*, Craig Reynolds | Deep Dive · original paper | Run a 3D flock, toggle local rules, inspect neighbors and adjust perception. |

The examples have English/Chinese interfaces, prepared system narration, measured audio chapter cues, original-source links and prepared contextual answers.

**Deployment scope:** the public site serves reviewed examples. Live model generation is intentionally disabled. Arbitrary uploaded text is not silently replaced by a sample. No model API key is required or shipped. The three bespoke scenes do not represent automatic generation of equally detailed 3D scenes from arbitrary documents.

## Run the Web deployment

Requires Node.js 22 or newer; the deployment has no npm runtime dependencies.

```sh
npm test
npm run build
npx netlify dev
```

Netlify reads `netlify.toml`, publishes `dist/`, and bundles `netlify/functions/clarity.mjs`. The function verifies the actual source hash, returns reviewed learning sessions and contextual answers, and serves guide/audio URLs. Upload parsing happens in the browser. Playback position, language and hosted question history stay in that browser; private uploads are not stored by this demonstration service.

The checked-in `prepared/catalogue.json` and `web/prepared/*.html` let Netlify build without Python, external model services or the author's local workspace.

## Architecture and upstream reuse

- **Open Notebook:** the included Python adapter uses the upstream source API, model transformations, podcast profiles/jobs/audio and source-chat endpoints in the local course workspace. The public demonstration uses reviewed exports and does not claim a cloud Notebook instance is running.
- **Open Intelligent UI:** the original `assembleDocument` renderer, shared design system and `sendPrompt` bridge render isolated Visual Guides. The original renderer is bundled in `vendor/`; the hosted guides are exported through that renderer.
- **Three.js:** local, pinned 3D scenes, procedural bicycle geometry, sphere sections and a real-time flock simulation. No 3D model CDN or image stand-ins.
- **PDF.js:** browser-side PDF text extraction.

Pinned upstream commits are recorded in `upstream-lock.json`. Licenses and source permissions are recorded in `THIRD_PARTY_NOTICES.md` and `licenses/`.

```text
web/                 Hero, upload form, player, bilingual UI and browser assets
explorables/         Bicycle / Flatland / Boids scene code
templates/           Isolated Visual Guide templates
prepared/            Reviewed session exports (no credentials or private uploads)
netlify/functions/   Budget-safe hosted example API
scripts/             Portable Web build and OIUI example exporter
tests/               Hosted API contracts and budget guards
server.py            Local FastAPI / Open Notebook adapter
guide.py             Source/citation validation and original OIUI assembly
```

The local Python service is supplied as integration source from the original `product-workspace/03-app/clarity` layout. It needs the upstream Notebook service and the workspace's ignored runtime configuration; Netlify does not run the Python/Windows speech stack. `scripts/prepare-hosted.py` regenerates the reviewed exports in that configured local environment without calling a model.

## Model limits

The bicycle uses ideal gearing with a 2.1 m wheel circumference. The unit sphere uses `r = sqrt(1 - h²)` within the sphere. The flock is a teaching interpretation with weighted steering, a fixed timestep, wrapping boundaries and a 270° field of view, rather than a complete reproduction of Reynolds's original flight dynamics. Its order metric is a live simulation measure, not an experimental result from the paper.

## License

Project code: MIT. Third-party code, fonts and source documents retain their own licenses and notices. The ACM paper is reproduced for this noncommercial educational demonstration under the permission notice retained in the original PDF; it is not covered by this repository's MIT license.
