# Workshop-Que

Anonymous workshop questionnaire for **The Stories We Tell Our Machines**.

## Local Run

```bash
OPENAI_API_KEY="your-key" python server.py
```

Open:

```text
http://127.0.0.1:4173/
```

## Deploy Notes

This project needs a Python backend because it stores responses in SQLite and calls OpenAI for analysis. Static hosting such as GitHub Pages will not run the full app.

For Render:

1. Create a new Blueprint/Web Service from this GitHub repo.
2. Use `python server.py` as the start command.
3. Add `OPENAI_API_KEY` as a secret environment variable.
4. Optionally set `COMFYUI_URL` if using a hosted ComfyUI endpoint.

Local SQLite data on free/ephemeral hosts may reset on redeploy unless persistent storage is configured.
