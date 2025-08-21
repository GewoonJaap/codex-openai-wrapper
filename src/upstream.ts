import { normalizeModelName } from "./utils";
import { getRefreshedAuth, refreshAccessToken } from "./auth_kv"; // Updated import
import { getBaseInstructions } from "./instructions";
import { Env, InputItem, Tool } from "./types"; // Import types

type ReasoningParam = {
	effort?: string;
	summary?: string;
};

type ToolChoice = "auto" | "none" | { type: string; function: { name: string } };

type OllamaPayload = Record<string, unknown>;

type ErrorBody = {
	error?: {
		message: string;
	};
	raw?: string;
	[key: string]: unknown;
};

async function generateSessionId(instructions: string | undefined, inputItems: InputItem[]): Promise<string> {
	const content = `${instructions || ""}|${JSON.stringify(inputItems)}`;
	const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function startUpstreamRequest(
	env: Env, // Pass the environment object
	model: string,
	inputItems: InputItem[],
	options?: {
		instructions?: string;
		tools?: Tool[];
		toolChoice?: ToolChoice;
		parallelToolCalls?: boolean;
		reasoningParam?: ReasoningParam;
		ollamaPath?: string; // Added for Ollama specific paths
		ollamaPayload?: OllamaPayload; // Added for Ollama specific payloads
	}
): Promise<{ response: Response | null; error: Response | null }> {
	const { instructions, tools, toolChoice, parallelToolCalls, reasoningParam } = options || {};

	const { accessToken, accountId } = await getRefreshedAuth(env);

	// Debug logging for token source
	if (env.KV) {
		try {
			const kvTokens = await env.KV.get("auth_tokens", "json");
			if (kvTokens) {
				console.log("🔄 AUTH DEBUG: KV tokens available for potential use");
			} else {
				console.log("🔄 AUTH DEBUG: No tokens in KV storage");
			}
		} catch (e) {
			console.error("🔄 AUTH DEBUG: Error checking KV tokens:", e);
		}
	}

	if (!accessToken || !accountId) {
		return {
			response: null,
			error: new Response(
				JSON.stringify({
					error: {
						message: "Missing ChatGPT credentials. Run 'codex login' first"
					}
				}),
				{ status: 401, headers: { "Content-Type": "application/json" } }
			)
		};
	}

	const include: string[] = [];
	if (reasoningParam?.effort !== "none") {
		include.push("reasoning.encrypted_content");
	}

	const isOllamaRequest = Boolean(options?.ollamaPath);
	const requestUrl = isOllamaRequest
		? `${env.OLLAMA_API_URL}${options?.ollamaPath}` // Assuming OLLAMA_API_URL is in Env
		: env.CHATGPT_RESPONSES_URL;

	const sessionId = isOllamaRequest ? undefined : await generateSessionId(instructions, inputItems);

	const baseInstructions = await getBaseInstructions();

	const requestBody = isOllamaRequest
		? JSON.stringify(options?.ollamaPayload)
		: JSON.stringify({
				model: normalizeModelName(model, env.DEBUG_MODEL),
				instructions: instructions || baseInstructions, // Use fetched instructions
				input: inputItems,
				tools: tools || [],
				tool_choice:
					(toolChoice && (toolChoice === "auto" || toolChoice === "none" || typeof toolChoice === "object")) ||
					toolChoice === undefined
						? toolChoice || "auto"
						: "auto",
				parallel_tool_calls: parallelToolCalls || false,
				store: false,
				stream: true,
				include: include,
				prompt_cache_key: sessionId,
				...(reasoningParam && { reasoning: reasoningParam })
			});

	const headers: HeadersInit = {
		"Content-Type": "application/json"
	};

	if (!isOllamaRequest) {
		headers["Authorization"] = `Bearer ${accessToken}`;
		headers["Accept"] = "text/event-stream";
		headers["chatgpt-account-id"] = accountId;
		headers["OpenAI-Beta"] = "responses=experimental";
		if (sessionId) {
			headers["session_id"] = sessionId;
		}
	}

	try {
		// Debug logging
		console.log("=== UPSTREAM REQUEST DEBUG ===");
		console.log("Request URL:", requestUrl);
		console.log("Request headers:", headers);
		console.log("Request body:", requestBody);
		console.log("Is Ollama request:", isOllamaRequest);

		const upstreamResponse = await fetch(requestUrl, {
			method: "POST",
			headers: headers,
			body: requestBody
			// Cloudflare Workers fetch does not have a 'timeout' option like requests.
			// You might need to implement a custom timeout using AbortController if necessary.
		});

		console.log("=== UPSTREAM RESPONSE DEBUG ===");
		console.log("Response status:", upstreamResponse.status);
		console.log("Response statusText:", upstreamResponse.statusText);
		console.log("Response headers:", Object.fromEntries(upstreamResponse.headers.entries()));

		if (!upstreamResponse.ok) {
			// Handle HTTP errors from upstream
			const errorBody = (await upstreamResponse
				.json()
				.catch(() => ({ raw: upstreamResponse.statusText }))) as ErrorBody;
			console.log("=== UPSTREAM ERROR DEBUG ===");
			console.log("Error status:", upstreamResponse.status);
			console.log("Error body:", errorBody);

			// Check if it's a 401 Unauthorized and we can refresh the token
			if (upstreamResponse.status === 401 && env.OPENAI_CODEX_AUTH) {
				console.log("🚨 AUTH DEBUG: Received 401 Unauthorized, attempting automatic token refresh...");

				const refreshedTokens = await refreshAccessToken(env);
				if (refreshedTokens) {
					// Retry the request with the new token
					console.log("🔄 AUTH DEBUG: Token refreshed, retrying request with new token...");

					const headers: HeadersInit = {
						"Content-Type": "application/json"
					};

					if (!isOllamaRequest) {
						headers["Authorization"] = `Bearer ${refreshedTokens.access_token}`;
						headers["Accept"] = "text/event-stream";
						headers["chatgpt-account-id"] = refreshedTokens.account_id || accountId;
						headers["OpenAI-Beta"] = "responses=experimental";
						if (sessionId) {
							headers["session_id"] = sessionId;
						}
					}

					const retryResponse = await fetch(requestUrl, {
						method: "POST",
						headers: headers,
						body: requestBody
					});

					if (retryResponse.ok) {
						console.log("✅ AUTH DEBUG: Retry successful with refreshed token");
						return { response: retryResponse, error: null };
					} else {
						console.log("❌ AUTH DEBUG: Retry failed even with refreshed token");
						// Fall through to original error handling
					}
				} else {
					console.log("❌ AUTH DEBUG: Token refresh failed, falling back to original error");
				}
			}

			return {
				response: null,
				error: new Response(
					JSON.stringify({
						error: {
							message: (errorBody.error && errorBody.error.message) || "Upstream error"
						}
					}),
					{ status: upstreamResponse.status, headers: { "Content-Type": "application/json" } }
				)
			};
		}

		return { response: upstreamResponse, error: null };
	} catch (e: unknown) {
		return {
			response: null,
			error: new Response(
				JSON.stringify({
					error: {
						message: `Upstream ChatGPT request failed: ${e instanceof Error ? e.message : String(e)}`
					}
				}),
				{ status: 502, headers: { "Content-Type": "application/json" } }
			)
		};
	}
}
