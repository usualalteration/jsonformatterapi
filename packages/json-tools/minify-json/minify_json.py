"""
Azione: json-tools/minify-json
Scopo: minimizzare (minify) un documento JSON ricevuto via HTTP.

Il wrapper generato (__main__.py) invoca `main(args, ctx=ctx)` e racchiude il
valore restituito in `{"body": <valore>}`. Per garantire che la risposta sia
servita con Content-Type: application/json (richiesto dalla specifica), il
modulo restituisce un oggetto JSON `{"ok": true, "output": <testo minimizzato>}`:
il wrapper lo pone nel body e OpenServerless lo serializza come application/json.
In caso di errore restituisce {"ok": false, "error": "<msg>"}.

Modalita' di invio del JSON (documentate nel README):
  1. Raw text  -> Content-Type: text/plain, body = testo JSON.
  2. Envelope  -> Content-Type: application/json, body = {"input": "<testo json>"}.
  3. Parsed    -> Content-Type: application/json, body = oggetto JSON valido.
"""

import json


def _content_type(args):
    """Restituisce il Content-Type della richiesta (lowercase) se presente."""
    headers = args.get("__ow_headers") if isinstance(args, dict) else None
    if isinstance(headers, dict):
        for key in ("content-type", "Content-Type", "CONTENT-TYPE"):
            if key in headers:
                return str(headers[key]).lower()
    return ""


def _get_json_text(args):
    """Estrae il testo JSON da processare (vedi validate_json per i dettagli)."""
    if not isinstance(args, dict):
        return ""

    ct = _content_type(args)
    is_json_ct = "application/json" in ct
    raw = args.get("__ow_body")

    if is_json_ct:
        if isinstance(raw, dict):
            env = raw.get("input")
            if isinstance(env, str) and env.strip():
                return env
            try:
                return json.dumps(raw)
            except (TypeError, ValueError):
                pass
        elif raw is not None and not (isinstance(raw, str) and raw == ""):
            try:
                return json.dumps(raw)
            except (TypeError, ValueError):
                pass
    else:
        if isinstance(raw, (bytes, bytearray)):
            try:
                raw = raw.decode("utf-8")
            except Exception:
                raw = ""
        if isinstance(raw, str) and raw.strip():
            return raw

    env = args.get("input")
    if isinstance(env, str) and env.strip():
        return env
    body = args.get("body")
    if isinstance(body, str) and body.strip():
        return body
    if isinstance(body, (dict, list)):
        return json.dumps(body)

    payload = {
        k: v
        for k, v in args.items()
        if not k.startswith("__ow_") and k not in ("body", "input")
    }
    if payload:
        return json.dumps(payload)

    return ""


def main(args, ctx=None):
    """Minimizza (minify) il JSON ricevuto rimuovendo spazi bianchi e ritorni a capo.

    Restituisce:
      - {"ok": true, "output": <stringa JSON minimizzata>}  in caso di successo
      - {"ok": false, "error": "<msg>"}                      in caso di errore
    """
    text = _get_json_text(args)

    if not text.strip():
        return {"ok": False, "error": "Nessun payload JSON ricevuto"}

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": str(exc)}

    # Minify: separatori compatti (',', ':') senza spazi bianchi né ritorni
    # a capo; ensure_ascii=False mantiene i caratteri Unicode originali.
    minified = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return {"ok": True, "output": minified}