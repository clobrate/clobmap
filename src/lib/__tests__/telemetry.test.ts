import { describe, expect, it } from "vitest";
import { redactHome, scrubEvent, truncateForPrivacy } from "../telemetry";

describe("redactHome", () => {
  it("redacts macOS home paths", () => {
    expect(redactHome("/Users/alice/projects/clobmap/src/foo.ts")).toBe(
      "/Users/<HOME>/projects/clobmap/src/foo.ts",
    );
  });

  it("redacts Linux home paths", () => {
    expect(redactHome("/home/bob/code/clobmap")).toBe("/home/<HOME>/code/clobmap");
  });

  it("redacts Windows home paths", () => {
    expect(redactHome("C:\\Users\\carol\\Projects\\clobmap")).toBe(
      "C:\\Users\\<HOME>\\Projects\\clobmap",
    );
  });

  it("leaves unrelated paths untouched", () => {
    expect(redactHome("/var/log/clobmap.log")).toBe("/var/log/clobmap.log");
    expect(redactHome("https://clobmap.com/")).toBe("https://clobmap.com/");
  });

  it("handles multiple occurrences in one string", () => {
    expect(redactHome("from /Users/alice/x to /Users/alice/y")).toBe(
      "from /Users/<HOME>/x to /Users/<HOME>/y",
    );
  });
});

describe("truncateForPrivacy", () => {
  it("leaves short strings unchanged", () => {
    expect(truncateForPrivacy("hello")).toBe("hello");
  });

  it("truncates very long strings with a marker", () => {
    const long = "a".repeat(1000);
    const out = truncateForPrivacy(long, 100);
    expect(out.length).toBeLessThan(long.length);
    expect(out.endsWith("(truncated for privacy)")).toBe(true);
  });
});

describe("scrubEvent", () => {
  it("redacts home paths in message and exception value", () => {
    const out = scrubEvent({
      message: "Crashed at /Users/alice/clobmap/src/x.ts",
      exception: {
        values: [{ value: "TypeError at /Users/alice/clobmap/src/y.ts" }],
      },
    });
    expect(out.message).toBe("Crashed at /Users/<HOME>/clobmap/src/x.ts");
    expect(out.exception?.values?.[0]?.value).toBe("TypeError at /Users/<HOME>/clobmap/src/y.ts");
  });

  it("redacts home paths in stack frames", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: "/Users/alice/clobmap/src/foo.ts", abs_path: "/Users/alice/x" }],
            },
          },
        ],
      },
    });
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      "/Users/<HOME>/clobmap/src/foo.ts",
    );
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]?.abs_path).toBe("/Users/<HOME>/x");
  });

  it("drops every breadcrumb", () => {
    const out = scrubEvent({
      breadcrumbs: [
        { type: "navigation", message: "/from/?secret=hi" },
        { type: "ui.click", message: "user clicked input" },
      ],
    });
    expect(out.breadcrumbs).toEqual([]);
  });

  it("strips query string from request.url and removes data/cookies/headers", () => {
    const out = scrubEvent({
      request: {
        url: "https://clobmap.com/?path=/Users/alice/x.yaml",
        query_string: "path=/Users/alice/x.yaml",
        data: { yamlText: "secret content" },
        cookies: "session=abc",
        headers: { authorization: "Bearer xyz" },
      },
    });
    expect(out.request?.url).toBe("https://clobmap.com/");
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
  });

  it("removes user and server_name", () => {
    const out = scrubEvent({
      user: { id: "alice", email: "a@b.c", ip_address: "1.2.3.4" },
      server_name: "alices-mbp.local",
    });
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
  });

  it("removes hostname from contexts.device.name", () => {
    const out = scrubEvent({
      contexts: { device: { name: "Alice's MBP" } },
    });
    expect(out.contexts?.device?.name).toBeUndefined();
  });

  it("strips document-content fields from extra and redacts the rest", () => {
    const out = scrubEvent({
      extra: {
        yamlText: "the whole document",
        documentContents: "also the whole document",
        fileContents: "still the document",
        irrelevant: "/Users/alice/foo",
      },
    });
    expect(out.extra?.yamlText).toBeUndefined();
    expect(out.extra?.documentContents).toBeUndefined();
    expect(out.extra?.fileContents).toBeUndefined();
    expect(out.extra?.irrelevant).toBe("/Users/<HOME>/foo");
  });

  it("does not mutate the input event", () => {
    const original = {
      message: "/Users/alice",
      breadcrumbs: [{ message: "kept" }],
    };
    scrubEvent(original);
    expect(original.message).toBe("/Users/alice");
    expect(original.breadcrumbs).toEqual([{ message: "kept" }]);
  });

  it("truncates absurdly long messages", () => {
    const out = scrubEvent({ message: "x".repeat(2000) });
    expect((out.message ?? "").length).toBeLessThan(600);
  });
});
