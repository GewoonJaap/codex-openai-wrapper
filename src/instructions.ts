// Fetch base instructions from URL at runtime
async function getBaseInstructions(): Promise<string> {
	try {
		const response = await fetch(
			"https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/core/prompt.md"
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch base instructions: ${response.status}`);
		}
		return await response.text();
	} catch (error) {
		console.error("Error fetching base instructions:", error);
		// Fallback to minimal instructions if fetch fails
		return `You are a coding agent running in the Codex CLI, a terminal-based coding assistant. You are expected to be precise, safe, and helpful.`;
	}
}

// Fetch GPT-5 Codex specific instructions from URL at runtime
async function getGpt5CodexInstructions(): Promise<string> {
	try {
		const response = await fetch(
			"https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/core/gpt_5_codex_prompt.md"
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch GPT-5 Codex instructions: ${response.status}`);
		}
		return await response.text();
	} catch (error) {
		console.error("Error fetching GPT-5 Codex instructions:", error);
		// Fallback to base instructions if fetch fails
		return await getBaseInstructions();
	}
}

/**
 * Determine which instructions to use based on the model name.
 * Models starting with "gpt-5-codex" or "codex-" use the GPT-5 Codex instructions,
 * all others use the base instructions.
 */
export function shouldUseGpt5CodexInstructions(model: string): boolean {
	return model.startsWith("gpt-5-codex") || model.startsWith("codex-");
}

/**
 * Get the appropriate instructions for the given model.
 * This mirrors the Rust logic in the ModelFamily struct.
 */
export async function getInstructionsForModel(model: string): Promise<string> {
	if (shouldUseGpt5CodexInstructions(model)) {
		return await getGpt5CodexInstructions();
	}
	return await getBaseInstructions();
}
