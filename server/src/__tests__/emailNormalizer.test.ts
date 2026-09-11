import {describe, expect, it} from "vitest";
import {extractEmailFromText, normalizeEmail} from "../pipeline/emailNormalizer";

// Every input below is a real value found in production, mangled by Hebrew PDF
// bidi extraction. Kept as a corpus so a future change to the repair rules has
// to stay correct for addresses that actually exist.
describe("normalizeEmail — digit glue", () => {
  it.each([
    ["83shanigolan@gmail.com", "shanigolan83@gmail.com"],
    ["2rampa@yasca.co.il", "rampa2@yasca.co.il"],
    ["40yuvalmo@gmail.com", "yuvalmo40@gmail.com"],
    ["8elay@walla.co.il", "elay8@walla.co.il"],
    ["155david@012.net.il", "david155@012.net.il"],
    ["2000zb@netvision.net.il", "zb2000@netvision.net.il"],
    ["7760yair.yo@gmail.com", "yair.yo7760@gmail.com"],
    ["9504049eden@gmail.com", "eden9504049@gmail.com"],
  ])("moves the digit run back to the end of %s", (stored, expected) => {
    expect(normalizeEmail(stored)).toBe(expected);
  });
});

describe("normalizeEmail — reversed domain", () => {
  it.each([
    ["com.gmail@83shanigolan", "shanigolan83@gmail.com"],
    ["il.co.iec@shapira.igor", "igor.shapira@iec.co.il"],
    ["il.co.iec@elimelech.ronny", "ronny.elimelech@iec.co.il"],
    ["com.gmail@zibai.tal", "tal.zibai@gmail.com"],
    ["il.co.milenium@r.ilan", "ilan.r@milenium.co.il"],
    ["il.co.savion@r.rami", "rami.r@savion.co.il"],
  ])("restores logical order for %s", (stored, expected) => {
    expect(normalizeEmail(stored)).toBe(expected);
  });

  it("reverses hyphen segments inside a reversed domain", () => {
    expect(normalizeEmail("com.afar-d@Dafar")).toBe("dafar@d-afar.com");
  });
});

describe("normalizeEmail — addresses that must not change", () => {
  it.each([
    "shanigolan83@gmail.com",
    "david@cohen.co.il",
    "office@shayhai.co.il",
    "0_dina@rom.co.il",
  ])("leaves %s alone", (address) => {
    expect(normalizeEmail(address)).toBe(address.toLowerCase());
  });

  it("keeps a digit-leading local part that matches the domain's first label", () => {
    // Real address found in production. The digit-glue rule would rewrite this
    // to "cn6@6cn.co" and break a working mailbox.
    expect(normalizeEmail("6cn@6cn.co")).toBe("6cn@6cn.co");
  });

  it("lower-cases so the same address from different paths compares equal", () => {
    expect(normalizeEmail("John.Doe@Example.COM")).toBe("john.doe@example.com");
  });

  it("strips trailing punctuation left by table extraction", () => {
    expect(normalizeEmail("david@cohen.co.il,")).toBe("david@cohen.co.il");
  });
});

describe("normalizeEmail — idempotence", () => {
  it.each([
    "com.gmail@83shanigolan",
    "il.co.iec@shapira.igor",
    "83shanigolan@gmail.com",
    "6cn@6cn.co",
  ])("is stable when applied twice to %s", (stored) => {
    const once = normalizeEmail(stored);
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("extractEmailFromText", () => {
  it("pulls a reversed address out of a fused Hebrew table line", () => {
    // Verbatim line from the inspection PDF that surfaced this bug.
    const line = "com.gmail@83shanigolan: מייל: מיקודאשדוד: ישוב";
    expect(extractEmailFromText(line)).toBe("shanigolan83@gmail.com");
  });

  it("returns null when the text holds no address", () => {
    expect(extractEmailFromText("איש קשר: יוסי\nנייד: 050-1234567")).toBeNull();
  });

  it("returns null for an @ with no dotted domain", () => {
    expect(extractEmailFromText("סוג בדיקה @ תקופתית")).toBeNull();
  });
});
