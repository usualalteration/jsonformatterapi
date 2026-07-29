"""
Azione: json-tools/validate-json
Scopo: validare un documento JSON ricevuto via HTTP.

OpenServerless espone l'azione come "web action" (endpoint REST pubblico).
Il wrapper generato (__main__.py) invoca `main(args, ctx=ctx)` e racchiude il
valore restituito in `{"body": <valore>}`. Il modulo restituisce quindi payload
JSON a livello applicativo: l'esito della validazione e' nel campo `valid` e
l'eventuale dettaglio dell'errore di sintassi nel campo `error`.

Modalita' di invio del JSON (documentate nel README):
  1. Raw text  -> Content-Type: text/plain, body = testo JSON (anche malformato).
                  L'azione legge il testo grezzo da __ow_body e lo valida.
  2. Envelope  -> Content-Type: application/json, body = {"input": "<testo json>"}.
                  Utile per inviare JSON malformato con un client application/json:
                  la piattaforma scarta i body application/json malformati prima
                  di invocare l'azione, quindi il testo da validare va incapsulato
                  in una stringa "input".
  3. Parsed    -> Content-Type: application/json, body = oggetto JSON valido.
                  L'azione ri-serializza il valore gia' parsato e lo valida.

Nota: con Content-Type: application/json la piattaforma consegna in __ow_body il
valore *parsato* (dict/list/scalar); con altri Content-Type (es. text/plain)
consegna il testo *grezzo*.
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
    """Estrae il testo JSON da validare, in modo robusto rispetto alle diverse
    modalita' con cui OpenServerless consegna i parametri.

    Priorita':
      1. application/json + __ow_body dict con campo "input" (stringa) -> envelope.
      2. application/json -> __ow_body e' il valore parsato: lo si ri-serializza.
      3. text/plain (altri Content-Type) -> __ow_body e' il testo grezzo.
      4. Fallback: campo top-level "input", "body", o merge top-level.
    """
    if not isinstance(args, dict):
        return ""

    ct = _content_type(args)
    is_json_ct = "application/json" in ct
    raw = args.get("__ow_body")

    # 1-2. Content-Type: application/json -> __ow_body contiene il valore parsato.
    if is_json_ct:
        if isinstance(raw, dict):
            # Envelope mode: {"input": "<testo json>"}
            env = raw.get("input")
            if isinstance(env, str) and env.strip():
                return env
            # Parsed object mode: l'intero oggetto e' il documento JSON.
            try:
                return json.dumps(raw)
            except (TypeError, ValueError):
                pass
        elif raw is not None and not (isinstance(raw, str) and raw == ""):
            # Parsed scalar/array: ri-serializza il valore.
            try:
                return json.dumps(raw)
            except (TypeError, ValueError):
                pass
    else:
        # 3. testo grezzo (text/plain, ecc.): __ow_body e' il testo JSON originale.
        if isinstance(raw, (bytes, bytearray)):
            try:
                raw = raw.decode("utf-8")
            except Exception:
                raw = ""
        if isinstance(raw, str) and raw.strip():
            return raw

    # 4. Fallback: campi top-level (body stringa, body parsato, merge).
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
    """Valida il JSON ricevuto.

    Restituisce:
      - {"valid": True}                       se il JSON e' sintatticamente valido
      - {"valid": False, "error": "<msg>"}    se il parsing fallisce o manca il payload
    """
    text = _get_json_text(args)

    if not text.strip():
        return {"valid": False, "error": "Nessun payload JSON ricevuto"}

    try:
        json.loads(text)
        return {"valid": True}
    except json.JSONDecodeError as exc:
        # cattura l'errore di sintassi e lo restituisce al client
        return {"valid": False, "error": str(exc)}