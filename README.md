# JSON Formatter API

API serverless (OpenServerless / Apache OpenWhisk, Python 3) che riceve
documenti o stringhe JSON ed espone tre endpoint REST per **validare**,
**formattare** (pretty-print) e **minimizzare** (minify) i dati.

L'elaborazione e' completamente **stateless** e in memoria: usa esclusivamente
il modulo nativo `json` di Python. Nessun database, nessuna libreria esterna.

---

## 1. Struttura del Progetto

```
jsonformatterapi/
├── packages/
│   └── json-tools/                      # package OpenServerless
│       ├── validate-json/
│       │   ├── __main__.py              # wrapper generato (NON modificare)
│       │   └── validate_json.py         # logica editabile dell'azione
│       ├── format-json/
│       │   ├── __main__.py              # wrapper generato (NON modificare)
│       │   └── format_json.py           # logica editabile dell'azione
│       └── minify-json/
│           ├── __main__.py              # wrapper generato (NON modificare)
│           └── minify_json.py           # logica editabile dell'azione
├── manifest.yaml                        # spec dichiarativa del package (riferimento)
├── src/                                 # frontend React/Vite (workbench)
└── README.md
```

- `packages/<package>/<action>/<module>.py` contiene la **logica** (l'unico file
  da editare). Il nome del modulo mantiene il suffisso `_json`/`json` per
  leggibilita', ma l'**endpoint** usa il trattino.
- `packages/<package>/<action>/__main__.py` e' il **wrapper generato** dalla
  piattaforma: lo invoca e racchiude il valore restituito in
  `{"body": <valore>}`. Non va modificato a mano.

### Endpoint pubblici (web actions)

| Metodo | URL                                   | Azione             |
|--------|---------------------------------------|--------------------|
| POST   | `/api/my/json-tools/validate-json`    | validazione JSON   |
| POST   | `/api/my/json-tools/format-json`      | pretty-print       |
| POST   | `/api/my/json-tools/minify-json`      | minify             |

> **Nota sui nomi**: in OpenServerless ogni segmento di package/azione deve
> iniziare con una lettera e contenere solo lettere, numeri e trattini. I nomi
> pertanto sono `validate-json`, `format-json`, `minify-json` (con il trattino).
> `validate_json` / `format_json` / `minify_json` con l'underscore **non sono
> endpoint validi** sulla piattaforma. Il nome del modulo Python mantiene il
> suffisso `_json`/`json` solo per coerenza con il file.

---

## 2. Codice Sorgente Python

Le tre azioni condividono lo stesso helper `_get_json_text(args)` che estrae il
testo JSON in modo robusto rispetto a come OpenServerless consegna i parametri.

### 2.1 `packages/json-tools/validate-json/validate_json.py`

```python
import json

def _content_type(args):
    headers = args.get("__ow_headers") if isinstance(args, dict) else None
    if isinstance(headers, dict):
        for key in ("content-type", "Content-Type", "CONTENT-TYPE"):
            if key in headers:
                return str(headers[key]).lower()
    return ""

def _get_json_text(args):
    if not isinstance(args, dict):
        return ""
    ct = _content_type(args)
    is_json_ct = "application/json" in ct
    raw = args.get("__ow_body")

    if is_json_ct:
        # application/json -> __ow_body contiene il valore *parsato*
        if isinstance(raw, dict):
            env = raw.get("input")               # envelope: {"input": "<json>"}
            if isinstance(env, str) and env.strip():
                return env
            return json.dumps(raw)               # oggetto gia' parsato
        elif raw is not None and not (isinstance(raw, str) and raw == ""):
            return json.dumps(raw)                # scalare/array gia' parsato
    else:
        # text/plain (altri Content-Type) -> __ow_body e' il testo *grezzo*
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8", "replace")
        if isinstance(raw, str) and raw.strip():
            return raw

    # fallback: campi top-level / body
    env = args.get("input")
    if isinstance(env, str) and env.strip():
        return env
    body = args.get("body")
    if isinstance(body, str) and body.strip():
        return body
    if isinstance(body, (dict, list)):
        return json.dumps(body)
    payload = {k: v for k, v in args.items()
               if not k.startswith("__ow_") and k not in ("body", "input")}
    return json.dumps(payload) if payload else ""

def main(args, ctx=None):
    text = _get_json_text(args)
    if not text.strip():
        return {"valid": False, "error": "Nessun payload JSON ricevuto"}
    try:
        json.loads(text)
        return {"valid": True}
    except json.JSONDecodeError as exc:
        return {"valid": False, "error": str(exc)}
```

### 2.2 `packages/json-tools/format-json/format_json.py`

```python
import json

# ... helper _content_type / _get_json_text identici a validate_json ...

def main(args, ctx=None):
    text = _get_json_text(args)
    if not text.strip():
        return {"ok": False, "error": "Nessun payload JSON ricevuto"}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": str(exc)}
    formatted = json.dumps(data, indent=4, ensure_ascii=False)
    return {"ok": True, "output": formatted}
```

### 2.3 `packages/json-tools/minify-json/minify_json.py`

```python
import json

# ... helper _content_type / _get_json_text identici a validate_json ...

def main(args, ctx=None):
    text = _get_json_text(args)
    if not text.strip():
        return {"ok": False, "error": "Nessun payload JSON ricevuto"}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": str(exc)}
    minified = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return {"ok": True, "output": minified}
```

### Come OpenServerless passa i parametri

OpenServerless espone ogni azione come **web action** OpenWhisk. La funzione
`main(args)` riceve un dizionario che contiene:

- i parametri di query/form/JSON body (mergati ai top-level per body JSON object),
- `__ow_body` con il corpo della richiesta,
- `__ow_headers`, `__ow_method`, `__ow_path` con i metadati HTTP.

Comportamento chiave osservato sulla piattaforma:

- con `Content-Type: text/plain` -> `__ow_body` contiene il **testo grezzo**
  (quindi anche JSON malformato arriva integro all'azione);
- con `Content-Type: application/json` -> `__ow_body` contiene il **valore gia'
  parsato** (dict/list/scalar); inoltre la piattaforma **scarta i body
  `application/json` malformati prima** di invocare l'azione.

Per questo motivo esistono tre modalita' di invio (vedi sezione 4).

### Forma delle risposte

Il wrapper generato racchiude il valore restituito in `{"body": <valore>}` e
non passa attraverso `statusCode`/`headers` top-level. Tutte le risposte sono
pertanto **HTTP 200 con `Content-Type: application/json`** e l'esito e' nel
body JSON a livello applicativo:

- `validate-json`:
  - valido: `{"valid": true}`
  - non valido: `{"valid": false, "error": "<dettaglio errore di sintassi>"}`
- `format-json`:
  - ok: `{"ok": true, "output": "<json formattato indent=4>"}`
  - errore: `{"ok": false, "error": "<msg>"}`
- `minify-json`:
  - ok: `{"ok": true, "output": "<json minimizzato>"}`
  - errore: `{"ok": false, "error": "<msg>"}`

> Il client normalizza il payload: legge `data.valid` per validate e
> `data.output` per format/minify; se `data.ok === false` o `data.valid === false`,
> gestisce `data.error`.

---

## 3. Deployment (Manifest)

La topologia e' descritta in [`manifest.yaml`](./manifest.yaml):

```yaml
packages:
  json-tools:
    actions:
      validate-json:
        function: packages/json-tools/validate-json/validate_json.py
        runtime: python:3
        web: true
        annotations:
          web-export: true
      format-json:
        function: packages/json-tools/format-json/format_json.py
        runtime: python:3
        web: true
        annotations:
          web-export: true
      minify-json:
        function: packages/json-tools/minify-json/minify_json.py
        runtime: python:3
        web: true
        annotations:
          web-export: true
```

**Nota importante (workbench Trustable):** in questo ambiente il deploy e'
gestito dal watcher gestito `ops ide devel` e dagli strumenti MCP
OpenServerless. Le azioni sono state create con `openserverless_action_new`
(endpoint `json-tools/<action>`, `public: true`) che genera il wrapper
`__main__.py` con `#--web true` (web-export). Il file `manifest.yaml` e' una
spec dichiarativa di riferimento; non va eseguito un `ops action deploy`
manuale mentre il watcher e' attivo.

---

## 4. Guida al Testing

Tutti gli endpoint sono `POST` su `/api/my/json-tools/<action>`.
Da dentro il pod: `http://localhost:5173/api/my/json-tools/<action>`.

### Modalita' di invio del JSON

1. **Raw text** (`Content-Type: text/plain`): il body e' il testo JSON, anche
   malformato. Modo consigliato per validare JSON potenzialmente invalido.
2. **Envelope** (`Content-Type: application/json`): body `{"input": "<testo json>"}`.
   Utile per inviare JSON malformato con un client `application/json` (la
   piattaforma scarta i body `application/json` malformati, quindi il testo
   va incapsulato nella stringa `input`).
3. **Parsed** (`Content-Type: application/json`): body = oggetto JSON valido;
   l'azione lo ri-serializza e lo elabora.

### 4.1 validate-json

```bash
# Valid (raw text)
curl -s -X POST http://localhost:5173/api/my/json-tools/validate-json \
  -H "Content-Type: text/plain" \
  -d '{"name":"Mario","eta":30,"attivo":true}'
# -> {"valid": true}

# Invalid (raw text): il JSON malformato arriva integro all'azione
curl -s -X POST http://localhost:5173/api/my/json-tools/validate-json \
  -H "Content-Type: text/plain" \
  -d '{"name":"Mario", "eta":}'
# -> {"valid": false, "error": "Expecting value: line 1 column 24 (char 23)"}

# Invalid via envelope (application/json con testo malformato in "input")
curl -s -X POST http://localhost:5173/api/my/json-tools/validate-json \
  -H "Content-Type: application/json" \
  -d '{"input":"{\"name\":\"Mario\", \"eta\":}"}'
# -> {"valid": false, "error": "Expecting value: line 1 column 24 (char 23)"}

# Valid object gia' JSON (application/json)
curl -s -X POST http://localhost:5173/api/my/json-tools/validate-json \
  -H "Content-Type: application/json" \
  -d '{"name":"Mario","eta":30}'
# -> {"valid": true}

# Da file
curl -s -X POST http://localhost:5173/api/my/json-tools/validate-json \
  -H "Content-Type: text/plain" --data-binary @documento.json
```

### 4.2 format-json (pretty-print)

```bash
# Raw text
curl -s -X POST http://localhost:5173/api/my/json-tools/format-json \
  -H "Content-Type: text/plain" \
  -d '{"b":2,"a":1,"list":[3,2,1]}'
# -> {"ok": true, "output": "{\n    \"b\": 2,\n    \"a\": 1,\n    \"list\": [\n        3,\n        2,\n        1\n    ]\n}"}

# Da file pretty-printato in input (application/json object)
curl -s -X POST http://localhost:5173/api/my/json-tools/format-json \
  -H "Content-Type: application/json" --data-binary @documento.json

# Errore di sintassi
curl -s -X POST http://localhost:5173/api/my/json-tools/format-json \
  -H "Content-Type: text/plain" -d '{"a":1, "b":}'
# -> {"ok": false, "error": "Expecting value: line 1 column 13 (char 12)"}
```

Per visualizzare l'output formattato a schermo (es. con `jq`):

```bash
curl -s -X POST http://localhost:5173/api/my/json-tools/format-json \
  -H "Content-Type: text/plain" -d '{"b":2,"a":1}' | jq -r .output
```

### 4.3 minify-json

```bash
# Pretty-print in input -> minified in output
curl -s -X POST http://localhost:5173/api/my/json-tools/minify-json \
  -H "Content-Type: text/plain" --data-binary @documento_pretty.json
# -> {"ok": true, "output": "{\"name\":\"Mario\",\"eta\":30,\"list\":[1,2,3]}"}

# Stesso risultato via envelope
curl -s -X POST http://localhost:5173/api/my/json-tools/minify-json \
  -H "Content-Type: application/json" \
  -d '{"input":"{  \"a\" : 1 ,  \"b\" : [ 2 , 3 ] }"}'
# -> {"ok": true, "output": "{\"a\":1,\"b\":[2,3]}"}

# Errore di sintassi
curl -s -X POST http://localhost:5173/api/my/json-tools/minify-json \
  -H "Content-Type: text/plain" -d '{"a":1, "b":}'
# -> {"ok": false, "error": "Expecting value: line 1 column 13 (char 12)"}
```

Per estrarre solo il JSON minimizzato:

```bash
curl -s -X POST http://localhost:5173/api/my/json-tools/minify-json \
  -H "Content-Type: text/plain" --data-binary @documento_pretty.json | jq -r .output
```

### Verifica degli header

```bash
curl -i -X POST http://localhost:5173/api/my/json-tools/format-json \
  -H "Content-Type: text/plain" -d '{"a":1}'
# HTTP/1.1 200 OK
# content-type: application/json
```

---

## Verifica eseguita

- `check_openserverless_actions.sh .` -> contratto OK, 0 warning.
- Tutti gli endpoint verificati con `curl` su `http://localhost:5173` nelle tre
  modalita' (raw text, envelope, parsed object) per JSON valido, malformato,
  scalare, array e payload vuoto: risultati conformi alla specifica.
- `Content-Type: application/json` confermato per tutti e tre gli endpoint.