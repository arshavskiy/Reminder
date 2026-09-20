import {describe, expect, it} from "vitest";
import {
  addDays,
  buildEvent,
  eventDateOf,
  isAppOwnedEvent,
  payloadHash,
  reminderIdOfEvent,
  remoteChangeWins,
} from "../calendar/sync.js";
import { buildTask } from "../calendar/googleTasks.js";

describe("addDays", () => {
  it("advances a plain date", () => {
    expect(addDays("2026-08-27", 1)).toBe("2026-08-28");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("buildEvent", () => {
  const reminder = {
    _id: "abc123",
    title: "בדיקה הבאה ב-2027-02-03",
    trigger_date: "2027-01-04",
    client_company: "בניתא במות הרמה בע״מ",
    client_name: "בר",
    contact_person: "בר",
    client_email: "benita@example.com",
    client_phone: "053-8801490",
    contract_number: "16027",
    manufacturer: "Cartec",
    model: "10-10",
    serial_number: "483067",
  };

  it("emits an all-day event whose end is the day after the start", () => {
    const event = buildEvent(reminder);
    expect(event.start?.date).toBe("2027-01-04");
    expect(event.end?.date).toBe("2027-01-05");
  });

  it("uses the inspection overdue title with the reminder client", () => {
    expect(buildEvent(reminder).summary).toBe("תסקיר לא בתוקף - בניתא במות הרמה בע״מ");
  });

  it("uses a clean fallback title when the reminder has no client", () => {
    expect(buildEvent({ ...reminder, client_company: "", client_name: "" }).summary).toBe("תסקיר לא בתוקף");
  });

  it("falls back to client_name for older reminders without client_company", () => {
    expect(buildEvent({ ...reminder, client_company: null }).summary).toBe("תסקיר לא בתוקף - בר");
  });

  it("stamps the reminder id so the event can be matched on the way back", () => {
    const event = buildEvent(reminder);
    expect(reminderIdOfEvent(event)).toBe("abc123");
    expect(isAppOwnedEvent(event)).toBe(true);
  });

  it("puts the equipment snapshot in the description", () => {
    const description = buildEvent(reminder).description ?? "";
    expect(description).toContain("Cartec");
    expect(description).toContain("483067");
  });

  it("puts the client data in the description", () => {
    const description = buildEvent(reminder).description ?? "";
    expect(description).toContain("לקוח: בניתא במות הרמה בע״מ");
    expect(description).toContain("איש קשר: בר");
    expect(description).toContain("אימייל: benita@example.com");
    expect(description).toContain("טלפון: 053-8801490");
    expect(description).toContain("מספר חוזה: 16027");
  });

  it("omits equipment lines that are empty", () => {
    const description = buildEvent({ ...reminder, model: "", serial_number: null }).description ?? "";
    expect(description).not.toContain("דגם:");
    expect(description).not.toContain("מספר סידורי:");
  });
});

describe("event ownership", () => {
  it("ignores an event the user created themselves", () => {
    const foreign = { summary: "פגישה עם רואה חשבון", start: { date: "2026-09-01" } };
    expect(isAppOwnedEvent(foreign)).toBe(false);
    expect(reminderIdOfEvent(foreign)).toBeNull();
  });

  it("ignores an event stamped by a different integration", () => {
    const foreign = {
      summary: "something else",
      extendedProperties: { private: { reminderAppSourceType: "other" } },
    };
    expect(isAppOwnedEvent(foreign)).toBe(false);
  });
});

describe("payloadHash", () => {
  it("is stable for an unchanged event", () => {
    const reminder = { _id: "x", title: "t", trigger_date: "2026-09-01" };
    expect(payloadHash(buildEvent(reminder))).toBe(payloadHash(buildEvent(reminder)));
  });

  it("changes when the date moves", () => {
    const before = buildEvent({ _id: "x", title: "t", trigger_date: "2026-09-01" });
    const after = buildEvent({ _id: "x", title: "t", trigger_date: "2026-09-02" });
    expect(payloadHash(before)).not.toBe(payloadHash(after));
  });

  it("changes when the title changes", () => {
    const before = buildEvent({ _id: "x", title: "t", trigger_date: "2026-09-01" });
    const after = buildEvent({ _id: "x", title: "different", trigger_date: "2026-09-01" });
    expect(payloadHash(before)).not.toBe(payloadHash(after));
  });
});

describe("remoteChangeWins", () => {
  it("applies a remote edit made after our last push", () => {
    expect(remoteChangeWins("2026-08-27T12:00:00Z", "2026-08-27T10:00:00Z")).toBe(true);
  });

  it("ignores the echo of our own push", () => {
    expect(remoteChangeWins("2026-08-27T10:00:00Z", "2026-08-27T10:00:00Z")).toBe(false);
  });

  it("ignores a remote copy older than our last push", () => {
    expect(remoteChangeWins("2026-08-27T09:00:00Z", "2026-08-27T10:00:00Z")).toBe(false);
  });

  it("trusts the remote value when we never pushed", () => {
    expect(remoteChangeWins("2026-08-27T09:00:00Z", null)).toBe(true);
  });
});

describe("eventDateOf", () => {
  it("reads an all-day event", () => {
    expect(eventDateOf({ start: { date: "2026-09-01" } })).toBe("2026-09-01");
  });

  it("reads a timed event the user converted from all-day", () => {
    expect(eventDateOf({ start: { dateTime: "2026-09-01T08:30:00+03:00" } })).toBe("2026-09-01");
  });

  it("returns null when the event has no start", () => {
    expect(eventDateOf({})).toBeNull();
  });
});

describe("buildTask", () => {
  it("uses the reminder title and target date as a Google Task", () => {
    const task = buildTask({
      title: "לקנות חלב",
      expiry_date: "2026-09-26",
      trigger_date: "2026-09-20",
      reminder_category: "Personal",
    });
    expect(task.title).toBe("לקנות חלב");
    expect(task.due).toBe("2026-09-26T00:00:00.000Z");
    expect(task.notes).toContain("Personal");
  });
});
