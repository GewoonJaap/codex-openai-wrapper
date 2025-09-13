# 🤖 OpenAI Codex CLI Wrapper

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/mrproper)

Transform OpenAI's Codex models into OpenAI-compatible endpoints using Cloudflare Workers. Access advanced reasoning capabilities and seamless API compatibility, powered by OAuth2 authentication and the same infrastructure that drives the official OpenAI Codex CLI.

## ✨ Features

- 🔐 **OAuth2 Authentication** - Uses your OpenAI account credentials via Codex CLI
- 🎯 **OpenAI-Compatible API** - Drop-in replacement for OpenAI endpoints
- 📚 **OpenAI SDK Support** - Works with official OpenAI SDKs and libraries
- 🧠 **Advanced Reasoning** - Configurable reasoning effort with `think-tags` compatibility
- 🛡️ **API Key Security** - Optional authentication layer for endpoint access
- 🌐 **Third-party Integration** - Compatible with Open WebUI, Cline, and more
- ⚡ **Cloudflare Workers** - Global edge deployment with low latency
- 🔄 **Smart Token Management** - Automatic token refresh with KV storage
- 📡 **Real-time Streaming** - Server-sent events for live responses
- 🦙 **Ollama Compatibility** - Full Ollama API support for local model workflows
- 🎛️ **Flexible Tool Support** - OpenAI-compatible function calling

## 🚀 Quick Start

### Deployment Options

Choose your preferred deployment method:

- **🌐 Cloudflare Workers** (Recommended) - Serverless, global edge deployment
- **🐳 Docker** - Self-hosted with full control - [See Docker Guide](docs/docker.md)

### Credentials

Configure credentials once here without scrolling around. There are three layers:

- Client access key: Used by clients calling this wrapper.
- Upstream to ChatGPT (default): Uses Codex CLI OAuth tokens.
- Upstream to third‑party provider (optional): Forwards an API key to a custom responses endpoint.

1) Client access key (required)

- Purpose: Protects `/v1/*` and `/api/*` endpoints of this wrapper.
- Variable: `OPENAI_API_KEY` (any `sk-...` style secret).
- Cloudflare Workers:
  - `wrangler secret put OPENAI_API_KEY`
- Docker (`.env` or `--env`):
  - `OPENAI_API_KEY=sk-your-secret-api-key-here`

2) Upstream to ChatGPT via Codex CLI (default path)

- Variables: `OPENAI_CODEX_AUTH` (paste full `auth.json`), `CHATGPT_LOCAL_CLIENT_ID`, `CHATGPT_RESPONSES_URL`.
- Cloudflare Workers:
  - `wrangler secret put OPENAI_CODEX_AUTH`
  - `wrangler secret put CHATGPT_LOCAL_CLIENT_ID`
  - `wrangler secret put CHATGPT_RESPONSES_URL`
- Docker (`.env`):
  - `OPENAI_CODEX_AUTH={...auth.json...}`
  - `CHATGPT_LOCAL_CLIENT_ID=your_client_id_here`
  - `CHATGPT_RESPONSES_URL=https://chatgpt.com/backend-api/codex/responses`

3) Upstream to a third‑party provider (credential forwarding, optional)

- Choose the endpoint (pick one):
  - `UPSTREAM_RESPONSES_URL=https://example.com/v1/responses` (highest priority)
  - or `UPSTREAM_BASE_URL=https://example.com/v1` with optional `UPSTREAM_WIRE_API_PATH=/responses`
- Choose auth mode：
  - `UPSTREAM_AUTH_MODE=chatgpt_token` (default; uses `OPENAI_CODEX_AUTH.tokens.access_token`)
  - `UPSTREAM_AUTH_MODE=apikey_auth_json` (reads key from `OPENAI_CODEX_AUTH[UPSTREAM_AUTH_ENV_KEY | default OPENAI_API_KEY]`)
  - `UPSTREAM_AUTH_MODE=apikey_env` (uses `UPSTREAM_API_KEY`)
- Optional header customization: `UPSTREAM_AUTH_HEADER` (default Authorization), `UPSTREAM_AUTH_SCHEME` (default Bearer)
- Cloudflare Workers (example: apikey_env):
  - `wrangler secret put UPSTREAM_RESPONSES_URL` → `https://example.com/v1/responses`
  - `wrangler secret put UPSTREAM_AUTH_MODE` → `apikey_env`
  - `wrangler secret put UPSTREAM_API_KEY` → `sk-your-upstream-api-key`
- Docker (.env example):
  - `UPSTREAM_RESPONSES_URL=https://example.com/v1/responses`
  - `UPSTREAM_AUTH_MODE=apikey_env`
  - `UPSTREAM_API_KEY=sk-your-upstream-api-key`

### Prerequisites (Cloudflare Workers)

1. **OpenAI Account** with Codex CLI access
2. **Cloudflare Account** with Workers enabled
3. **Wrangler CLI** installed (`npm install -g wrangler`)

### Step 1: Get OAuth2 Credentials

You need OAuth2 credentials from the official OpenAI Codex CLI.

#### Using OpenAI Codex CLI

1. **Install OpenAI Codex CLI**:
   ```bash
   npm install -g @openai/codex
   # Alternatively: brew install codex
   ```

2. **Start Codex and authenticate**:
   ```bash
   codex
   ```
   
   Select **"Sign in with ChatGPT"** when prompted. You'll need a Plus, Pro, or Team ChatGPT account to access the latest models, including gpt-5, at no extra cost to your plan.

3. **Complete authentication**:
   
   The login process will start a server on `localhost:1455`. Open the provided URL in your browser to complete the authentication flow.

4. **Locate the credentials file**:
   
   **Windows:**
   ```
   C:\Users\USERNAME\.codex\auth.json
   ```
   
   **macOS/Linux:**
   ```
   ~/.codex/auth.json
   ```

5. **Copy the credentials**:
   The file contains JSON in this format:
   ```json
   {
     "tokens": {
       "id_token": "eyJhbGciOiJSUzI1NiIs...",
       "access_token": "sk-proj-...",
       "refresh_token": "rft_...",
       "account_id": "user-..."
     },
     "last_refresh": "2024-01-15T10:30:00.000Z"
   }
   ```

#### Important Migration Notes

If you've used the Codex CLI before:
1. Update the CLI and ensure `codex --version` is 0.20.0 or later
2. Delete `~/.codex/auth.json` (or `C:\Users\USERNAME\.codex\auth.json` on Windows)
3. Run `codex` and authenticate again

#### Headless/Remote Server Setup

If you're on a headless server or SSH'd into a remote machine:

**Option 1: Copy credentials from local machine**
```bash
# Authenticate locally first, then copy the auth.json file
scp ~/.codex/auth.json user@remote:~/.codex/auth.json
```

**Option 2: Port forwarding for remote authentication**
```bash
# From your local machine, create an SSH tunnel
ssh -L 1455:localhost:1455 user@remote-host

# Then run codex in the SSH session and open localhost:1455 locally
```

#### Alternative: API Key Authentication

You can also use your OpenAI API key instead:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

To force API key usage even when ChatGPT auth exists:
```bash
codex --config preferred_auth_method="apikey"
```

### Step 2: Create KV Namespace

```bash
# Create a KV namespace for token caching
wrangler kv namespace create "KV"
```

Note the namespace ID returned and update `wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "KV", id = "your-kv-namespace-id" }
]
```

### Step 3: Environment Setup

Create a `.dev.vars` file:
```bash
# Required: API key for client authentication
OPENAI_API_KEY=sk-your-secret-api-key-here

# Required: Codex CLI authentication JSON
OPENAI_CODEX_AUTH={"tokens":{"id_token":"eyJ...","access_token":"sk-proj-...","refresh_token":"rft_...","account_id":"user-..."},"last_refresh":"2024-01-15T10:30:00.000Z"}

# Required: ChatGPT API configuration
CHATGPT_LOCAL_CLIENT_ID=your_client_id_here
CHATGPT_RESPONSES_URL=https://chatgpt.com/backend-api/codex/responses

# Optional: Ollama integration
OLLAMA_API_URL=http://localhost:11434

# Optional: Reasoning configuration
REASONING_EFFORT=medium
REASONING_SUMMARY=auto
REASONING_COMPAT=think-tags

# Optional: Debug settings
VERBOSE=false
DEBUG_MODEL=
```

For production, set the secrets:
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put OPENAI_CODEX_AUTH
wrangler secret put CHATGPT_LOCAL_CLIENT_ID
wrangler secret put CHATGPT_RESPONSES_URL
```

### Step 4: Deploy

#### Option A: Cloudflare Workers (Recommended)

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy

# Or run locally for development
npm run dev
```

#### Option B: Docker Deployment

For self-hosted deployment with Docker, see the comprehensive [Docker Deployment Guide](docs/docker.md).

Quick Docker start with pre-built image:
```bash
# Pull and run the latest image
docker pull ghcr.io/gewoonjaap/codex-openai-wrapper:latest

# Create environment file
echo "OPENAI_API_KEY=sk-your-api-key-here" > .env
echo "OPENAI_CODEX_AUTH={...your-auth-json...}" >> .env

# Run the container
docker run -d \
  --name codex-openai-wrapper \
  -p 8787:8787 \
  --env-file .env \
  ghcr.io/gewoonjaap/codex-openai-wrapper:latest
```

Or use Docker Compose for development:
```bash
git clone https://github.com/GewoonJaap/codex-openai-wrapper.git
cd codex-openai-wrapper
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your configuration
docker-compose up -d
```

The service will be available at `http://localhost:8787`

## 🔧 Configuration

### Environment Variables

#### Core Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | API key for client authentication |
| `OPENAI_CODEX_AUTH` | ✅ | OAuth2 credentials JSON from Codex CLI |
| `CHATGPT_LOCAL_CLIENT_ID` | ✅ | ChatGPT client ID |
| `CHATGPT_RESPONSES_URL` | ✅ | ChatGPT API endpoint URL |

#### Reasoning & Intelligence

| Variable | Default | Description |
|----------|---------|-------------|
| `REASONING_EFFORT` | `minimal` | Reasoning effort level: `minimal`, `low`, `medium`, `high` |
| `REASONING_SUMMARY` | `auto` | Reasoning summary mode: `auto`, `on`, `off` |
| `REASONING_COMPAT` | `think-tags` | Reasoning output format: `think-tags`, `standard` |

#### Integration & Tools

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_API_URL` | `http://localhost:11434` | Ollama instance URL for local model integration |
| `DEBUG_MODEL` | - | Override model for debugging purposes |
| `VERBOSE` | `false` | Enable detailed debug logging |

### Third‑party Model Providers (Credential Forwarding)

This wrapper can forward your Codex CLI credentials to a custom upstream provider that speaks the Codex "responses" wire API (e.g., `.../v1/responses`). You can choose whether to forward the ChatGPT OAuth token or an API key stored in your Codex `auth.json`.

1) Select upstream endpoint (one of either A or B):

- Option A (full URL, highest priority):
  - `UPSTREAM_RESPONSES_URL=https://example.com/v1/responses`
- Option B (base URL + wire path):
  - `UPSTREAM_BASE_URL=https://example.com/v1`
  - `UPSTREAM_WIRE_API_PATH=/responses` (default)

2) Select upstream auth mode via `UPSTREAM_AUTH_MODE`:

- `chatgpt_token` (default): Forwards the OAuth `access_token` from `OPENAI_CODEX_AUTH.tokens.access_token`.
- `apikey_auth_json`: Reads an API key from the `OPENAI_CODEX_AUTH` JSON by key name `UPSTREAM_AUTH_ENV_KEY` (default `OPENAI_API_KEY`) and forwards it as `Authorization: Bearer <key>`.
- `apikey_env`: Reads `UPSTREAM_API_KEY` from environment and forwards it as `Authorization: Bearer <key>`.

Optional header customization:

- `UPSTREAM_AUTH_HEADER` (default: `Authorization`)
- `UPSTREAM_AUTH_SCHEME` (default: `Bearer`)

Example `.dev.vars` (use API key from `auth.json`):

```
UPSTREAM_BASE_URL=https://example.com/v1
UPSTREAM_WIRE_API_PATH=/responses
UPSTREAM_AUTH_MODE=apikey_auth_json
UPSTREAM_AUTH_ENV_KEY=OPENAI_API_KEY
```

Example `.dev.vars` (use separate env API key):

```
UPSTREAM_RESPONSES_URL=https://example.com/v1/responses
UPSTREAM_AUTH_MODE=apikey_env
UPSTREAM_API_KEY=sk-your-upstream-api-key
```

Notes:

- When `chatgpt_token` mode is used, token auto-refresh still applies on 401 and is retried.
- `chatgpt-account-id` header is forwarded when available; most third‑party providers ignore it safely.
- If neither `UPSTREAM_*` variables are set, the wrapper calls `CHATGPT_RESPONSES_URL` (default behavior).

#### Authentication Security

- When `OPENAI_API_KEY` is set, all `/v1/*` and `/api/*` endpoints require authentication
- Clients must include the header: `Authorization: Bearer <your-api-key>`
- Recommended format: `sk-` followed by a random string (e.g., `sk-1234567890abcdef...`)
- Without this variable, endpoints are publicly accessible (not recommended for production)

#### OAuth Token Management

- **Automatic Refresh**: Tokens are automatically refreshed when they expire or are older than 28 days
- **KV Persistence**: Refreshed tokens are stored in Cloudflare KV for persistence across requests
- **Fallback Logic**: Falls back from KV → environment → refresh → retry seamlessly
- **Debug Logging**: Comprehensive token source tracking for troubleshooting

### KV Namespaces

| Binding | Purpose |
|---------|---------|
| `KV` | OAuth token caching and session management |

## 🎯 API Endpoints

### Base URL
```
https://your-worker.your-subdomain.workers.dev
```

### OpenAI-Compatible Endpoints

#### Chat Completions
```http
POST /v1/chat/completions
Authorization: Bearer sk-your-api-key-here
Content-Type: application/json

{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user", 
      "content": "Explain quantum computing in simple terms"
    }
  ],
  "stream": true
}
```

#### Advanced Reasoning
Enable enhanced reasoning capabilities:
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user", 
      "content": "Solve this step by step: What is the derivative of x^3 + 2x^2 - 5x + 3?"
    }
  ],
  "reasoning": {
    "effort": "high",
    "summary": "on"
  }
}
```

#### Text Completions
```http
POST /v1/completions
Authorization: Bearer sk-your-api-key-here
Content-Type: application/json

{
  "model": "gpt-3.5-turbo-instruct",
  "prompt": "Write a Python function to calculate fibonacci numbers:",
  "max_tokens": 150,
  "stream": true
}
```

#### List Models
```http
GET /v1/models
Authorization: Bearer sk-your-api-key-here
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1708976947,
      "owned_by": "openai-codex"
    }
  ]
}
```

### Ollama-Compatible Endpoints

#### Chat Interface
```http
POST /api/chat
Authorization: Bearer sk-your-api-key-here
Content-Type: application/json

{
  "model": "llama2",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true
}
```

#### List Models
```http
GET /api/tags
Authorization: Bearer sk-your-api-key-here
```

#### Model Information
```http
POST /api/show
Authorization: Bearer sk-your-api-key-here
Content-Type: application/json

{
  "name": "llama2"
}
```

### Utility Endpoints

#### Health Check
```http
GET /health
```
*No authentication required*

#### Service Information
```http
GET /
```
*No authentication required*

## 🛠️ Tool Calling Support

The wrapper supports OpenAI-compatible tool calling (function calling) with seamless integration.

### Example Tool Call

```javascript
const response = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-your-api-key-here'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather information for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { 
                type: 'string', 
                description: 'City name' 
              },
              unit: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit'
              }
            },
            required: ['location']
          }
        }
      }
    ],
    tool_choice: 'auto'
  })
});
```

### Tool Choice Options

- `auto`: Let the model decide whether to call a function
- `none`: Disable function calling
- `{"type": "function", "function": {"name": "function_name"}}`: Force a specific function call

## 💻 Usage Examples

### Cline Integration

[Cline](https://github.com/cline/cline) is a powerful AI assistant extension for VS Code:

1. **Install Cline** in VS Code from the Extensions marketplace

2. **Configure OpenAI API settings**:
   - Set **API Provider** to "OpenAI"
   - Set **Base URL** to: `https://your-worker.workers.dev/v1`
   - Set **API Key** to: `sk-your-secret-api-key-here`

3. **Select models**:
   - Use `gpt-4` for complex reasoning tasks
   - Use `gpt-3.5-turbo` for faster responses

### Open WebUI Integration

1. **Add as OpenAI-compatible endpoint**:
   - Base URL: `https://your-worker.workers.dev/v1`
   - API Key: `sk-your-secret-api-key-here`

2. **Auto-discovery**:
   Open WebUI will automatically discover available models through the `/v1/models` endpoint.

### OpenAI SDK (Python)
```python
from openai import OpenAI

# Initialize with your worker endpoint
client = OpenAI(
    base_url="https://your-worker.workers.dev/v1",
    api_key="sk-your-secret-api-key-here"
)

# Chat completion with reasoning
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful coding assistant."},
        {"role": "user", "content": "Write a binary search algorithm in Python"}
    ],
    extra_body={
        "reasoning": {
            "effort": "high",
            "summary": "on"
        }
    },
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### OpenAI SDK (JavaScript/TypeScript)
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://your-worker.workers.dev/v1',
  apiKey: 'sk-your-secret-api-key-here',
});

const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Explain async/await in JavaScript' }
  ],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  process.stdout.write(content);
}
```

### cURL Examples
```bash
# Chat completion
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-api-key-here" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Explain machine learning"}
    ]
  }'

# Ollama chat
curl -X POST https://your-worker.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-secret-api-key-here" \
  -d '{
    "model": "llama2",
    "messages": [
      {"role": "user", "content": "Hello world!"}
    ]
  }'
```

### LiteLLM Integration

[LiteLLM](https://github.com/BerriAI/litellm) works seamlessly with the wrapper:

```python
import litellm

# Configure LiteLLM to use your worker
litellm.api_base = "https://your-worker.workers.dev/v1"
litellm.api_key = "sk-your-secret-api-key-here"

# Use with reasoning capabilities
response = litellm.completion(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Solve this step by step: What is 15 * 24?"}
    ],
    extra_body={
        "reasoning": {
            "effort": "medium",
            "summary": "auto"
        }
    },
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## 🧠 Advanced Reasoning

The wrapper provides sophisticated reasoning capabilities with multiple configuration options:

### Reasoning Modes

#### Effort Levels
- **`minimal`**: Basic reasoning with minimal token overhead
- **`medium`**: Balanced reasoning for most use cases  
- **`high`**: Deep reasoning for complex problems

#### Summary Options
- **`auto`**: Automatically decide when to include reasoning summaries
- **`on`**: Always include reasoning summaries in responses
- **`off`**: Never include reasoning summaries

#### Compatibility Formats
- **`think-tags`**: Wrap reasoning in `<think>` tags for DeepSeek R1-style output

### Configuration Examples

**Environment-level configuration** (applies to all requests):
```bash
REASONING_EFFORT=high
REASONING_SUMMARY=on
REASONING_COMPAT=think-tags
```

**Request-level overrides**:
```json
{
  "model": "gpt-4",
  "messages": [...],
  "reasoning": {
    "effort": "high",
    "summary": "on"
  }
}
```

### Reasoning Output Format

When reasoning is enabled, responses include structured thinking:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion.chunk",
  "created": 1708976947,
  "model": "gpt-4",
  "choices": [{
    "index": 0,
    "delta": {
      "content": "<think>\nLet me break this problem down step by step...\n</think>\n\nTo solve this equation..."
    },
    "finish_reason": null
  }]
}
```

## 🚨 Troubleshooting

### Common Issues

**401 Authentication Error**
- Verify your `OPENAI_API_KEY` is correctly set
- Check if client is sending `Authorization: Bearer <key>` header
- Ensure the API key format starts with `sk-`

**OAuth Token Refresh Failed**
- Check if your `OPENAI_CODEX_AUTH` credentials are valid
- Ensure the refresh token hasn't expired
- Verify the JSON format matches the expected structure

**KV Storage Issues**
- Confirm KV namespace is correctly configured in `wrangler.toml`
- Check KV namespace permissions in Cloudflare dashboard
- Verify the binding name matches (`KV`)

**Upstream Connection Errors**
- Check if `CHATGPT_RESPONSES_URL` is accessible
- Verify network connectivity from Cloudflare Workers
- Ensure OAuth tokens have proper scopes

### Debug Endpoints

```bash
# Check authentication status
curl -X POST https://your-worker.workers.dev/debug/auth \
  -H "Authorization: Bearer sk-your-api-key-here"

# Test token refresh
curl -X POST https://your-worker.workers.dev/debug/refresh \
  -H "Authorization: Bearer sk-your-api-key-here"
```

## 🏗️ How It Works

```mermaid
graph TD
    A[Client Request] --> B[Cloudflare Worker]
    B --> C[API Key Validation]
    C --> D{Valid API Key?}
    D -->|No| E[401 Unauthorized]
    D -->|Yes| F{Token in KV Cache?}
    F -->|Yes| G[Use Cached Token]
    F -->|No| H[Check Environment Token]
    H --> I{Token Valid?}
    I -->|Yes| J[Cache & Use Token]
    I -->|No| K[Refresh Token]
    K --> L[Cache New Token]
    G --> M[Call ChatGPT API]
    J --> M
    L --> M
    M --> N{Success?}
    N -->|No| O[Auto-retry with Refresh]
    N -->|Yes| P[Apply Reasoning]
    O --> P
    P --> Q[Stream Response]
    Q --> R[OpenAI Format]
    R --> S[Client Response]
```

The wrapper acts as a secure translation layer, managing OAuth2 authentication automatically while providing OpenAI-compatible responses with advanced reasoning capabilities.

## 🔒 Security Features

- **API Key Authentication**: Configurable endpoint protection
- **OAuth2 Token Management**: Secure credential handling
- **Automatic Token Refresh**: Seamless session management
- **KV Storage Encryption**: Secure token persistence
- **Environment Isolation**: Separate dev/prod configurations
- **CORS Protection**: Configurable cross-origin policies

## 📊 Performance

- **Global Edge Deployment**: Cloudflare's worldwide network
- **Intelligent Caching**: KV-based token management
- **Streaming Responses**: Real-time data delivery
- **Connection Pooling**: Optimized upstream connections
- **Automatic Retries**: Resilient error handling

## 🤝 Contributing

1. Fork the repository: [https://github.com/GewoonJaap/codex-openai-wrapper](https://github.com/GewoonJaap/codex-openai-wrapper)
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run linting: `npm run lint`
5. Test thoroughly: `npm test`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

### Development Setup

```bash
git clone https://github.com/GewoonJaap/codex-openai-wrapper.git
cd codex-openai-wrapper
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your configuration
npm run dev
```

### Available Scripts

```bash
npm run dev          # Start development server
npm run deploy       # Deploy to Cloudflare Workers  
npm run lint         # Run ESLint and TypeScript checks
npm run format       # Format code with Prettier
npm test            # Run test suite
npm run build       # Build the project
```

## 📄 License

This codebase is provided for personal use and self-hosting only.

Redistribution of the codebase, whether in original or modified form, is not permitted without prior written consent from the author.

You may fork and modify the repository solely for the purpose of running and self-hosting your own instance.

Any other form of distribution, sublicensing, or commercial use is strictly prohibited unless explicitly authorized.

## 🙏 Acknowledgments

- Inspired by the official [OpenAI Codex CLI](https://github.com/openai/codex-cli)
- Built on [Cloudflare Workers](https://workers.cloudflare.com/)
- Uses [Hono](https://hono.dev/) web framework
- Token management patterns from [OpenAI SDK](https://github.com/openai/openai-node)

---

**⚠️ Important**: This project uses OpenAI's Codex API which may have usage limits and terms of service. Please ensure compliance with OpenAI's policies when using this wrapper.

[![Star History Chart](https://api.star-history.com/svg?repos=GewoonJaap/codex-openai-wrapper&type=Date)](https://www.star-history.com/#GewoonJaap/codex-openai-wrapper&Date)
