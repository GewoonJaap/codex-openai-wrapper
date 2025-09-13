// Strict type definitions for environment variables
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";
export type ReasoningSummary = "auto" | "on" | "off";
export type ReasoningCompat = "think-tags" | "standard";
export type VerboseMode = "true" | "false";

// Strict types for API and message handling
export type MessageRole = "system" | "user" | "assistant" | "tool";
export type ToolType = "function";
export type ToolChoiceType = "auto" | "none" | { type: "function"; function: { name: string } };
export type InputItemType = "message" | "function_call" | "function_call_output";

export interface Env {
	KV?: KVNamespace; // Optional KV namespace for token storage
	OPENAI_API_KEY: string;
	CHATGPT_LOCAL_CLIENT_ID: string;
	CHATGPT_RESPONSES_URL: string;
	OPENAI_CODEX_AUTH: string;
	OLLAMA_API_URL?: string;
	DEBUG_MODEL?: string;
	REASONING_EFFORT?: ReasoningEffort;
	REASONING_SUMMARY?: ReasoningSummary;
	REASONING_COMPAT?: ReasoningCompat;
	VERBOSE?: VerboseMode;

	// --- Upstream provider overrides ---
	// If set, overrides CHATGPT_RESPONSES_URL entirely
	UPSTREAM_RESPONSES_URL?: string;
	// If set (and UPSTREAM_RESPONSES_URL not set), request URL becomes `${UPSTREAM_BASE_URL}/responses`
	UPSTREAM_BASE_URL?: string;
	// Optional override for the path appended to UPSTREAM_BASE_URL (default: "/responses")
	UPSTREAM_WIRE_API_PATH?: string;

	// How to authenticate to the upstream provider
	//   - "chatgpt_token" (default): Use OAuth access_token from OPENAI_CODEX_AUTH
	//   - "apikey_auth_json": Use OPENAI_CODEX_AUTH[UPSTREAM_AUTH_ENV_KEY] (default key: "OPENAI_API_KEY")
	//   - "apikey_env": Use UPSTREAM_API_KEY env var
	UPSTREAM_AUTH_MODE?: "chatgpt_token" | "apikey_auth_json" | "apikey_env";
	// The key name within OPENAI_CODEX_AUTH JSON to read when using apikey_auth_json (default: OPENAI_API_KEY)
	UPSTREAM_AUTH_ENV_KEY?: string;
	// API key to send upstream when using apikey_env
	UPSTREAM_API_KEY?: string;
	// Header name and scheme used for upstream auth (defaults: Authorization / Bearer)
	UPSTREAM_AUTH_HEADER?: string;
	UPSTREAM_AUTH_SCHEME?: string;

	// Optional: wire schema variant for tools/tool_choice
	//   - "nested" (default): tools[].function.name (OpenAI Responses style)
	//   - "flat": tools[].name (some third-party providers)
	UPSTREAM_TOOLS_FORMAT?: "nested" | "flat";

	// --- Client header forwarding controls ---
	// Controls how incoming client headers are forwarded to the upstream.
	//   - "off" (default): do not forward client headers
	//   - "safe": forward a safe allowlist (UA, Accept-Language, sec-ch-* , X-Forwarded-For, etc.)
	//   - "list": forward only headers explicitly listed in FORWARD_CLIENT_HEADERS_LIST
	//   - "override": after building default headers, override final headers using explicit key-value map
	FORWARD_CLIENT_HEADERS_MODE?: "off" | "safe" | "list" | "override";
	// When mode = "override": JSON string mapping header names to values, e.g.
	// '{"User-Agent":"MyApp/1.0","Accept":"text/event-stream"}'
	FORWARD_CLIENT_HEADERS_OVERRIDE?: string;
	// Comma-separated header names (case-insensitive) used when mode = "list"
	FORWARD_CLIENT_HEADERS_LIST?: string;
}

export type AuthTokens = {
	OPENAI_API_KEY: string;
	tokens: {
		id_token: string;
		access_token: string;
		refresh_token: string;
		account_id: string;
	};
	last_refresh: string;
};

export type InputItem = {
	type: InputItemType;
	role?: MessageRole;
	content?: string | Array<{ type?: string; text?: string; content?: string; image_url?: { url: string } | string }>;
	call_id?: string;
	output?: string;
	name?: string;
	arguments?: string;
};

export type ChatMessage = {
	role: MessageRole;
	content?: string | Array<{ type?: string; text?: string; content?: string; image_url?: { url: string } | string }>;
	tool_call_id?: string;
	id?: string;
	tool_calls?: Array<{
		type?: ToolType;
		id?: string;
		call_id?: string;
		function?: {
			name?: string;
			arguments?: string;
		};
	}>;
};

export type Tool = {
	type: ToolType;
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
};

export type ToolDefinition = {
	type: ToolType;
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
};

export type ToolChoice = ToolChoiceType;

export interface TokenData {
	id_token: string;
	access_token: string;
	refresh_token: string;
	account_id?: string;
}

export interface AuthDotJson {
	OPENAI_API_KEY?: string;
	tokens?: TokenData;
	last_refresh?: string; // ISO 8601 timestamp
}

export interface RefreshRequest {
	client_id: string;
	grant_type: string;
	refresh_token: string;
	scope: string;
}

export interface RefreshResponse {
	id_token: string;
	access_token?: string;
	refresh_token?: string;
}
