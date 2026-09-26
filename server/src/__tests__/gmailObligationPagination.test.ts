import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../routes/gmail", () => ({
  gmailFetch: vi.fn(),
  resolveGmailToken: vi.fn(),
  retryWithRefresh: vi.fn(),
}));
vi.mock("../auth/middleware", () => ({ requireAuth: vi.fn() }));
vi.mock("../pipeline/pdfParser", () => ({ parsePdf: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { gmailFetch, retryWithRefresh } from "../routes/gmail";
import { listMessageIds } from "../routes/gmailObligations";

const fetchMock = vi.mocked(gmailFetch);
const page = (start: number, count: number, nextPageToken?: string) => Response.json({
  messages: Array.from({ length: count }, (_, i) => ({ id: String(start + i) })),
  nextPageToken,
});

describe("obligation scan pagination", () => {
  beforeEach(() => vi.resetAllMocks());

  it("follows pages and stops at 2500 even when another page exists", async () => {
    for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(page(i * 500, 500, `page ${i + 1}`));
    const result = await listMessageIds("token", "user", "warranty");
    expect(result.ids).toHaveLength(2500);
    expect(result.ids[2499]).toBe("2499");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[1][1]).toContain("pageToken=page%201");
    expect(fetchMock.mock.calls.every((call) => call[1].includes("maxResults=500"))).toBe(true);
  });

  it("stops when Gmail has no more pages", async () => {
    fetchMock.mockResolvedValueOnce(page(0, 25, "next")).mockResolvedValueOnce(page(25, 2));
    const result = await listMessageIds("token", "user", "warranty");
    expect(result.ids).toHaveLength(27);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes authorization on later pages and retains the refreshed token", async () => {
    fetchMock.mockResolvedValueOnce(page(0, 1, "next"))
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(page(1, 1));
    vi.mocked(retryWithRefresh).mockResolvedValueOnce("fresh");
    const result = await listMessageIds("token", "user", "warranty");
    expect(result).toMatchObject({ ids: ["0", "1"], accessToken: "fresh", error: null });
    expect(fetchMock.mock.calls[2]).toEqual(["fresh", fetchMock.mock.calls[1][1]]);
  });

  it("reports a later-page failure rather than returning a partial scan", async () => {
    fetchMock.mockResolvedValueOnce(page(0, 1, "next"))
      .mockResolvedValueOnce(new Response("quota exceeded", { status: 429 }));
    const result = await listMessageIds("token", "user", "warranty");
    expect(result.ids).toEqual([]);
    expect(result.error?.httpStatus).toBe(429);
  });
});
