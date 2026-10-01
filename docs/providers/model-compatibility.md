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

## Full conversational catalog

The October 1 audit includes every non-deprecated general-purpose OpenAI conversational family in the official catalog, plus retained legacy families, the active Claude families, verified aliases and documented OpenAI snapshot pins. Retained retired IDs remain readable for explicit repair. These tables describe OpenAssist's supported controls; a catalog entry does not grant account access or Azure deployment availability.

| OpenAI model IDs | Routes with verified controls | Reasoning efforts |
| --- | --- | --- |
| `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | OpenAI, Azure, retained Codex | none, low, medium, high, xhigh, max; API/Azure also standard/pro mode |
| `gpt-5.6` (Sol alias) | OpenAI | Same as API GPT-5.6 Sol |
| `gpt-5.5` | OpenAI, Azure; Codex until October 14 | API/Azure: none, low, medium, high, xhigh; Codex: low, medium, high, xhigh |
| `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2` | OpenAI, Azure | none, low, medium, high, xhigh |
| `gpt-5.1` | OpenAI, Azure | none, low, medium, high |
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | OpenAI, Azure | minimal, low, medium, high |
| `gpt-5.5-pro`, `gpt-5.2-pro` | OpenAI Responses | medium, high, xhigh |
| `gpt-5.4-pro` | OpenAI, Azure Responses | medium, high, xhigh |
| `gpt-5-pro` | OpenAI, Azure Responses | high only |
| `o3`, `o3-pro`, `o1`, `o3-mini`, `o4-mini` | OpenAI, Azure Responses | low, medium, high; OpenAI o1/o3-mini/o4-mini retire October 23 |
| `gpt-5.3-codex` | OpenAI, deprecated Codex, Azure | low, medium, high, xhigh |
| `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.2-codex` | Retained compatibility metadata; OpenAI IDs retired July 23 | Azure has separate explicit entries; API retirement is not applied to Azure deployments |
| `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini` | OpenAI Chat Completions (Responses for images), Azure Responses | No reasoning controls; API GPT-4.1 Nano retires October 23 |
| `chat-latest` | OpenAI Responses | No assumed optional reasoning controls; upstream target can change |
| `gpt-5.6-cyber`, `gpt-daybreak-red-latest`, `gpt-daybreak-blue-latest` | OpenAI Responses, separately approved/provisioned accounts | Verified tool transport; no inferred optional tuning |

GPT-6 controls are listed above. Azure Codex effort entries also follow Microsoft’s [ReasoningEffort contract](https://learn.microsoft.com/en-us/javascript/api/@azure/ai-projects/reasoningeffort?view=azure-node-latest), which includes xhigh for models after GPT-5.1-Codex-Max; the Azure feature-table footnote verifies none on GPT-5.1-Codex/Max/Mini. Standalone Pro model IDs use Responses and are distinct from GPT-5.6/GPT-6's `reasoningMode = "pro"`; they may take minutes to reply. Unsupported effort values fail validation. Temperature is omitted on original GPT-5, o-series and Pro models; cataloged later GPT families permit it only at explicitly selected none effort.

OpenAI's documented pins are recognized exactly: GPT-5/Mini/Nano (2025-08-07), GPT-5.1 (2025-11-13), GPT-5.2/Pro (2025-12-11), GPT-5.4/Pro (2026-03-05), GPT-5.4 Mini/Nano (2026-03-17), GPT-5.5/Pro (2026-04-23), GPT-5 Pro (2025-10-06), GPT-4.1/Mini/Nano (2025-04-14), GPT-4o (2024-05-13, 2024-08-06, 2024-11-20), GPT-4o Mini (2024-07-18), o1 (2024-12-17), o3/o4-mini (2025-04-16), o3-mini (2025-01-31), and o3-pro (2025-06-10). These pins inherit API capabilities only. Invented date suffixes, Azure deployment names and generic served IDs do not.

The release inventory also includes GPT-Image-2.5 Sunburst/Flare, GPT-Live 1, GPT-Realtime-2.1/Mini and transcription models. They use image/audio/realtime contracts, so they are not offered as OpenAssist assistant model IDs. GPT-Rosalind requires its separate approved research access; no per-model transport/control specification was available to verify here. No unreleased GPT-6.1 Astra/Luna or Haiku 5.5 is added.

Sources: [complete OpenAI catalog](https://developers.openai.com/api/docs/models/all), [API changelog](https://developers.openai.com/api/docs/changelog), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5), [GPT-5.5 Pro](https://developers.openai.com/api/docs/models/gpt-5.5-pro), [GPT-5 Pro](https://developers.openai.com/api/docs/models/gpt-5-pro), [GPT-5.6 alias](https://developers.openai.com/api/docs/models/gpt-5.6-sol), and [Daybreak access](https://developers.openai.com/api/docs/models/gpt-daybreak-blue-latest).

## Claude settings and replay

| Model | Thinking modes | Efforts | Omitted effort |
| --- | --- | --- | --- |
| Opus 5.5 | adaptive only | low, medium, high, xhigh, max | medium |
| Sonnet 5.5 | adaptive (OpenAssist-supported subset) | low, medium, high, xhigh, max | high |
| Fable 5.1 / Mythos 5.1 | adaptive only | low, medium, high, xhigh, max | high |
| Sonnet 5 / retained Opus 5 | adaptive, disabled | low, medium, high, xhigh, max | high |
| Fable 5 / Mythos 5 | adaptive only | low, medium, high, xhigh, max | high |
| Opus 4.7 / 4.8 | adaptive, disabled; thinking off by default | low, medium, high, xhigh, max | high |
| Sonnet 4.6 / Opus 4.6 | adaptive, manual enabled (deprecated), disabled; off by default | low, medium, high, max | high |
| Opus 4.5 (pin and alias) | manual enabled, disabled | low, medium, high | high |
| Sonnet 4.5 (deprecated, pin and alias) / Haiku 4.5 | manual enabled, disabled | None | Not applicable |
| Mythos Preview (deprecated, invite only) | adaptive, manual enabled; adaptive by default | low, medium, high, max | high |

`thinkingMode` and `thinkingEffort` are optional. Leaving them unset preserves provider defaults. Opus 5 additionally requires adaptive thinking at xhigh/max; Opus 5.5 and Fable/Mythos 5/5.1 require it at every effort. All Mythos versions are invitation-only; the Fable line is publicly available. Opus 4.7/4.8 reject manual budgets; Opus/Sonnet 4.6 retain them despite upstream deprecation. Opus 4.5 accepts effort alongside its budget but excludes xhigh/max. Sonnet 5.5 rejects disabled/manual thinking. Its new between_tools mode is not exposed by OpenAssist because it requires different handling of edits to earlier history; use adaptive thinking. Legacy budget-only configurations keep their manual meaning on compatible models. Manual budget plus adaptive/disabled mode is invalid. Quickstart asks before resetting incompatible saved thinking; wizard supplies the full editor.

`maxOutputTokens` optionally bounds total thinking plus visible output. Opus 5.5, Sonnet 5.5, Fable/Mythos 5/5.1 and Mythos Preview default to 16384 with a 128000 maximum. Other models retain 4096 or manual budget plus 1024 when larger. Opus/Sonnet/Haiku 4.5 are limited to 64000; Opus/Sonnet 4.6 and Opus 4.7/4.8 allow 128000. A manual budget must be smaller than the output limit. Higher effort may exhaust a small allowance before useful text appears; explicitly adjust the limit or reduce effort. Request-level maxTokens can override the configured output limit.

Models with prefix-bound thinking, and any Claude request above 16384 output tokens, stream internally through the SDK and fold into OpenAssist's completed ChatResponse. This avoids the SDK's long non-streaming request restriction. Text is selected by block type; raw thinking, including empty signed blocks, is kept for durable replay rather than channel display. Tools remain automatic and sequentially executed by the runtime; forced tool choice is not sent.

Opus 5.5/Sonnet 5.5/Fable/Mythos 5.1 bind thinking to the conversation prefix. OpenAssist's bounded history, runtime guidance and access-controlled tool list can change that prefix. These requests therefore send `anthropic-beta: thinking-binding-controls-2026-08-01` and adaptive thinking with `block_binding.prefix_mismatch_behavior = "drop_block"`. The API preserves valid blocks and discards stale ones; complete tool-use/results remain replayed. This does not bypass signature checks or persist unbounded history. Custom gateways for these models must support that documented beta contract. Model binding across switches is handled upstream. No beta progress display or fallback-credit behavior is enabled.

Sources: [Claude model lineup](https://platform.claude.com/docs/en/models/overview), [Sonnet 5.5 announcement](https://www.anthropic.com/claude-sonnet-5-5), [Sonnet 5.5 migration](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5), [Opus 5.5 migration](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide), [Fable 5.1](https://platform.claude.com/docs/en/models/fable-5-1/overview), [Mythos 5.1](https://platform.claude.com/docs/en/models/mythos-5-1/overview), [effort](https://platform.claude.com/docs/en/build-with-claude/effort), and [preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).

## Other endpoints and migration

OpenAssist's azure-foundry adapter is Azure OpenAI Responses at `/openai/v1/`. Claude on Microsoft Foundry requires the separate Anthropic Messages contract and is not supported by that adapter. OpenAI-compatible keeps backend-defined Chat Completions without universal reasoning controls. Fresh setup asks for the model ID served by the backend and does not prefill a vendor default. GPT-6.1 Sol tools require Responses; use the OpenAI route (with a compatible custom base URL if needed) or Azure for that contract. New vendor features beyond OpenAssist's existing chat/tool/image contract are not automatically implemented.

Retirement is route-specific and checked against the announced UTC date. Retired IDs remain in saved configuration but block readiness and provider requests before transport. Deprecated IDs warn in readiness and status and remain usable until their announced retirement. `openassist config validate` checks schema/tuning; `openassist doctor` and setup readiness additionally check model availability. Neither rewrites saved model IDs or compatible manual settings.

| Route | Announced retired/deprecated IDs | Repair |
| --- | --- | --- |
| Codex | GPT-5.4/Mini retired August 31; GPT-5.3-Codex-Spark retired September 14 | Explicitly select GPT-6.1 Sol or Luna as appropriate |
| Codex | GPT-5.5 retires October 14; GPT-5.2 and GPT-5.3-Codex deprecated without a recorded retirement date | Choose a current model available to your account; API GPT-5.5 remains available |
| OpenAI API | GPT-5-Codex, GPT-5.1-Codex/Max/Mini and GPT-5.2-Codex retired July 23; older GPT-5/5.1 Chat aliases retired July 23 and GPT-5.2/5.3 Chat aliases August 10 | Select the recorded replacement through wizard; no silent alias rewrite |
| OpenAI API | o1, o3-mini, o4-mini, GPT-4.1 Nano and the specific GPT-4o 2024-05-13 pin retire October 23 | Replace before the date; current GPT-4o alias and other listed pins are unaffected |
| Anthropic | Sonnet 4.5 deprecated September 30, retires November 30 | Move to Sonnet 5.5, explicitly reset incompatible manual settings |
| Anthropic | Sonnet 3.7 retired February 19; Sonnet/Opus 4 retired June 15; Opus 4.1 retired August 5 | Choose the cataloged Sonnet 4.6 or Opus 4.8 replacement, or explicitly choose the latest model |
| Anthropic | Mythos Preview deprecated, retirement unannounced | Use Mythos 5.1 if provisioned |

Haiku 4.5's “not sooner than October 15” commitment is not an announced retirement. It remains active. Anthropic dates here apply to the direct Claude API; Azure OpenAI and partner-hosted Claude have separate schedules.

Sources: [OpenAI API retirements](https://developers.openai.com/api/docs/deprecations), [Codex model retirements](https://learn.chatgpt.com/docs/models), and [Claude lifecycle table](https://platform.claude.com/docs/en/about-claude/model-deprecations).

 Back up TOML, run `openassist setup wizard`, explicitly change the provider, and verify `openassist doctor` plus a real reply. Relinking a healthy account does not fix a retired model. If incompatible tuning prevents configuration loading, remove the conflicting fields in the backed-up TOML and run `openassist config validate` before restarting. Existing Opus 4.5 aliases retain manual budgets.

The catalog lives in `packages/config/src/provider-models.ts`; contracts live in core-types. Setup, validation, requests and status use the same entries. Source checks and fake-transport regression tests establish implemented request behavior; designated live provider/channel tests are still needed for account availability and end-to-end certification.

Restricted Daybreak models declare reasoning replay independently of effort controls: Responses requests ask for encrypted reasoning content and retain it through the existing bounded, session/model-scoped replay path without exposing raw reasoning.
