import {describe, expect, it} from "vitest";
import {
  dedupeUnsubscribeReplies,
  extractSenderEmail,
  isUnsubscribeRequest,
  parseUnsubscribeReply,
} from "../outreach/unsubscribeReplies";

const message = (from: string, subject: string, snippet: string, internalDate = "1790241000000") => ({
  id: "m1",
  snippet,
  internalDate,
  headers: [{name: "From", value: from}, {name: "Subject", value: subject}],
});

describe("unsubscribe replies", () => {
  it("extracts the sender address from a From header", () => {
    expect(extractSenderEmail("\"Yossi Levi\" <Yossi@Example.co.il>")).toBe("yossi@example.co.il");
    expect(extractSenderEmail("yossi@example.co.il")).toBe("yossi@example.co.il");
    expect(extractSenderEmail("no address here")).toBeNull();
  });

  it("recognizes Hebrew and English removal requests as whole words", () => {
    expect(isUnsubscribeRequest("Re: פרסומת", "הסר")).toBe(true);
    expect(isUnsubscribeRequest("הסר", "")).toBe(true);
    expect(isUnsubscribeRequest("Re: פרסומת", "נא להסיר אותי מהרשימה")).toBe(true);
    expect(isUnsubscribeRequest("unsubscribe", "")).toBe(true);
    // "הסרה" and "מהסרט" contain the letters but are different words.
    expect(isUnsubscribeRequest("Re: פרסומת", "תודה, ראיתי את ההסרה בסרט")).toBe(false);
    expect(isUnsubscribeRequest("Re: פרסומת", "מעניין, אשמח לשמוע עוד")).toBe(false);
  });

  it("parses a reply and ignores our own outgoing mail", () => {
    const reply = parseUnsubscribeReply(message("Dana <dana@test.co.il>", "הסר", ""));
    expect(reply?.email).toBe("dana@test.co.il");
    expect(reply?.requestedAt.getTime()).toBe(1790241000000);
    expect(parseUnsubscribeReply(message("RemindOCR <contact@remindocr.com>", "הסר", ""))).toBeNull();
    expect(parseUnsubscribeReply(message("dana@test.co.il", "Re: פרסומת", "&quot;הסר&quot;"))?.email).toBe("dana@test.co.il");
  });

  it("keeps the earliest request per sender", () => {
    const later = parseUnsubscribeReply(message("a@b.co.il", "הסר", "", "2000"))!;
    const earlier = parseUnsubscribeReply(message("a@b.co.il", "הסר", "", "1000"))!;
    const deduped = dedupeUnsubscribeReplies([later, earlier]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].requestedAt.getTime()).toBe(1000);
  });
});
