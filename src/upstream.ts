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

    // Helper: format tools for upstream wire schema differences
    function formatToolsForUpstream(
        toolsIn: Tool[] | undefined,
        format: string | undefined
    ): Array<Record<string, unknown>> {
        const arr = Array.isArray(toolsIn) ? toolsIn : [];
        const mode = (format || "nested").toLowerCase();
        if (mode !== "flat") {
            // Default: OpenAI Responses style
            return arr as unknown as Array<Record<string, unknown>>;
        }
        // Flatten: { type: 'function', function: { name, description, parameters } }
        //   -> { type: 'function', name, description, parameters }
        const out: Array<Record<string, unknown>> = [];
        for (const t of arr) {
            try {
                if (!t || t.type !== "function") continue;
                const fn = (t as Tool).function as {
                    name?: string;
                    description?: string;
                    parameters?: Record<string, unknown>;
                };
                if (!fn || typeof fn.name !== "string" || !fn.name) continue;
                out.push({
                    type: "function",
                    name: fn.name,
                    ...(fn.description ? { description: fn.description } : {}),
                    ...(fn.parameters ? { parameters: fn.parameters } : {})
                });
            } catch {}
        }
        return out;
    }

    // Helper: format tool_choice for flat schema if needed
    function formatToolChoiceForUpstream(
        choice: ToolChoice | undefined,
        format: string | undefined
    ): ToolChoice | { type: string; name: string } | "auto" | "none" | undefined {
        const mode = (format || "nested").toLowerCase();
        if (!choice || mode !== "flat") return choice;
        if (typeof choice === "object" && (choice as any).type && (choice as any).function?.name) {
            return { type: (choice as any).type, name: (choice as any).function.name } as any;
        }
        return choice;
    }

	const { accessToken, accountId } = await getRefreshedAuth(env);

	// Determine request type and upstream auth mode early
	const isOllamaRequest = Boolean(options?.ollamaPath);
	const authMode = env.UPSTREAM_AUTH_MODE || "chatgpt_token";

	// In chatgpt_token mode, ChatGPT tokens are required (unless Ollama path)
	if (!isOllamaRequest && authMode === "chatgpt_token") {
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
	}

	const include: string[] = [];
	if (reasoningParam?.effort !== "none") {
		include.push("reasoning.encrypted_content");
	}

	// Resolve upstream URL
	let requestUrl: string;
	if (isOllamaRequest) {
		requestUrl = `${env.OLLAMA_API_URL}${options?.ollamaPath}`;
	} else if (env.UPSTREAM_RESPONSES_URL && env.UPSTREAM_RESPONSES_URL.trim()) {
		requestUrl = env.UPSTREAM_RESPONSES_URL.trim();
	} else if (env.UPSTREAM_BASE_URL && env.UPSTREAM_BASE_URL.trim()) {
		const base = env.UPSTREAM_BASE_URL.replace(/\/$/, "");
		const path = (env.UPSTREAM_WIRE_API_PATH && env.UPSTREAM_WIRE_API_PATH.trim()) || "/responses";
		requestUrl = `${base}${path.startsWith("/") ? path : `/${path}`}`;
	} else {
		requestUrl = env.CHATGPT_RESPONSES_URL;
	}

	const sessionId = isOllamaRequest ? undefined : await generateSessionId(instructions, inputItems);

	const baseInstructions = await getBaseInstructions();

    const requestBody = isOllamaRequest
        ? JSON.stringify(options?.ollamaPayload)
        : JSON.stringify({
                model: normalizeModelName(model, env.DEBUG_MODEL),
                instructions: instructions || baseInstructions, // Use fetched instructions
                input: inputItems,
                tools: formatToolsForUpstream(tools, (env as any).UPSTREAM_TOOLS_FORMAT),
                tool_choice:
                    (formatToolChoiceForUpstream(toolChoice, (env as any).UPSTREAM_TOOLS_FORMAT) &&
                        (toolChoice === "auto" || toolChoice === "none" || typeof toolChoice === "object")) ||
                    toolChoice === undefined
                        ? formatToolChoiceForUpstream(toolChoice, (env as any).UPSTREAM_TOOLS_FORMAT) || "auto"
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
		// Pre-validate API key in apikey_* modes for clearer errors
		if (authMode === "apikey_env") {
			if (!env.UPSTREAM_API_KEY || !env.UPSTREAM_API_KEY.trim()) {
				return {
					response: null,
					error: new Response(
						JSON.stringify({ error: { message: "Missing upstream API key (set UPSTREAM_API_KEY)" } }),
						{ status: 401, headers: { "Content-Type": "application/json" } }
					)
				};
			}
		}
		if (authMode === "apikey_auth_json") {
			try {
				const keyName = (env.UPSTREAM_AUTH_ENV_KEY || "OPENAI_API_KEY").trim();
				const authObj = env.OPENAI_CODEX_AUTH ? (JSON.parse(env.OPENAI_CODEX_AUTH) as Record<string, unknown>) : {};
				const maybeKey = authObj?.[keyName];
				if (typeof maybeKey !== "string" || !maybeKey.trim()) {
					return {
						response: null,
						error: new Response(
							JSON.stringify({ error: { message: `Missing upstream API key in OPENAI_CODEX_AUTH at key '${keyName}'` } }),
							{ status: 401, headers: { "Content-Type": "application/json" } }
						)
					};
				}
			} catch (e) {
				return {
					response: null,
					error: new Response(
						JSON.stringify({ error: { message: "Invalid OPENAI_CODEX_AUTH JSON" } }),
						{ status: 400, headers: { "Content-Type": "application/json" } }
					)
				};
			}
		}

		// Build upstream auth header according to mode
		const authHeaderName = (env.UPSTREAM_AUTH_HEADER || "Authorization").trim();
		const authScheme = (env.UPSTREAM_AUTH_SCHEME || "Bearer").trim();

		let sendAuth = "";
		if (authMode === "apikey_auth_json") {
			try {
				if (env.OPENAI_CODEX_AUTH) {
					const authObj = JSON.parse(env.OPENAI_CODEX_AUTH) as Record<string, unknown>;
					const keyName = (env.UPSTREAM_AUTH_ENV_KEY || "OPENAI_API_KEY").trim();
					const maybeKey = authObj?.[keyName];
					if (typeof maybeKey === "string" && maybeKey.trim()) {
						sendAuth = `${authScheme} ${maybeKey.trim()}`;
					}
				}
			} catch (e) {
				console.error("Failed parsing OPENAI_CODEX_AUTH for API key:", e);
			}
		} else if (authMode === "apikey_env") {
			if (typeof env.UPSTREAM_API_KEY === "string" && env.UPSTREAM_API_KEY.trim()) {
				sendAuth = `${authScheme} ${env.UPSTREAM_API_KEY.trim()}`;
			}
		} else {
			// default: chatgpt_token
			if (typeof accessToken === "string" && accessToken.trim()) {
				sendAuth = `${authScheme} ${accessToken.trim()}`;
			}
		}

		if (sendAuth) {
			headers[authHeaderName] = sendAuth;
		}

		headers["Accept"] = "text/event-stream";
		if (accountId) {
			headers["chatgpt-account-id"] = accountId;
		}
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
			if (upstreamResponse.status === 401 && env.OPENAI_CODEX_AUTH && (env.UPSTREAM_AUTH_MODE || "chatgpt_token") === "chatgpt_token") {
				const refreshedTokens = await refreshAccessToken(env);
				if (refreshedTokens) {
					const headers: HeadersInit = {
						"Content-Type": "application/json"
					};

					if (!isOllamaRequest) {
						const authHeaderName = (env.UPSTREAM_AUTH_HEADER || "Authorization").trim();
						const authScheme = (env.UPSTREAM_AUTH_SCHEME || "Bearer").trim();
						headers[authHeaderName] = `${authScheme} ${refreshedTokens.access_token}`;
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
