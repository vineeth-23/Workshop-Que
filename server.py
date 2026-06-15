from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib import parse, request, error
from uuid import uuid4


ROOT = Path(__file__).resolve().parent


def load_dotenv(path=ROOT / ".env"):
    """Minimal .env loader so the app stays dependency-free."""
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
    except FileNotFoundError:
        pass


load_dotenv()

DB_PATH = ROOT / "responses.db"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
ANALYSIS_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")

# Comfy Cloud (https://docs.comfy.org/development/cloud/overview)
COMFY_BASE_URL = os.environ.get("COMFY_BASE_URL", "https://cloud.comfy.org").rstrip("/")
COMFY_API_KEY = os.environ.get("COMFY_API_KEY", "")
IMAGE_WORKFLOW_PATH = Path(
    os.environ.get("IMAGE_WORKFLOW_PATH", ROOT / "workflows" / "ideogram_poster_api.json")
)
# Node titles the server fills in; everything else is the professor's to edit in the canvas.
DYNAMIC_NODE_TITLE = os.environ.get("DYNAMIC_NODE_TITLE", "WORKSHOP_DYNAMIC")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "4173"))


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS responses (
                client_id TEXT PRIMARY KEY,
                participant_name TEXT,
                role_name TEXT,
                current_step TEXT,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                client_id TEXT PRIMARY KEY,
                participant_name TEXT,
                role_name TEXT,
                model TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                comfy_prompt_id TEXT,
                status TEXT NOT NULL,
                animation_prompt TEXT NOT NULL,
                raw_response_json TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                output_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def save_response(payload):
    client_id = str(payload.get("clientId", "")).strip()
    participant_name = str(payload.get("participantName", "")).strip() or client_id
    role = payload.get("assignedRole") or {}
    role_name = str(role.get("name", "")).strip()
    current_step = str(payload.get("currentStep", "")).strip()

    if not client_id:
        raise ValueError("Missing clientId")

    now = utc_now()
    payload_json = json.dumps(payload, ensure_ascii=False)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO responses (
                client_id, participant_name, role_name, current_step,
                payload_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                participant_name = excluded.participant_name,
                role_name = excluded.role_name,
                current_step = excluded.current_step,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            """,
            (client_id, participant_name, role_name, current_step, payload_json, now, now),
        )


def analysis_schema():
    factor = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "score": {"type": "number", "minimum": 0, "maximum": 100},
            "classification": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}},
            "interpretation": {"type": "string"},
            "recommendation": {"type": "string"},
        },
        "required": ["score", "classification", "evidence", "interpretation", "recommendation"],
    }

    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "participant_summary": {"type": "string"},
            "dominant_topics": {"type": "array", "items": {"type": "string"}},
            "matching_topic": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "care": factor,
                    "generosity": factor,
                    "profit_service": factor,
                    "societal_contribution": factor,
                    "retention": factor,
                    "trust": factor,
                    "nurturing": factor,
                    "indifference": factor,
                },
                "required": [
                    "care",
                    "generosity",
                    "profit_service",
                    "societal_contribution",
                    "retention",
                    "trust",
                    "nurturing",
                    "indifference",
                ],
            },
            "compassion_sentiment": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall": {"type": "string"},
                    "emotions": {"type": "array", "items": {"type": "string"}},
                    "evidence": {"type": "array", "items": {"type": "string"}},
                    "interpretation": {"type": "string"},
                },
                "required": ["overall", "emotions", "evidence", "interpretation"],
            },
            "propensity_to_show_care": factor,
            "societal_support": factor,
            "institutional_support": factor,
            "balance": factor,
            "cross_factor_links": {"type": "array", "items": {"type": "string"}},
            "risks_or_blind_spots": {"type": "array", "items": {"type": "string"}},
            "facilitator_notes": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "participant_summary",
            "dominant_topics",
            "matching_topic",
            "compassion_sentiment",
            "propensity_to_show_care",
            "societal_support",
            "institutional_support",
            "balance",
            "cross_factor_links",
            "risks_or_blind_spots",
            "facilitator_notes",
        ],
    }


def build_analysis_prompt(payload):
    return f"""
You are analyzing a participant's responses from an art/business/social-impact workshop called "The Stories We Tell Our Machines."

Analyze the responses deeply and carefully across these factors:
1. Matching topic: care, generosity, profit/service, societal contribution, retention, trust, nurturing, indifference.
2. Compassion sentiment: positive/negative, joy, anger, satisfaction, indifference, callousness, and other salient emotions.
3. Propensity to show care.
4. Societal support.
5. Institutional support.
6. Balance.

For every factor, explain how the participant's answers link to the factor. Use direct evidence from the response payload when possible.
Do not overclaim when answers are short. If evidence is missing, say that clearly in the evidence/interpretion fields.

Scoring rules:
- score must be a 0-100 percentage strength, not a 0-1 decimal and not a 1-5 rating.
- high or strong classifications should generally score 75-100.
- moderately_high should score 65-80.
- moderate should score 40-65.
- weak should score 15-40.
- no_match or very low should score 0-15.
- The score and interpretation must agree. Do not write "highly inclined" with a low score.

Questionnaire payload:
{json.dumps(payload, ensure_ascii=False, indent=2)}
""".strip()


def normalize_factor_score(factor):
    if not isinstance(factor, dict):
        return

    score = factor.get("score")
    if not isinstance(score, (int, float)):
        return

    classification = str(factor.get("classification", "")).lower()
    interpretation = str(factor.get("interpretation", "")).lower()

    if 0 <= score <= 1:
        factor["score"] = round(score * 100)
        return

    if 1 < score <= 5 and any(
        word in f"{classification} {interpretation}"
        for word in ["high", "strong", "moderate", "weak", "low", "no_match", "no match"]
    ):
        factor["score"] = round(score * 20)
        return

    if score < 20 and any(word in f"{classification} {interpretation}" for word in ["high", "strong", "highly"]):
        factor["score"] = 85


def normalize_analysis_scores(analysis):
    if not isinstance(analysis, dict):
        return analysis

    for factor in (analysis.get("matching_topic") or {}).values():
        normalize_factor_score(factor)

    for key in ["propensity_to_show_care", "societal_support", "institutional_support", "balance"]:
        normalize_factor_score(analysis.get(key))

    return analysis


def call_openai_analysis(payload):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    request_body = {
        "model": ANALYSIS_MODEL,
        "input": [
            {
                "role": "system",
                "content": (
                    "You are a careful qualitative research analyst. Return only valid JSON matching the schema. "
                    "Be nuanced, evidence-grounded, and avoid moralizing the participant."
                ),
            },
            {"role": "user", "content": build_analysis_prompt(payload)},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "workshop_response_analysis",
                "schema": analysis_schema(),
                "strict": True,
            }
        },
    }

    req = request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=90) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error: {detail}") from exc

    output_text = raw.get("output_text")
    if not output_text:
        for item in raw.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    output_text = content.get("text")
                    break
            if output_text:
                break

    if not output_text:
        raise RuntimeError("OpenAI response did not include output text")

    return normalize_analysis_scores(json.loads(output_text))


def save_analysis(payload, analysis):
    client_id = str(payload.get("clientId", "")).strip()
    participant_name = str(payload.get("participantName", "")).strip() or client_id
    role = payload.get("assignedRole") or {}
    role_name = str(role.get("name", "")).strip()

    if not client_id:
        raise ValueError("Missing clientId")

    now = utc_now()
    analysis_json = json.dumps(analysis, ensure_ascii=False)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO analyses (
                client_id, participant_name, role_name, model,
                analysis_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id) DO UPDATE SET
                participant_name = excluded.participant_name,
                role_name = excluded.role_name,
                model = excluded.model,
                analysis_json = excluded.analysis_json,
                updated_at = excluded.updated_at
            """,
            (client_id, participant_name, role_name, ANALYSIS_MODEL, analysis_json, now, now),
        )


def analyze_response(payload):
    save_response(payload)
    analysis = call_openai_analysis(payload)
    save_analysis(payload, analysis)
    return analysis


def top_topic_scores(analysis):
    topics = analysis.get("matching_topic") or {}
    scored = []
    for name, factor in topics.items():
        score = factor.get("score") if isinstance(factor, dict) else None
        if isinstance(score, (int, float)):
            scored.append((name.replace("_", " "), round(score)))
    return sorted(scored, key=lambda item: item[1], reverse=True)[:4]


def build_dynamic_prompt(payload, analysis):
    """The per-response text the app injects. The reusable style/visual direction
    lives in the STYLE_PROMPT node, which the professor edits in the canvas."""
    role = (payload.get("assignedRole") or {}).get("name", "participant")
    topics = ", ".join(name for name, _ in top_topic_scores(analysis)) or "care, trust, responsibility"

    return (
        f"Themes: {topics}. "
        f"Seen from the perspective of a {role} inside an AI customer-service system."
    )


def iter_nodes(workflow, *, title=None, class_type=None):
    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            continue
        if title is not None and (node.get("_meta") or {}).get("title") != title:
            continue
        if class_type is not None and node.get("class_type") != class_type:
            continue
        yield node_id, node


def load_image_workflow(dynamic_prompt, client_id):
    with IMAGE_WORKFLOW_PATH.open("r", encoding="utf-8") as workflow_file:
        workflow = json.load(workflow_file)

    seed = int.from_bytes(uuid4().bytes[:4], "big") % 2147483647

    # Inject the dynamic text by node title so professor edits / re-wiring don't break it.
    injected = False
    for _, node in iter_nodes(workflow, title=DYNAMIC_NODE_TITLE):
        node.setdefault("inputs", {})["value"] = dynamic_prompt
        injected = True

    # Randomize every Ideogram seed and stamp every SaveImage with a per-participant prefix.
    for _, node in iter_nodes(workflow, class_type="IdeogramV3"):
        # If there is no dedicated dynamic node, append the per-response text to whatever
        # style prompt the professor typed into the node (only when it's a plain string,
        # i.e. the prompt widget is not driven by a node connection).
        prompt = node.get("inputs", {}).get("prompt")
        if not injected and isinstance(prompt, str):
            style = prompt.strip()
            node["inputs"]["prompt"] = f"{style}\n\n{dynamic_prompt}" if style else dynamic_prompt
            injected = True
        node["inputs"]["seed"] = seed
    for _, node in iter_nodes(workflow, class_type="SaveImage"):
        node.setdefault("inputs", {})["filename_prefix"] = f"workshop/{client_id[:12]}"

    if not injected:
        raise RuntimeError(
            f'Workflow has no "{DYNAMIC_NODE_TITLE}" node and no Ideogram prompt widget to fill'
        )
    return workflow


def comfy_request(path, method="GET", data=None, timeout=30):
    body = None if data is None else json.dumps(data).encode("utf-8")
    headers = {}
    if COMFY_API_KEY:
        headers["X-API-Key"] = COMFY_API_KEY
    if body:
        headers["Content-Type"] = "application/json"

    req = request.Request(f"{COMFY_BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Comfy Cloud API error: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Comfy Cloud is not reachable at {COMFY_BASE_URL}") from exc

    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def submit_comfy_prompt(workflow):
    if not COMFY_API_KEY:
        raise RuntimeError("COMFY_API_KEY is not set")

    # Partner nodes (Ideogram, Flux, ...) require the key in the body as well as the header.
    data = {"prompt": workflow, "extra_data": {"api_key_comfy_org": COMFY_API_KEY}}
    result = comfy_request("/api/prompt", method="POST", data=data, timeout=60)

    node_errors = result.get("node_errors")
    if node_errors:
        raise RuntimeError(f"Comfy workflow error: {json.dumps(node_errors)}")
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise RuntimeError("Comfy Cloud did not return a prompt id")
    return prompt_id


def queue_comfy_image(payload, analysis):
    client_id = str(payload.get("clientId", "")).strip()
    if not client_id:
        raise ValueError("Missing clientId")

    dynamic_prompt = build_dynamic_prompt(payload, analysis)
    workflow = load_image_workflow(dynamic_prompt, client_id)
    generation_id = str(uuid4())
    prompt_id = submit_comfy_prompt(workflow)

    now = utc_now()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO generations (
                id, client_id, comfy_prompt_id, status, animation_prompt,
                raw_response_json, analysis_json, output_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                generation_id,
                client_id,
                prompt_id,
                "queued",
                dynamic_prompt,
                json.dumps(payload, ensure_ascii=False),
                json.dumps(analysis, ensure_ascii=False),
                None,
                now,
                now,
            ),
        )

    return {"id": generation_id, "promptId": prompt_id, "status": "queued"}


def find_image_outputs(job):
    outputs = []
    for node_output in (job.get("outputs") or {}).values():
        for image in node_output.get("images") or []:
            filename = image.get("filename")
            if not filename:
                continue
            query = parse.urlencode(
                {
                    "filename": filename,
                    "subfolder": image.get("subfolder", ""),
                    "type": image.get("type", "output"),
                }
            )
            outputs.append({**image, "url": f"/api/comfy-media?{query}"})
    return outputs


def persist_generation(prompt_id, status, job):
    now = utc_now()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            UPDATE generations
            SET status = ?, output_json = ?, updated_at = ?
            WHERE comfy_prompt_id = ?
            """,
            (status, json.dumps(job, ensure_ascii=False), now, prompt_id),
        )


def update_generation_status(prompt_id):
    status_info = comfy_request(f"/api/job/{parse.quote(prompt_id)}/status", timeout=20)
    state = str(status_info.get("status", "")).lower()

    if state == "error":
        message = status_info.get("error_message") or "Comfy Cloud generation failed"
        persist_generation(prompt_id, "failed", status_info)
        return {"status": "failed", "outputs": [], "error": message}

    if state != "success":
        return {"status": "running", "outputs": []}

    job = comfy_request(f"/api/jobs/{parse.quote(prompt_id)}", timeout=30)
    outputs = find_image_outputs(job)
    status = "completed" if outputs else "running"
    persist_generation(prompt_id, status, job)
    return {"status": status, "outputs": outputs}


class WorkshopHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            self.send_json(200, {"ok": True, "database": str(DB_PATH)})
            return
        parsed_path = parse.urlparse(self.path)
        if parsed_path.path == "/api/image-status":
            query = parse.parse_qs(parsed_path.query)
            prompt_id = (query.get("promptId") or [""])[0]
            if not prompt_id:
                self.send_json(400, {"ok": False, "error": "Missing promptId"})
                return
            try:
                status = update_generation_status(prompt_id)
                self.send_json(200, {"ok": True, **status})
            except RuntimeError as exc:
                self.send_json(503, {"ok": False, "error": str(exc)})
            return
        if parsed_path.path == "/api/comfy-media":
            target = f"{COMFY_BASE_URL}/api/view?{parsed_path.query}"
            headers = {"X-API-Key": COMFY_API_KEY} if COMFY_API_KEY else {}
            try:
                media_req = request.Request(target, headers=headers)
                with request.urlopen(media_req, timeout=30) as response:
                    body = response.read()
                    content_type = response.headers.get("Content-Type", "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                self.send_json(404, {"ok": False, "error": "Media not found"})
            return
        if self.is_blocked_static_path(parsed_path.path):
            self.send_error(404, "Not found")
            return
        super().do_GET()

    @staticmethod
    def is_blocked_static_path(path):
        # Never serve the database, secrets, dotfiles, or source via static hosting.
        segments = [segment for segment in path.split("/") if segment]
        if any(segment.startswith(".") for segment in segments):
            return True
        basename = segments[-1].lower() if segments else ""
        return basename.endswith((".db", ".sqlite", ".sqlite3", ".env", ".py", ".pyc"))

    def do_POST(self):
        if self.path not in {"/api/responses", "/api/analyze", "/api/generate-image"}:
            self.send_error(404, "Not found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
            if self.path == "/api/responses":
                save_response(payload)
                self.send_json(200, {"ok": True})
            elif self.path == "/api/analyze":
                analysis = analyze_response(payload)
                self.send_json(200, {"ok": True, "analysis": analysis})
            else:
                response_payload = payload.get("response") or {}
                analysis = payload.get("analysis") or {}
                save_response(response_payload)
                save_analysis(response_payload, analysis)
                generation = queue_comfy_image(response_payload, analysis)
                self.send_json(200, {"ok": True, **generation})
        except ValueError as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
        except RuntimeError as exc:
            self.send_json(503, {"ok": False, "error": str(exc)})
        except Exception:
            self.send_json(500, {"ok": False, "error": "Unable to process request"})


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), WorkshopHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    print(f"Writing responses to {DB_PATH}")
    print(f"Analysis model: {ANALYSIS_MODEL}")
    print(f"Comfy Cloud: {COMFY_BASE_URL}  (API key {'set' if COMFY_API_KEY else 'MISSING'})")
    server.serve_forever()
