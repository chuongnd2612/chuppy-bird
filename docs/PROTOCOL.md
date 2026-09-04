# AI stream protocol

`POST /api/ai/analyze` answers with a stream of length-prefixed frames rather
than JSON or SSE.

```
Frame := LENGTH (4 bytes, big-endian uint32) ‖ PAYLOAD (LENGTH bytes, UTF-8 JSON)
```

Response headers:

| Header | Value |
| --- | --- |
| `content-type` | `application/octet-stream` |
| `cache-control` | `no-store` |
| `x-content-type-options` | `nosniff` |
| `x-accel-buffering` | `no` |

## Why length prefixes and not SSE

The payloads carry arbitrary model output. With SSE that means escaping
newlines on the way out and unescaping on the way in, and trusting a blank-line
delimiter to survive whatever chunking sits between the server and the phone. A
length prefix says exactly how many bytes to read, so a frame is either complete
or still arriving — there is no third state, and no escaping to get wrong.

`x-accel-buffering: no` matters for the same reason: a proxy that coalesces or
re-chunks the body is fine (the decoder reassembles), but one that *buffers*
the whole response defeats streaming entirely.

## Frames

Payloads are discriminated by `t`.

| `t` | Fields | When |
| --- | --- | --- |
| `start` | `sessionId` | Once, first. Keep it to ask follow-ups. |
| `model` | `model` | Once the turn begins. Not known at `start`. |
| `delta` | `text` | Repeatedly. Append in order; deltas are not lines. |
| `tool` | `name`, `status` | The analysis called a tool. Progress only. |
| `done` | `costUsd`, `inputTokens`, `outputTokens`, `stopReason` | The turn finished. |
| `error` | `message` | Something failed. The stream ends after this. |

A run normally produces `start`, `model`, many `delta`, then `done`. `error` can
replace `done`, and can also arrive after partial output.

Frames are capped at 1 MiB (`MAX_FRAME_BYTES`). A declared length above the cap
is a protocol error: the decoder throws rather than buffering it.

## Reading the stream

`FrameDecoder` in `shared/framing.ts` is used by both sides. Chunk boundaries
carry no meaning — a single read can split the 4-byte header or deliver six
frames at once — so feed it raw bytes and take whatever whole frames come back.

```ts
const decoder = new FrameDecoder();
const reader = response.body.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const frame of decoder.push(value)) handle(frame);
}
// pending > 0 here means the stream was cut mid-frame.
if (decoder.pending > 0) throw new Error('truncated');
```

Read the body as **bytes**, not text. A `TextDecoder` splitting a multi-byte
character across chunk boundaries would corrupt the byte lengths.

## Cancelling

Abort the fetch. The server notices the response closed before it finished and
sends `SIGTERM` to the CLI's process group, so nothing is left running.

## Request

```jsonc
{
  "project": "Payments",
  "workItemId": 1042,
  // Both together continue an earlier analysis instead of starting over.
  "resumeSessionId": "…",  // optional, from the start frame
  "question": "…"          // optional, the follow-up
}
```

Errors *before* the stream opens are ordinary JSON with a status code — 400 for
a bad request, 429 when a run is already in flight, 503 when `AI_ENABLED=false`.
Once the stream has opened, failures arrive as an `error` frame instead, so the
client never has to handle two error shapes in one response.
