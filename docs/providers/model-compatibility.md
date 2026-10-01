# Model recommendations and compatibility

Catalog checked on 2026-10-01. Fresh OpenAI API-key and Codex account-login setup recommends `gpt-6.1-sol` with `xhigh`, with Astra, Luna, older Sol and GPT-5.6 Terra alternatives. Fresh Anthropic setup recommends `claude-opus-5-5` for complex autonomous work, with `claude-sonnet-5-5`, Fable 5.1 and Haiku 4.5 alternatives. Anthropic released Sonnet 5.5 September 28 and reports Opus stronger for complex open-ended judgment, with Sonnet as a faster, cheaper complement. This supports our recommendation without establishing that Sonnet is generally poor or certifying OpenAssist-specific performance. `claude-mythos-5-1` is cataloged for invitation-only accounts, not advertised as generally available. The Haiku `claude-haiku-4-5` alias is also recognized.

Saved IDs are never automatically replaced. Azure always asks for your existing deployment name plus an optional underlying-model hint; the hint does not create a deployment or grant access. Actual access depends on account, region, quota and rollout. Unknown IDs receive no inferred optional capabilities.

## GPT-6 settings by route

| Route and model | Explicit reasoning efforts | Execution mode |
| --- | --- | --- |
| OpenAI API GPT-6.1 Sol | low, medium, high, xhigh, max | standard, pro |
| OpenAI API older Sol/Luna | none, low, medium, high, xhigh, max | standard, pro |
| OpenAI API Astra | low, medium, high, xhigh, max | standard, pro |
| Codex GPT-6.1 Sol/Astra/older Sol/Luna | low, medium, high, xhigh, max | Provider-managed; no mode field |
| Azure OpenAI GPT-6.1 Sol/Astra/older Sol/Luna | none, low, medium, high, xhigh, max | standard, pro |

OpenAI and Azure use Responses for these models' tools. `reasoningEffort` and `reasoningMode` are independent. Fresh OpenAI config and new GPT-6.1 Sol setup suggest xhigh; saved explicit effort and omitted settings remain intact. Default omits the relevant field; OpenAI GPT-6.1 Sol then uses medium effort, and API/Azure mode defaults to standard. Xhigh is an OpenAssist recommendation with more reasoning time and potentially higher billed token usage. Pro increases work, potential token cost and latency; wizard labels that explicitly. It is not selected automatically. Existing GPT-5.6 API/Azure entries also support the new mode setting. Codex Ultra is a client orchestration feature and is not sent as a reasoning effort.

Azure Astra and GPT-6.1 Sol follow Microsoft's deployment feature table, which explicitly includes none. OpenAI's specifications exclude none on both models. These entries are intentionally separate, with tests to prevent one route overwriting the other. Azure none still requires verification against the operator's actual deployment; no live deployment was available for this change.

OpenAI Astra and GPT-6.1 Sol omit temperature. Other cataloged GPT-6 API/Azure requests omit temperature unless effort is explicitly none. Codex retains its existing stream, instructions, session/account headers and refresh behavior. No async tools, subagents, built-in vendor tools, prompt-cache changes or larger context limits are enabled by a model selection.

Sources: [OpenAI GPT-6 migration rules](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [older Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [reasoning modes](https://developers.openai.com/api/docs/guides/reasoning), [Codex model controls](https://learn.chatgpt.com/docs/models), and [Azure reasoning features](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning).

## Claude settings and replay

| Model | Thinking modes | Efforts | Omitted effort |
| --- | --- | --- | --- |
| Opus 5.5 | adaptive only | low, medium, high, xhigh, max | medium |
| Sonnet 5.5 | adaptive (OpenAssist-supported subset) | low, medium, high, xhigh, max | high |
| Fable 5.1 / Mythos 5.1 | adaptive only | low, medium, high, xhigh, max | high |
| Sonnet 5 / retained Opus 5 | adaptive, disabled | low, medium, high, xhigh, max | high |
| Haiku 4.5 | manual enabled, disabled | None | Not applicable |

`thinkingMode` and `thinkingEffort` are optional. Leaving them unset preserves provider defaults. Opus 5 additionally requires adaptive thinking at xhigh/max; Opus 5.5 and Fable/Mythos 5.1 require it at every effort. Sonnet 5.5 rejects disabled/manual thinking. Its new between_tools mode is not exposed by OpenAssist because it requires different handling of edits to earlier history; use adaptive thinking. Legacy budget-only configurations keep their manual meaning on compatible models. Manual budget plus adaptive/disabled mode is invalid. Quickstart asks before resetting incompatible saved thinking; wizard supplies the full editor.

`maxOutputTokens` optionally bounds total thinking plus visible output. The new always-thinking models and Sonnet 5.5 default to 16384; their maximum is 128000. Other models retain 4096 or manual budget plus 1024 when larger, and Haiku is limited to 64000. A manual budget must be smaller than the output limit. Higher effort may exhaust a small allowance before useful text appears; explicitly adjust the limit or reduce effort. Request-level maxTokens can override the configured output limit.

Models with prefix-bound thinking, and any Claude request above 16384 output tokens, stream internally through the SDK and fold into OpenAssist's completed ChatResponse. This avoids the SDK's long non-streaming request restriction. Text is selected by block type; raw thinking, including empty signed blocks, is kept for durable replay rather than channel display. Tools remain automatic and sequentially executed by the runtime; forced tool choice is not sent.

Opus 5.5/Sonnet 5.5/Fable/Mythos 5.1 bind thinking to the conversation prefix. OpenAssist's bounded history, runtime guidance and access-controlled tool list can change that prefix. These requests therefore send `anthropic-beta: thinking-binding-controls-2026-08-01` and adaptive thinking with `block_binding.prefix_mismatch_behavior = "drop_block"`. The API preserves valid blocks and discards stale ones; complete tool-use/results remain replayed. This does not bypass signature checks or persist unbounded history. Custom gateways for these models must support that documented beta contract. Model binding across switches is handled upstream. No beta progress display or fallback-credit behavior is enabled.

Sources: [Claude model lineup](https://platform.claude.com/docs/en/models/overview), [Sonnet 5.5 announcement](https://www.anthropic.com/claude-sonnet-5-5), [Sonnet 5.5 migration](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5), [Opus 5.5 migration](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide), [Fable 5.1](https://platform.claude.com/docs/en/models/fable-5-1/overview), [Mythos 5.1](https://platform.claude.com/docs/en/models/mythos-5-1/overview), [effort](https://platform.claude.com/docs/en/build-with-claude/effort), and [preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).

## Other endpoints and migration

OpenAssist's azure-foundry adapter is Azure OpenAI Responses at `/openai/v1/`. Claude on Microsoft Foundry requires the separate Anthropic Messages contract and is not supported by that adapter. OpenAI-compatible keeps backend-defined Chat Completions without universal reasoning controls. Fresh setup asks for the model ID served by the backend and does not prefill a vendor default. GPT-6.1 Sol tools require Responses; use the OpenAI route (with a compatible custom base URL if needed) or Azure for that contract. New vendor features beyond OpenAssist's existing chat/tool/image contract are not automatically implemented.

Retired Codex gpt-5.4 and gpt-5.4-mini remain saved but block readiness, recommending GPT-6.1 Sol and Luna respectively. Back up TOML, run `openassist setup wizard`, explicitly change the provider, and verify `openassist doctor` plus a real reply. Relinking a healthy account does not fix a retired model. If incompatible tuning prevents configuration loading, remove the conflicting fields in the backed-up TOML and run `openassist config validate` before restarting. Existing Opus 4.5 aliases retain manual budgets.

The catalog lives in `packages/config/src/provider-models.ts`; contracts live in core-types. Setup, validation, requests and status use the same entries. Source checks and fake-transport regression tests establish implemented request behavior; designated live provider/channel tests are still needed for account availability and end-to-end certification.
