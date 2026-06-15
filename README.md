# Workshop-Que

Anonymous workshop questionnaire for **The Stories We Tell Our Machines**.

## Local Run

Create a `.env` file in the project root (it is gitignored):

```text
OPENAI_API_KEY=your-openai-key
COMFY_API_KEY=your-comfy-cloud-key
COMFY_BASE_URL=https://cloud.comfy.org
```

Then:

```bash
python server.py
```

Open:

```text
http://127.0.0.1:4173/
```

## Image generation (Comfy Cloud + Ideogram)

After analysis, the **Generate poster** button sends the response to [Comfy Cloud](https://cloud.comfy.org)
which runs `workflows/ideogram_poster_api.json` (Ideogram → SaveImage). The browser then overlays the
participant summary onto the returned image as crisp typography and offers a PNG download.

- Requires a **paid** Comfy plan (Standard/Creator/Pro) — the Free tier has no API access.
- Partner nodes (Ideogram, Flux, ...) consume prepaid credits and need the key passed both as the
  `X-API-Key` header **and** inside `extra_data.api_key_comfy_org` (the server does this automatically).
- Get a key at https://platform.comfy.org and set it as `COMFY_API_KEY`.

### Editing the workflow visually (for facilitators)

Two files describe the same graph:

| File | Format | Use |
|------|--------|-----|
| `workflows/ideogram_poster_visual.json` | Canvas/UI | Open & edit in the Comfy Cloud canvas |
| `workflows/ideogram_poster_api.json` | API | What the server actually submits |

To change the look, open the **visual** file in the Comfy Cloud canvas and edit the Ideogram node's
**prompt** (the reusable *style*) and parameters (aspect ratio, rendering speed, magic prompt, seed).
You can add nodes too. The server injects two things at runtime, so they are safe to leave alone:

- It **appends** each participant's `Themes: ... Seen from the perspective of a <role> ...` to the
  Ideogram prompt (so your style stays; the per-response text is added after it).
- It randomizes the Ideogram **seed** and sets a per-participant **SaveImage** `filename_prefix`.

Injection is matched by node *class* (`IdeogramV3` / `SaveImage`), so re-wiring or re-numbering nodes is
fine. Advanced: title a `PrimitiveStringMultiline` node **`WORKSHOP_DYNAMIC`** and the server fills *that*
node's value instead of appending to the Ideogram prompt — letting you place the dynamic text anywhere
(e.g. via a `StringConcatenate`). After editing, **Export (API)** and replace `ideogram_poster_api.json`.

## Deploy Notes

This project needs a Python backend because it stores responses in SQLite and calls OpenAI for analysis. Static hosting such as GitHub Pages will not run the full app.

For Render:

1. Create a new Blueprint/Web Service from this GitHub repo.
2. Use `python server.py` as the start command.
3. Add `OPENAI_API_KEY` and `COMFY_API_KEY` as secret environment variables.
4. `COMFY_BASE_URL` defaults to `https://cloud.comfy.org`.

Local SQLite data on free/ephemeral hosts may reset on redeploy unless persistent storage is configured.
