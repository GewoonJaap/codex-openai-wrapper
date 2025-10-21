import { ModelPreset, ReasoningEffort } from "./types";

export const MODEL_PRESETS: ModelPreset[] = [
	{
		id: "gpt-5-codex-low",
		label: "gpt-5-codex low",
		description: "Fastest responses with limited reasoning",
		model: "gpt-5-codex",
		effort: "low"
	},
	{
		id: "gpt-5-codex-medium",
		label: "gpt-5-codex medium",
		description: "Dynamically adjusts reasoning based on the task",
		model: "gpt-5-codex",
		effort: "medium"
	},
	{
		id: "gpt-5-codex-high",
		label: "gpt-5-codex high",
		description: "Maximizes reasoning depth for complex or ambiguous problems",
		model: "gpt-5-codex",
		effort: "high"
	},
	{
		id: "gpt-5-minimal",
		label: "gpt-5 minimal",
		description: "Fastest responses with little reasoning",
		model: "gpt-5",
		effort: "minimal"
	},
	{
		id: "gpt-5-low",
		label: "gpt-5 low",
		description: "Balances speed with some reasoning; useful for straightforward queries and short explanations",
		model: "gpt-5",
		effort: "low"
	},
	{
		id: "gpt-5-medium",
		label: "gpt-5 medium",
		description: "Provides a solid balance of reasoning depth and latency for general-purpose tasks",
		model: "gpt-5",
		effort: "medium"
	},
	{
		id: "gpt-5-high",
		label: "gpt-5 high",
		description: "Maximizes reasoning depth for complex or ambiguous problems",
		model: "gpt-5",
		effort: "high"
	}
];

/**
 * Get a model preset by ID
 * @param presetId The preset ID (e.g., "gpt-5-high", "gpt-5-codex-medium")
 * @returns The model preset or undefined if not found
 */
export function getModelPreset(presetId: string): ModelPreset | undefined {
	return MODEL_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * Check if a given ID is a valid model preset
 * @param id The ID to check
 * @returns True if the ID is a valid model preset
 */
export function isModelPreset(id: string): boolean {
	return MODEL_PRESETS.some((preset) => preset.id === id);
}

/**
 * Resolve reasoning effort from model preset ID or default value
 * @param modelOrPresetId The model ID or preset ID
 * @param defaultEffort The default reasoning effort if not found
 * @returns The reasoning effort for the model/preset
 */
export function getReasoningEffortForModel(
	modelOrPresetId: string,
	defaultEffort: ReasoningEffort = "minimal"
): ReasoningEffort {
	const preset = getModelPreset(modelOrPresetId);
	return preset ? preset.effort : defaultEffort;
}
