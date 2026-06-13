import { describe, expect, it, vi } from "vitest";

import {
  expectAttemptedWithErrorLabel,
  expectAttemptedWithNoErrors,
  expectNotAttempted,
} from "./helpers/provider-assertions.js";
import { googleAgyProvider } from "../src/providers/google-agy.js";

vi.mock("../src/lib/google-agy.js", () => ({
  hasAgyQuotaRuntimeAvailable: vi.fn(),
  queryGoogleAgyQuota: vi.fn(),
}));

describe("google agy provider", () => {
  it("preserves the Google Agy quota timeout default unless requestTimeoutMs is user-configured", async () => {
    const { queryGoogleAgyQuota } = await import("../src/lib/google-agy.js");
    (queryGoogleAgyQuota as any).mockResolvedValue(null);

    await googleAgyProvider.fetch({ client: {}, config: { requestTimeoutMs: 5000 } } as any);
    expect(queryGoogleAgyQuota).toHaveBeenLastCalledWith({}, { requestTimeoutMs: undefined });

    await googleAgyProvider.fetch({
      client: {},
      config: { requestTimeoutMs: 12000, requestTimeoutMsConfigured: true },
    } as any);
    expect(queryGoogleAgyQuota).toHaveBeenLastCalledWith({}, { requestTimeoutMs: 12000 });
  });

  it("returns attempted:false when Google Agy auth is not configured", async () => {
    const { queryGoogleAgyQuota } = await import("../src/lib/google-agy.js");
    (queryGoogleAgyQuota as any).mockResolvedValueOnce(null);

    const out = await googleAgyProvider.fetch({ client: {} } as any);
    expectNotAttempted(out);
  });

  it("maps quota buckets into grouped toast entries and truncated error labels", async () => {
    const { queryGoogleAgyQuota } = await import("../src/lib/google-agy.js");
    (queryGoogleAgyQuota as any).mockResolvedValueOnce({
      success: true,
      buckets: [
        {
          modelId: "gpt-4",
          displayName: "GPT 4",
          accountEmail: "alice@example.com",
          percentRemaining: 64,
          resetTimeIso: "2026-01-01T00:00:00.000Z",
          remainingAmount: "1234",
          tokenType: "REQUESTS",
        },
      ],
      errors: [{ email: "bob@example.com", error: "Unauthorized" }],
    });

    const out = await googleAgyProvider.fetch({ client: {} } as any);
    expect(out.attempted).toBe(true);
    expect(out.entries).toEqual([
      {
        name: "GPT 4 (ali..example)",
        group: "Google Agy",
        label: "GPT 4:",
        right: "1,234 left",
        percentRemaining: 64,
        resetTimeIso: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(out.errors).toEqual([{ label: "bob..example", message: "Unauthorized" }]);
    expect(out.presentation).toEqual({
      singleWindowDisplayName: "Google Agy",
      singleWindowShowRight: true,
    });
  });

  it("maps aggregated Google Agy quality tiers without changing provider presentation", async () => {
    const { queryGoogleAgyQuota } = await import("../src/lib/google-agy.js");
    (queryGoogleAgyQuota as any).mockResolvedValueOnce({
      success: true,
      buckets: [
        {
          modelId: "gpt-4",
          displayName: "GPT 4",
          accountEmail: "alice@example.com",
          percentRemaining: 20,
          resetTimeIso: "2026-01-01T12:00:00Z",
          remainingAmount: "50",
          tokenType: "TOKENS",
        },
      ],
    });

    const out = await googleAgyProvider.fetch({ client: {} } as any);
    expectAttemptedWithNoErrors(out);
    expect(out.entries).toEqual([
      {
        name: "GPT 4 (ali..example)",
        group: "Google Agy",
        label: "GPT 4:",
        right: "50 left TOKENS",
        percentRemaining: 20,
        resetTimeIso: "2026-01-01T12:00:00Z",
      },
    ]);
    expect(out.presentation).toEqual({
      singleWindowDisplayName: "Google Agy",
      singleWindowShowRight: true,
    });
  });

  it("maps fetch failures into toast errors", async () => {
    const { queryGoogleAgyQuota } = await import("../src/lib/google-agy.js");
    (queryGoogleAgyQuota as any).mockResolvedValueOnce({
      success: false,
      error: "Token expired",
    });

    const out = await googleAgyProvider.fetch({ client: {} } as any);
    expectAttemptedWithErrorLabel(out, "Google Agy");
  });

  it("is available only when the Google Agy runtime is configured", async () => {
    const { hasAgyQuotaRuntimeAvailable } = await import("../src/lib/google-agy.js");
    (hasAgyQuotaRuntimeAvailable as any).mockResolvedValueOnce(true);
    await expect(googleAgyProvider.isAvailable({ client: {} } as any)).resolves.toBe(true);

    (hasAgyQuotaRuntimeAvailable as any).mockResolvedValueOnce(false);
    await expect(googleAgyProvider.isAvailable({ client: {} } as any)).resolves.toBe(false);
  });

  it("matches Google Agy current model ids", () => {
    expect(googleAgyProvider.matchesCurrentModel?.("google-agy/gpt-4")).toBe(true);
    expect(googleAgyProvider.matchesCurrentModel?.("opencode-agy-auth/gpt-4")).toBe(true);
    expect(googleAgyProvider.matchesCurrentModel?.("google-agy-auth/gpt-4")).toBe(true);
    expect(googleAgyProvider.matchesCurrentModel?.("google/claude-opus")).toBe(false);
  });
});
