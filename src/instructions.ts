// Fetch instructions from Pastebin URL at runtime
export async function getBaseInstructions(): Promise<string> {
	try {
		const response = await fetch(
			"https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/core/prompt.md"
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch instructions: ${response.status}`);
		}
		return await response.text();
	} catch (error) {
		console.error("Error fetching instructions:", error);
		// Fallback to minimal instructions if fetch fails
		return `You are a coding agent running in the Codex CLI, a terminal-based coding assistant. You are expected to be precise, safe, and helpful.`;
	}
}
