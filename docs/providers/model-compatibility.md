# Model recommendations and compatibility

Fresh OpenAI API-key and Codex account-login setup recommends `gpt-5.6-terra`. Named alternatives are `gpt-6-astra`, `gpt-5.6-sol`, and `gpt-5.6-luna`. These routes retain separate authentication and transports. The recommendation does not guarantee availability on every account.

Fresh Anthropic setup recommends `claude-sonnet-5`, with `claude-opus-5` and `claude-haiku-4-5-20251001` alternatives. Azure always asks for an existing deployment name. Custom models and deployments remain accepted.

## Capabilities and configuration

`packages/config/src/provider-models.ts` is the bounded source shared by setup, validation, provider request mapping, and status. Core-types owns its interfaces. Matching uses exact IDs rather than name fragments. Unknown models receive no inferred optional controls. OpenAI-compatible retains its existing backend-defined model behavior.

Terra, Sol, and Luna support `none`, `low`, `medium`, `high`, `xhigh`, and `max` reasoning. Astra supports those values except `none`. Older models have narrower choices. `Default` leaves `reasoningEffort` unset and sends no reasoning parameter. Azure applies these controls only to a cataloged `underlyingModel` on the configured deployment; the deployment name itself is never a capability hint.

Anthropic supports optional `thinkingMode` (`adaptive`, `enabled`, `disabled`) and `thinkingEffort` (`low`, `medium`, `high`, `xhigh`, `max`) where cataloged. Sonnet 5 and Opus 5 default to adaptive thinking and reject manual budgets. Haiku 4.5 supports manual thinking, without adaptive mode or effort. Legacy `thinkingBudgetTokens` alone still enables manual thinking on compatible older models. A manual budget cannot coexist with adaptive/disabled mode. Opus 5 cannot disable thinking at `xhigh`/`max`. Invalid combinations return actionable configuration errors.

Wizard edits advanced Anthropic controls. Quickstart preserves existing controls and uses provider defaults on fresh Anthropic setup. Leaving controls unset omits the request fields; it does not disable a provider's default thinking. Manual output limits must exceed the budget. Responses retain the existing internal thinking replay contract and never expose raw thinking to channel users.

## Saved models and retirement

No database migration or automatic model replacement occurs. Existing model IDs, credentials, conversation history, and operator state are preserved. Known retired Codex `gpt-5.4` and `gpt-5.4-mini` selections produce blocking readiness items recommending Terra and Luna respectively. They also fail before a chat transport request. Other custom IDs remain accepted; unknown availability is determined by the upstream service.

Back up the TOML, run `openassist setup wizard`, edit the provider, explicitly enter the recommended replacement, and save. Verify `openassist doctor` and a first reply. Do not relink a healthy account solely to fix model retirement. If unsupported thinking settings prevent loading the config, remove the conflicting fields in the backed-up TOML and run `openassist config validate` before restarting.

## Verification sources

Catalog reviewed on 2026-09-21 against [OpenAI Terra specifications](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [OpenAI model catalog](https://developers.openai.com/api/docs/models), [Codex model guidance](https://learn.chatgpt.com/docs/models), [Anthropic model catalog](https://platform.claude.com/docs/en/models/overview), [Sonnet 5 behavior](https://platform.claude.com/docs/en/models/sonnet-5/overview), and [Anthropic effort controls](https://platform.claude.com/docs/en/build-with-claude/effort). Additions require source verification and request/validation tests. Live availability and account certification remain separate from these local catalog checks.

Anthropic compatibility: the verified `claude-opus-4-5` alias retains manual `thinkingBudgetTokens` exactly like `claude-opus-4-5-20251101`. Quickstart preserves compatible saved thinking settings. If a selected model rejects them (for example, Sonnet 5 with an old manual budget), quickstart asks before resetting to provider defaults. The default answer is No, which returns to model selection so the operator can keep the previous model/settings. Saving remains subject to normal validation; wizard provides the full thinking editor.
