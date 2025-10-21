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

export interface ModelPreset {
	id: string;
	label: string;
	description: string;
	model: string;
	effort: ReasoningEffort;
}
