import { ChatMessage, ToolDefinition, InputItem, Tool } from "./types";
import { getModelPreset } from "./models";

export function normalizeModelName(name: string | null | undefined, debugModel: string | null | undefined): string {
	if (typeof debugModel === "string" && debugModel.trim()) {
		return debugModel.trim();
	}
	if (typeof name !== "string" || !name.trim()) {
		return "gpt-5";
	}
	const base = name.split(":", 1)[0].trim();

	// Check if it's a model preset
	const preset = getModelPreset(base);
	if (preset) {
		return preset.model;
	}

	const mapping: { [key: string]: string } = {
		gpt5: "gpt-5",
		"gpt-5-latest": "gpt-5",
		"gpt-5": "gpt-5",
		codex: "codex-mini-latest",
		"codex-mini": "codex-mini-latest",
		"codex-mini-latest": "codex-mini-latest"
	};
	return mapping[base] || base;
}

export function convertChatMessagesToResponsesInput(messages: ChatMessage[]): InputItem[] {
	const inputItems: InputItem[] = [];

	function _normalizeImageDataURL(url: string): string {
		try {
			if (typeof url !== "string") {
				return url;
			}
			if (!url.startsWith("data:image/")) {
				return url;
			}
			if (!url.includes(";base64,")) {
				return url;
			}
			const [header, data] = url.split(",", 2);
			let decodedData = data.trim().replace(/\n/g, "").replace(/\r/g, "");
			decodedData = decodedData.replace(/-/g, "+").replace(/_/g, "/");
			const pad = -decodedData.length % 4;
			if (pad) {
				decodedData = decodedData + "=".repeat(pad);
			}
			try {
				// Just validate, no need to store decoded data
				atob(decodedData);
			} catch {
				return url;
			}
			return `${header},${decodedData}`;
		} catch {
			return url;
		}
	}

	for (const message of messages) {
		const role = message.role;
		if (role === "system") {
			continue;
		}

		if (role === "tool") {
			const callId = message.tool_call_id || message.id;
			if (typeof callId === "string" && callId) {
				let content = message.content || "";
				if (Array.isArray(content)) {
					const texts: string[] = [];
					for (const part of content) {
						if (typeof part === "object" && part !== null) {
							const t = part.text || part.content;
							if (typeof t === "string" && t) {
								texts.push(t);
							}
						}
					}
					content = texts.join("\n");
				}
				if (typeof content === "string") {
					inputItems.push({
						type: "function_call_output",
						call_id: callId,
						output: content
					});
				}
			}
			continue;
		}

		if (role === "assistant" && Array.isArray(message.tool_calls)) {
			for (const tc of message.tool_calls) {
				if (typeof tc !== "object" || tc === null) {
					continue;
				}
				const tcType = tc.type || "function";
				if (tcType !== "function") {
					continue;
				}
				const callId = tc.id || tc.call_id;
				const fn = tc.function;
				const name = typeof fn === "object" && fn !== null ? fn.name : null;
				const args = typeof fn === "object" && fn !== null ? fn.arguments : null;

				if (typeof callId === "string" && typeof name === "string" && typeof args === "string") {
					inputItems.push({
						type: "function_call",
						name: name,
						arguments: args,
						call_id: callId
					});
				}
			}
		}

		const content = message.content || "";
		const contentItems: Array<{ type: string; text?: string; image_url?: string }> = [];
		if (Array.isArray(content)) {
			for (const part of content) {
				if (typeof part !== "object" || part === null) {
					continue;
				}
				const ptype = part.type;
				if (ptype === "text") {
					const text = part.text || part.content || "";
					if (typeof text === "string" && text) {
						const kind = role === "assistant" ? "output_text" : "input_text";
						contentItems.push({ type: kind, text: text });
					}
				} else if (ptype === "image_url") {
					const image = part.image_url;
					const url = typeof image === "object" && image !== null ? image.url : image;
					if (typeof url === "string" && url) {
						contentItems.push({ type: "input_image", image_url: _normalizeImageDataURL(url) });
					}
				}
			}
		} else if (typeof content === "string" && content) {
			const kind = role === "assistant" ? "output_text" : "input_text";
			contentItems.push({ type: kind, text: content });
		}

		if (!contentItems.length) {
			continue;
		}
		const roleOut = role === "assistant" ? "assistant" : "user";
		inputItems.push({ type: "message", role: roleOut, content: contentItems });
	}
	return inputItems;
}

export function convertToolsChatToResponses(tools: ToolDefinition[]): Tool[] {
	const out: Tool[] = [];
	if (!Array.isArray(tools)) {
		return out;
	}
	for (const t of tools) {
		if (typeof t !== "object" || t === null) {
			continue;
		}
		if (t.type !== "function") {
			continue;
		}
		const fn = t.function;
		if (typeof fn !== "object" || fn === null) {
			continue;
		}
		const name = fn.name;
		if (typeof name !== "string" || !name) {
			continue;
		}
		const desc = fn.description;
		const params = fn.parameters;
		out.push({
			type: "function",
			function: {
				name: name,
				description: desc || "",
				parameters: params || { type: "object", properties: {} }
			}
		});
	}
	return out;
}
