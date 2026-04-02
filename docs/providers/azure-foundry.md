# Azure Foundry Provider

Use the Azure Foundry route when you want Azure resource-style `/openai/v1/` endpoints in OpenAssist.

This route is Responses-only in the current release and expects a model deployment that already exists on your Azure resource.

## What This Route Does

- Auth model: API key or Microsoft Entra host credentials
- Provider type in config: `azure-foundry`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: `reasoningEffort` for supported Responses-model families
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
underlyingModel = "gpt-5.4"
# reasoningEffort = "medium"
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
underlyingModel = "gpt-5.4"
# reasoningEffort = "medium"
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
- `reasoningEffort` (optional, `low|medium|high|xhigh`)
- `baseUrl` (optional advanced override)
- `metadata` (optional)

Important semantics:

- `defaultModel` is the Azure deployment name sent in the outgoing `model` field
- `underlyingModel` is optional and only used for reasoning gating plus operator-facing validation hints
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
- If the deployment name hides the actual model family, set `underlyingModel` so OpenAssist can warn more accurately about unsupported reasoning or non-Responses-capable models.
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
- add `underlyingModel` if the deployment name is opaque and validation warnings are too generic

Start with:

- [`docs/operations/common-troubleshooting.md`](../operations/common-troubleshooting.md)

## Related Docs

- [OpenAI Provider](openai.md)
- [Configuration Reference](../configuration/config-reference.md)
- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)
