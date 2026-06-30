export function resolveGenerationModel(env?: Record<string, string | undefined>): string;
export function getPlacementGuidance(placement?: string, size?: string, complexity?: string): string;
export function buildTattooPrompt(body: {
  idea: string;
  style?: string;
  placement?: string;
  size?: string;
  complexity?: string;
}): string;
export function extractFirstImageUrl(output: unknown): string;
export function createMockGeneration(
  body: {
    idea: string;
    style?: string;
    placement?: string;
    size?: string;
    complexity?: string;
  },
  env?: Record<string, string | undefined>
): Record<string, unknown>;
export function createGeneration(
  body: {
    idea: string;
    style?: string;
    placement?: string;
    size?: string;
    complexity?: string;
  },
  env?: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): Promise<Record<string, unknown>>;
