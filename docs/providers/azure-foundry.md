# Azure Foundry Provider

Use the Azure Foundry route when you want Azure resource-style `/openai/v1/` endpoints in OpenAssist.

This route is Responses-only in the current release and expects a model deployment that already exists on your Azure resource.

## What This Route Does

- Auth model: API key or Microsoft Entra host credentials
- Provider type in config: `azure-foundry`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: `reasoningEffort` and independent `reasoningMode` for cataloged underlying models
- Optional compatibility hint: `underlyingModel`

## Choose Azure Foundry When

- you already have an Azure OpenAI or Azure Foundry resource that exposes `/openai/v1/`
- you know the Azure deployment name you want OpenAssist to send in the outgoing `model` field
- you want either API-key auth or host-side Entra auth via `DefaultAzureCredential`
- you want OpenAssist setup and lifecycle output to treat Azure as a first-class provider route instead of a generic compatible backend

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then select `Azure Foundry`.

Quickstart asks for:

- Azure resource name
- endpoint flavor:
  - `openai-resource` for `https://<resource>.openai.azure.com/openai/v1/`
  - `foundry-resource` for `https://<resource>.services.ai.azure.com/openai/v1/`
- deployment name
- auth mode:
  - `API key`
  - `Microsoft Entra ID`
- optional underlying model hint
- optional reasoning effort

If you choose Entra auth, quickstart can also capture:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Leave those unset when the host should rely on Azure CLI login or managed identity instead.

Direct quickstart path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

## Manual TOML Setup

API-key example:

```toml
[[runtime.providers]]
id = "azure-foundry-main"
type = "azure-foundry"
defaultModel = "gpt-5-deployment"
authMode = "api-key"
resourceName = "your-resource-name"
endpointFlavor = "openai-resource"
underlyingModel = "gpt-6.1-sol"
# reasoningEffort = "xhigh"
```

Env file:

```text
OPENASSIST_PROVIDER_AZURE_FOUNDRY_MAIN_API_KEY=replace-me
```

Entra example:

```toml
[[runtime.providers]]
id = "azure-foundry-main"
type = "azure-foundry"
defaultModel = "gpt-5-deployment"
authMode = "entra"
resourceName = "your-resource-name"
endpointFlavor = "foundry-resource"
underlyingModel = "gpt-6.1-sol"
# reasoningEffort = "xhigh"
```

Optional service-principal env vars:

```text
AZURE_TENANT_ID=replace-me
AZURE_CLIENT_ID=replace-me
AZURE_CLIENT_SECRET=replace-me
```

## Relevant Config Fields

Schema-backed provider fields:

- `id`
- `type = "azure-foundry"`
- `defaultModel`
- `authMode = "api-key" | "entra"`
- `resourceName`
- `endpointFlavor = "openai-resource" | "foundry-resource"`
- `underlyingModel` (optional)
- `reasoningEffort` (optional, `none|low|medium|high|xhigh|max`, filtered by the exact model and route)
- `reasoningMode` (optional, `standard|pro`, requires a cataloged supporting `underlyingModel`; wizard exposes this independently of effort)
- `baseUrl` (optional advanced override)
- `metadata` (optional)

Important semantics:

- `defaultModel` is the Azure deployment name sent in the outgoing `model` field
- `underlyingModel` is optional; it controls model-specific tuning, validation, sampling and replay scope without changing the deployment sent to Azure
- this route uses Azure resource-style endpoints only
- this route uses the Responses API only

## Verify the Route

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist auth status --provider azure-foundry-main
openassist doctor
```

What to look for:

- the provider appears with route `Azure Foundry`
- `auth status` reports `API key` or `Entra ID`
- `doctor` shows the deployment name as the primary model plus the saved tuning state

## Deployment, Image, and Reasoning Notes

- Azure Foundry can inspect inbound image attachments on this route.
- `reasoningEffort` is only sent on supported Responses-model families.
- Set `underlyingModel` to the actual cataloged model to enable supported tuning, even if the deployment name resembles a model ID. Without a verified hint, effort is omitted and explicit `reasoningMode` fails validation.
- If the deployment does not exist on the selected resource, chat fails as a deployment problem rather than as a generic auth problem.

## Common Problems

Auth looks wrong:

```bash
openassist auth status --provider azure-foundry-main
openassist doctor
```

Check:

- API-key mode has `OPENASSIST_PROVIDER_<ID>_API_KEY`
- Entra mode shows `Active auth: Entra ID`
- service-principal auth has either all three Azure env vars set or none of them set

Deployment or model mismatch:

- confirm the deployment exists on the selected Azure resource
- confirm the endpoint flavor matches the real host
- confirm the deployment supports the Responses API
- set `underlyingModel` to the actual model when enabling model-specific tuning; never use a deployment name as capability evidence

Start with:

- [`docs/operations/common-troubleshooting.md`](../operations/common-troubleshooting.md)

## Modernization compatibility

A deployment name never establishes model capabilities, even if it resembles a model ID. Optional reasoning is sent only when `underlyingModel` is a cataloged model and the request uses that configured deployment. API-key and Entra authentication remain separate from linked accounts.

GPT-6.1 Sol and GPT-6 Astra/older Sol/Luna hints are cataloged for this Responses route. Azure documents none through max for all four, including Astra and GPT-6.1 Sol; this differs from the OpenAI API catalog. Optional reasoningMode selects standard/pro, with Default omitting mode and Pro potentially increasing cost. Wizard exposes it only for known hints. No hint means no inferred effort; explicit mode without a verified hint fails validation. Region, deployment version and quota still determine availability. Claude on Microsoft Foundry uses a Messages endpoint and is not supported by this Azure OpenAI Responses adapter.

Azure Identity 4.13.3 and OpenAI SDK 7.23.0 remain current stable. Entra scope stays `https://ai.azure.com/.default`. Responses replay is bounded and scoped to this provider, deployment and underlying-model hint, preserving opaque reasoning alongside tool results. See [authentication/harness readiness](../operations/provider-channel-readiness.md).

GPT-6.1 Sol is cataloged for Azure through `underlyingModel = "gpt-6.1-sol"`. New setup suggests xhigh only when that exact hint is supplied; deployment names stay operator-defined and saved effort (including omission) stays intact. Microsoft's feature table permits none on this Azure model, while OpenAI's API model excludes it. Azure still requires an available deployment in the operator's region and quota. See [route-specific compatibility and sources](model-compatibility.md).

## Related Docs

- [OpenAI Provider](openai.md)
- [Configuration Reference](../configuration/config-reference.md)
- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)

Installation note: packaged releases include the runtime and adapter dependencies; existing provider/channel configuration stays in operator state across updates. For isolated developer testing, use dedicated test credentials and enable channels explicitly. See [developer testing](../operations/developer-testing.md) and [upgrade/recovery](../operations/upgrade-and-rollback.md).
