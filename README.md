# pi-you-should-know

A Pi extension that occasionally taps you on the shoulder: "heads up, you probably missed this."

While an agent works, a second copy of the conversation is asked one question every few steps: is there something the user should know but probably didn't notice? Usually the answer is no and you see nothing. When the answer is yes, a short note appears above the editor, with a pointer to where it came from (a file and line, a test, a command).

It's a port of the "you should know" plugin built into Claude Code.

## Using it

- A note shows up above the editor, like `✦ Heads up · The agent loosened the test threshold from 0.8 to 0.65.`
- `/ysk` or alt+shift+y: open the top note. You can learn more about it, mark it as something you knew, send it to the agent or dismiss it.
- alt+x: dismiss the top note.
- `/ysk off`, `/ysk on`, `/ysk status`: turn it off and on, or see how many checks it has run.

If you keep ignoring notes, it checks less often. Answering any note resets that.

Open notes and answer history are saved with the Pi session. Knew and Undo feedback is saved under `~/.pi/agent/you-should-know/` (or your `PI_CODING_AGENT_DIR`), so separate Pi sessions cannot overwrite one another’s feedback. Relayed child notes stay in the inbox until they appear in the parent’s saved conversation.

## In RPC clients

Without Pi's terminal UI (for example in T3 Code), each note is sent once as a notification in the form `[ysk:<id>] <tag> · <line> (<evidence>)`, followed by its explanation, so the client can show and answer it. The client reports each answer back with `/ysk answer <id> <action>` (`knew`, `dismiss`, `learn` or `send`); that removes the note silently and, for `knew`, remembers it as something you know. Notes are sent immediately, including between runs. T3 Code shows them in its heads-up band; `/ysk` points to those controls. Notes and answers survive a Pi restart. The client can undo an answer with `/ysk answer <id> undo`, which also removes a previous `knew` answer. Unanswered notes reduce the check frequency in RPC clients too.

## With herdr subagents

When the extension runs inside a [pi-herdr-subagents](https://github.com/aliceisjustplaying/pi-herdr-subagents) subagent, its notes aren't shown in the subagent's pane. They're passed to the parent agent as a message instead, labeled with the subagent's name, so the agent that's coordinating the work can act on them.

## Side models

The optional `model` and `thinking` fields in the same `~/.pi/agent/you-should-know/config.json` (or under `PI_CODING_AGENT_DIR`) set a general side model, regardless of the main model family:

```json
{
  "model": "openai/gpt-6.1-sol",
  "thinking": "high"
}
```

The OpenAI provider example above uses the local-trial model `openai/gpt-6.1-sol`. For the current MiniMax trial, an optional single backup can be configured in the same file:

```json
{
  "model": "minimax-cn/MiniMax-M3.1-Flash-Preview",
  "thinking": "off",
  "fallback": {
    "model": "openai/gpt-6-luna",
    "thinking": "off"
  }
}
```

The backup is called once only when the primary model request returns an error or throws a request error. A successful response—including `learn: none` or an unparseable answer—does not call it; aborts do not switch. There is no retry of the primary model. If both models fail, the check remains an error rather than becoming a fabricated `none` result.

You can also retain the existing family-specific defaults and overrides:

- GPT family → the existing `openai-codex/gpt-6.1-sol`, high-thinking route. That provider is not configured in this local environment; the `openai/gpt-6.1-sol` JSON examples above are the local-trial configuration.
- Claude Fable family → `anthropic/claude-opus-5-5`, medium thinking.
- Other models → the main model; other Claude models keep the existing same-model request behavior.

Family routes remain configurable in that same file:

```json
{
  "gpt": { "model": "openai/gpt-6.1-sol", "thinking": "high" }
}
```

Model selection priority is `YSK_MODEL` environment variable → top-level `model` → existing GPT/Fable family route → current main model. Thinking priority is explicit top-level `thinking` → existing family thinking → the previous undefined behavior. `YSK_MODEL` changes only the model; it does not override thinking. The optional top-level `fallback` is independent of family thinking and has its own `model` and optional `thinking`. A chosen model must be a registered `provider/model-id` using that provider's credentials. Thinking accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, subject to provider/model support. Invalid model configuration or unknown IDs fail visibly instead of falling back to the main model. Each detection and explanation reads the config anew; changes apply to the next read, and `/ysk status` reports both effective routes and their thinking levels.

Fallback diagnostics are written to `checks.jsonl`: `ysk_fallback_triggered` records a fixed reason code and both provider/model IDs; `ysk_fallback_result` records the final response outcome and usage when available. Check entries distinguish primary success from fallback use. These logs do not contain the request prompt, raw payload, full response, or credentials. The fixture tests verify routing, but do not measure real MiniMax/GPT Luna reminder quality or provider-side thinking support.

## Cost

Same-model Claude checks reuse the main request's cached prefix. A different side model still receives the conversation, but can cost more because that cache reuse is not guaranteed. Every check is logged, with token usage, to `~/.pi/agent/you-should-know/checks.jsonl`.

## Local trial install

To use this fork from the user's main checkout, run:

    pi install "$HOME/projects/oss/pi-you-should-know"

`$HOME` expands to the user's home directory, so this command targets the main checkout, not a disposable worktree. It is documented here but was not run as part of the local-trial changes.

## Source and license

This project is based on the upstream [aliceisjustplaying/pi-you-should-know](https://github.com/aliceisjustplaying/pi-you-should-know) and retains its source attribution. This local fork does not add or change a license; `package.json` continues to mark the package `UNLICENSED`.
