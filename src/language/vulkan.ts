// Vulkan-only syntax detection

const VULKAN_ONLY =
	/\blayout\s*\([^)]*\b(set|push_constant|input_attachment_index)\b|\bsubpassInput(MS)?\b|\bgl_(VertexIndex|InstanceIndex)\b/;

export function isVulkan(text: string): boolean {
	return VULKAN_ONLY.test(text);
}
