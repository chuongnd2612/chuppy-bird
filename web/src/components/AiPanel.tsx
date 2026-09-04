import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure } from '../api/client.ts';
import { fetchAiStatus, streamAnalysis, type AiStatus } from '../api/aiStream.ts';
import { Markdown } from './Markdown.tsx';

interface AiPanelProps {
  project: string;
  workItemId: number;
}

interface RunSummary {
  costUsd: number | null;
  outputTokens: number | null;
}

export function AiPanel({ project, workItemId }: AiPanelProps) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [text, setText] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [question, setQuestion] = useState('');

  const sessionId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAiStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  // Abandoning the screen must stop the run; a model turn left going on a
  // laptop costs real money.
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (followUp?: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setRunning(true);
      setError(null);
      setHint(null);
      setSummary(null);
      setTool(null);
      if (!followUp) {
        setText('');
        sessionId.current = null;
      } else {
        setText((previous) => `${previous}\n\n---\n\n**${followUp}**\n\n`);
      }

      try {
        const stream = streamAnalysis(
          {
            project,
            workItemId,
            ...(followUp && sessionId.current
              ? { question: followUp, resumeSessionId: sessionId.current }
              : {}),
          },
          controller.signal,
        );

        for await (const frame of stream) {
          switch (frame.t) {
            case 'start':
              sessionId.current = frame.sessionId;
              break;
            case 'model':
              setModel(frame.model);
              break;
            case 'delta':
              setText((previous) => previous + frame.text);
              break;
            case 'tool':
              setTool(frame.name);
              break;
            case 'done':
              setSummary({ costUsd: frame.costUsd, outputTokens: frame.outputTokens });
              setTool(null);
              break;
            case 'error':
              setError(frame.message);
              break;
          }
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        if (cause instanceof ApiFailure && cause.hint) setHint(cause.hint);
      } finally {
        if (abort.current === controller) {
          setRunning(false);
          abort.current = null;
        }
      }
    },
    [project, workItemId],
  );

  if (status && !status.enabled) {
    return (
      <section className="section">
        <h2>Analysis</h2>
        <p className="muted">Claude analysis is disabled on this server.</p>
      </section>
    );
  }

  return (
    <section className="section ai">
      <h2>Analysis</h2>

      <div className="ai__actions">
        {running ? (
          <button type="button" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={() => void run()}>
            {text ? 'Run again' : `Run /${status?.skill ?? 'ado-ticket-analyze'}`}
          </button>
        )}
        {model ? <span className="muted">{model}</span> : null}
        {tool ? <span className="muted">{tool}…</span> : null}
      </div>

      {error ? (
        <div className="state--error" role="alert">
          <p>{error}</p>
          {hint ? <p className="muted">{hint}</p> : null}
        </div>
      ) : null}

      {text ? <Markdown source={text} /> : null}
      {running && !text ? <p className="muted">Starting…</p> : null}

      {summary ? (
        <p className="ai__summary muted">
          {summary.costUsd !== null ? `$${summary.costUsd.toFixed(4)}` : null}
          {summary.outputTokens !== null ? ` · ${summary.outputTokens} output tokens` : null}
        </p>
      ) : null}

      {sessionId.current && !running ? (
        <form
          className="ai__followup"
          onSubmit={(event) => {
            event.preventDefault();
            const asked = question.trim();
            if (!asked) return;
            setQuestion('');
            void run(asked);
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a follow-up…"
            aria-label="Follow-up question"
          />
          <button type="submit" disabled={question.trim().length === 0}>
            Ask
          </button>
        </form>
      ) : null}
    </section>
  );
}
