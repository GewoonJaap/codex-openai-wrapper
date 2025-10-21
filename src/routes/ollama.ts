import { Hono } from "hono";
import { Env } from "../types";
import { startUpstreamRequest } from "../upstream";
import { normalizeModelName, convertChatMessagesToResponsesInput } from "../utils";
import { getInstructionsForModel } from "../instructions";
import { openaiAuthMiddleware } from "../middleware/openaiAuthMiddleware";

const ollama = new Hono<{ Bindings: Env }>();

ollama.post("/chat", openaiAuthMiddleware(), async (c) => {
	const debugModel = c.env.DEBUG_MODEL;

	let payload: Record<string, unknown>;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ error: { message: "Invalid JSON body" } }, 400);
	}

	const model = normalizeModelName(payload.model as string, debugModel);
	let messages = payload.messages;
	if (!messages && typeof payload.prompt === "string") {
		messages = [{ role: "user", content: payload.prompt }];
	}
	if (!messages && typeof payload.input === "string") {
		messages = [{ role: "user", content: payload.input }];
	}
	if (!messages) {
		messages = [];
	}
	if (!Array.isArray(messages)) {
		return c.json({ error: { message: "Request must include messages: []" } }, 400);
	}

	const isStream = Boolean(payload.stream);

	const inputItems = convertChatMessagesToResponsesInput(messages);

	const instructions = await getInstructionsForModel(model);

	const { response: upstream, error: errorResp } = await startUpstreamRequest(c.env, model, inputItems, {
		instructions: instructions
	});

	if (errorResp) {
		return errorResp;
	}

	if (!upstream) {
		return c.json({ error: { message: "Upstream request failed unexpectedly." } }, 500);
	}

	if (isStream) {
		// Ollama chat stream is similar to OpenAI chat stream, but simpler
		// We'll just pass through the upstream response as is for now
		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"Content-Type": "application/x-ndjson", // Or text/event-stream if it's SSE
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				...c.res.headers
			}
		});
	} else {
		// Non-streaming response for Ollama chat
		let fullText = "";
		try {
			const reader = upstream.body?.getReader();
			if (reader) {
				const decoder = new TextDecoder();
				let buffer = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					// Assuming each line is a JSON object for non-streaming
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";
					for (const line of lines) {
						if (line.trim()) {
							try {
								const data = JSON.parse(line);
								if (data.message && data.message.content) {
									fullText += data.message.content;
								}
							} catch (parseError) {
								console.error("Error parsing non-streamed Ollama chat data:", parseError);
							}
						}
					}
				}
			}
		} catch (streamError) {
			console.error("Error reading non-streamed upstream Ollama chat response:", streamError);
			return c.json({ error: { message: `Error reading upstream response: ${streamError}` } }, 502);
		}

		return new Response(JSON.stringify({ model: model, message: { role: "assistant", content: fullText } }), {
			status: upstream.status,
			headers: {
				"Content-Type": "application/json",
				...c.res.headers
			}
		});
	}
});

ollama.post("/show", openaiAuthMiddleware(), async (c) => {
	let payload: Record<string, unknown>;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ error: { message: "Invalid JSON body" } }, 400);
	}

	const modelName = payload.name as string;
	if (!modelName) {
		return c.json({ error: { message: "Model name is required" } }, 400);
	}

	// For /api/show, we directly proxy the request to the upstream Ollama server
	// This assumes the upstream server is configured to handle /api/show
	const { response: upstream, error: errorResp } = await startUpstreamRequest(
		c.env,
		modelName, // Pass modelName as the model for upstream request
		[], // No input items for /api/show
		{
			ollamaPath: "/api/show", // Specify the Ollama API path
			ollamaPayload: payload // Pass the original payload
		}
	);

	if (errorResp) {
		return errorResp;
	}

	if (!upstream) {
		return c.json({ error: { message: "Upstream request failed unexpectedly." } }, 500);
	}

	// Directly return the upstream response
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"Content-Type": upstream.headers.get("Content-Type") || "application/json",
			...c.res.headers
		}
	});
});

ollama.get("/tags", async (c) => {
	// For /api/tags, we directly proxy the request to the upstream Ollama server
	const { response: upstream, error: errorResp } = await startUpstreamRequest(
		c.env,
		"", // No specific model for /api/tags
		[], // No input items
		{
			ollamaPath: "/api/tags" // Specify the Ollama API path
		}
	);

	if (errorResp) {
		return errorResp;
	}

	if (!upstream) {
		return c.json({ error: { message: "Upstream request failed unexpectedly." } }, 500);
	}

	// Directly return the upstream response
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"Content-Type": upstream.headers.get("Content-Type") || "application/json",
			...c.res.headers
		}
	});
});

export default ollama;
