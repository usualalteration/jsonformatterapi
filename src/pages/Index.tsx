import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Copy, Check, Eraser } from "lucide-react";

type OpId = "validate" | "format" | "minify";

const ENDPOINTS: Record<OpId, string> = {
  validate: "/api/my/json-tools/validate-json",
  format: "/api/my/json-tools/format-json",
  minify: "/api/my/json-tools/minify-json",
};

const SAMPLE = `{
  "name": "JSON Formatter",
  "version": 1,
  "features": ["validate", "format", "minify"],
  "nested": {
    "active": true,
    "ratio": 3.14
  }
}`;

/**
 * Normalizza la risposta di un'azione OpenServerless: il wrapper generato puo'
 * racchiudere il payload del modulo in { "body": <valore> }, quindi si estrae
 * quel campo quando e' presente.
 */
function normalize(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && "body" in raw) {
    const inner = (raw as Record<string, unknown>).body;
    if (inner && typeof inner === "object") {
      return inner as Record<string, unknown>;
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}

export default function Index() {
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<OpId | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(op: OpId) {
    setLoading(op);
    setStatus("idle");
    setMessage("");
    setOutput("");

    try {
      // Envelope mode: {"input": "<testo>"} gestisce anche JSON malformato,
      // perché la piattaforma scarta i body application/json non parsabili.
      const res = await fetch(ENDPOINTS[op], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const raw = await res.json();
      const data = normalize(raw);

      if (op === "validate") {
        if (data.valid === true) {
          setStatus("ok");
          setMessage("JSON valido");
          setOutput(input);
        } else {
          setStatus("error");
          setMessage(String(data.error ?? "JSON non valido"));
          setOutput("");
        }
        return;
      }

      // format / minify
      if (data.ok === true || "output" in data) {
        const out = String(data.output ?? "");
        setStatus("ok");
        setMessage(op === "format" ? "JSON formattato (pretty-print)" : "JSON minimizzato");
        setOutput(out);
      } else {
        setStatus("error");
        setMessage(String(data.error ?? "Errore di elaborazione"));
        setOutput("");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Errore di rete");
      setOutput("");
    } finally {
      setLoading(null);
    }
  }

  async function copyOutput() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard non disponibile */
    }
  }

  function clearAll() {
    setInput("");
    setOutput("");
    setStatus("idle");
    setMessage("");
  }

  const busy = loading !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            JSON Formatter API
          </h1>
          <p className="mt-2 text-muted-foreground">
            Valida, formatta (pretty-print) e minimizza documenti JSON tramite
            un'API serverless Python su OpenServerless.
          </p>
        </header>

        {/* Input */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <Label htmlFor="json-input" className="text-sm font-medium">
              Input JSON
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={busy}
              className="text-muted-foreground"
            >
              <Eraser className="size-4" />
              Pulisci
            </Button>
          </div>
          <textarea
            id="json-input"
            name="json-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder='{"key": "value", "list": [1, 2, 3]}'
            className="h-56 w-full resize-y rounded-md border border-input bg-background p-4 font-mono text-sm leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </section>

        {/* Actions */}
        <section className="mb-6 flex flex-wrap gap-3">
          <Button onClick={() => run("validate")} disabled={busy} variant="outline">
            {loading === "validate" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Valida
          </Button>
          <Button onClick={() => run("format")} disabled={busy}>
            {loading === "format" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Copy className="size-4" />
            )}
            Formatta
          </Button>
          <Button onClick={() => run("minify")} disabled={busy} variant="secondary">
            {loading === "minify" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Eraser className="size-4" />
            )}
            Minimizza
          </Button>
        </section>

        {/* Status banner */}
        {status !== "idle" && (
          <div
            className={cn(
              "mb-4 flex items-start gap-3 rounded-md border p-4 text-sm",
              status === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {status === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-medium">{status === "ok" ? "Operazione riuscita" : "Operazione fallita"}</p>
              <p className="break-words font-mono text-xs">{message}</p>
            </div>
          </div>
        )}

        {/* Output */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Label htmlFor="json-output" className="text-sm font-medium">
              Output
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyOutput}
              disabled={!output}
              className="text-muted-foreground"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
          <pre
            id="json-output"
            className="h-56 w-full overflow-auto rounded-md border border-input bg-muted/30 p-4 font-mono text-sm leading-relaxed"
          >
            {output || <span className="text-muted-foreground">Il risultato apparirà qui…</span>}
          </pre>
        </section>

        {/* API reference */}
        <footer className="mt-10 rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Endpoint REST</p>
          <ul className="space-y-1 font-mono text-xs">
            <li>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">POST</span>{" "}
              /api/my/json-tools/validate-json
            </li>
            <li>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">POST</span>{" "}
              /api/my/json-tools/format-json
            </li>
            <li>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">POST</span>{" "}
              /api/my/json-tools/minify-json
            </li>
          </ul>
          <p className="mt-3 text-xs">
            Stateless · solo modulo nativo <code className="font-mono">json</code> di Python 3 ·
            nessun database.
          </p>
        </footer>
      </div>
    </div>
  );
}