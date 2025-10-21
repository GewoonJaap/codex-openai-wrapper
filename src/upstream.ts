import { normalizeModelName } from "./utils";
import { getRefreshedAuth, refreshAccessToken } from "./auth_kv"; // Updated import
import { getInstructionsForModel } from "./instructions";
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

	// KV token check (minimal logging)

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

	const baseInstructions = await getInstructionsForModel(model);

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
		const upstreamResponse = await fetch(requestUrl, {
			method: "POST",
			headers: headers,
			body: requestBody
			// Cloudflare Workers fetch does not have a 'timeout' option like requests.
			// You might need to implement a custom timeout using AbortController if necessary.
		});

		// Response received

		if (!upstreamResponse.ok) {
			// Handle HTTP errors from upstream
			const errorBody = (await upstreamResponse
				.json()
				.catch(() => ({ raw: upstreamResponse.statusText }))) as ErrorBody;

			// Log complete error details for OpenAI failures
			console.error("=== OPENAI API ERROR ===");
			console.error("Status:", upstreamResponse.status, upstreamResponse.statusText);
			console.error("URL:", requestUrl);
			console.error("Headers:", Object.fromEntries(upstreamResponse.headers.entries()));
			console.error("Error Body:", JSON.stringify(errorBody, null, 2));
			console.error("Request Body:", requestBody);
			console.error("========================");

			// Check if it's a 401 Unauthorized and we can refresh the token
			if (upstreamResponse.status === 401 && env.OPENAI_CODEX_AUTH) {
				const refreshedTokens = await refreshAccessToken(env);
				if (refreshedTokens) {
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
						return { response: retryResponse, error: null };
					}
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
		// Log complete error details for fetch failures
		console.error("=== UPSTREAM REQUEST FAILURE ===");
		console.error("URL:", requestUrl);
		console.error("Request Body:", requestBody);
		console.error("Headers:", headers);
		console.error("Error:", e);
		if (e instanceof Error) {
			console.error("Error Message:", e.message);
			console.error("Error Stack:", e.stack);
		}
		console.error("================================");

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
