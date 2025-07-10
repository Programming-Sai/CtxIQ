// test/ConversationSession.test.ts
import { ConversationSession } from "../src/core/ConversationSession";
import { Message } from "../src/types";

describe("ConversationSession", () => {
  const makeMessage = (
    role: Message["role"] = "user",
    content = "Hi!"
  ): Partial<Message> => ({
    role,
    content,
  });

  const createSession = () =>
    new ConversationSession({
      id: "session-1",
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: "Test Session",
    });

  test("adds and retrieves a message", () => {
    const session = createSession();
    const msg = makeMessage() as Message;
    session.addMessage(msg);

    const all = session.getMessages();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBeDefined();
    expect(all[0].content).toBe("Hi!");

    const byId = session.getMessageById(all[0].id!);
    expect(byId).toEqual(all[0]);
  });

  test("deletes a message", () => {
    const session = createSession();
    session.addMessage(makeMessage() as Message);
    const id = session.getMessages()[0].id!;
    const result = session.deleteMessage(id);

    expect(result).toBe(true);
    expect(session.getMessages()).toHaveLength(0);
  });

  test("edits a message", () => {
    const session = createSession();
    session.addMessage(makeMessage() as Message);
    const orig = session.getMessages()[0];
    const newMsg = { ...orig, content: "Edited" };
    session.editMessage(orig.id!, newMsg);

    const edited = session.getMessageById(orig.id!);
    expect(edited?.content).toBe("Edited");
  });

  test("clearMessages empties buffer", () => {
    const session = createSession();
    session.addMessage(makeMessage() as Message);
    session.clearMessages();
    expect(session.getMessages()).toHaveLength(0);
  });

  test("clone copies messages", () => {
    const session = createSession();
    session.addMessage(makeMessage() as Message);
    const clone = session.clone("sess-2", "Clone");

    expect(clone.getMessages()).toHaveLength(1);
    expect(clone.sessionName).toContain("Clone");
    expect(clone.id).toBe("sess-2");
  });

  describe("Summaries and Compaction", () => {
    it("should compact messages, excluding those covered by summaries", () => {
      const session = createSession();
      session.useSequentialIds = true;
      session.windowTokenLimit = 4;

      // Add raw messages
      session.addMessage({ role: "user", content: "A", tokens: 1 } as Message);
      session.addMessage({ role: "user", content: "B", tokens: 1 } as Message);
      session.addMessage({ role: "user", content: "C", tokens: 1 } as Message);

      // Summary covering first three
      session.addMessage({
        role: "summary",
        content: "Summ ABC",
        tokens: 2,
        summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
      } as Message);

      // Add another message after summary
      session.addMessage({ role: "user", content: "D", tokens: 1 } as Message);

      const compacted = session.getCompactedMessages();
      expect(compacted.map((m) => m.content)).toEqual(["Summ ABC", "D"]);
    });

    it("getMessageWindow truncates compacted messages within token limit", () => {
      const session = createSession();
      session.windowTokenLimit = 8;
      session.useSequentialIds = true;

      // Create a sequence and summaries
      const data: Partial<Message>[] = [
        { role: "system", content: "Sys", tokens: 5 },
        { role: "user", content: "Hi", tokens: 3 },
        { role: "assistant", content: "Hello", tokens: 4 },
        { role: "user", content: "Explain", tokens: 10 },
        {
          role: "summary",
          content: "Sum1",
          tokens: 6,
          summaryOf: new Set(["msg-1", "msg-2", "msg-3", "msg-4"]),
        },
        { role: "user", content: "Next", tokens: 8 },
      ];

      data.forEach((item) => session.addMessage(item as Message));

      const compacted = session.getCompactedMessages();
      // compacted should be [Sum1, Next]
      expect(compacted.map((m) => m.content)).toEqual(["Sum1", "Next"]);

      // Window limit of 8 tokens allows only "Next"
      const { fitting } = session.getMessageWindow(8, compacted);
      expect(fitting.map((m) => m.content)).toEqual(["Next"]);
    });
  });
});

describe("ConversationSession • Strategy 1: Summarise-on-Overflow", () => {
  const createSession = () =>
    new ConversationSession({
      id: "session-1",
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: "Overflow Test",
      reservePercentage: 0.15,
      summeriser: undefined, // we'll set below
    });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("pure truncation when no summaryFn provided", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    // 3 messages, each 2 tokens
    session.addMessage({ role: "user", content: "A", tokens: 2 } as Message);
    session.addMessage({ role: "user", content: "B", tokens: 2 } as Message);
    session.addMessage({ role: "user", content: "C", tokens: 2 } as Message);

    // window limit 4 tokens → should keep last two
    const prompt = session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false
    );
    expect(prompt.map((m) => m.content)).toEqual(["B", "C"]);
  });

  it("inserts summary + fitting messages on overflow", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // mock countTokens to use the .tokens property
    jest.spyOn(session, "countTokensInMessage").mockImplementation(() => {
      // Should not be called since we pass tokens explicitly
      return 9999;
    });

    // inject a summaryFn that always returns 1‐token summary
    session.summaryFn = (overflow) =>
      ({
        role: "summary",
        content: "SUM",
        tokens: 1,
        summaryOf: new Set(overflow.map((m) => m.id)),
      }) as Message;

    // Add 5 messages, each 2 tokens
    for (let i = 1; i <= 5; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }
    // Total tokens = 10. Window limit 4 → usable=3 (after 15% reserve)
    const prompt = session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false
    );

    // Expect: summary(M1‐M4) + only M5 (tokens=2)
    expect(prompt.length).toBe(2);
    expect(prompt[0].content).toBe("SUM");
    expect(prompt[1].content).toBe("M5");
  });

  it("reuses existing summary when overflow fully covered", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add messages 1–4
    for (let i = 1; i <= 3; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Post‐add a summary covering messages 1–3
    const postSummary: Partial<Message> = {
      role: "summary",
      content: "PRE_SUM",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    };
    session.addSummary(postSummary as Message);

    session.addMessage({
      role: "user",
      content: `M5`,
      tokens: 2,
    } as Message);

    // Window limit small so overflow=[m1,m2,m3] which is fully covered
    const prompt = session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false
    );

    expect(prompt[0].content).toBe("PRE_SUM");
  });

  it("uses summary over full messages when it fits but originals don't", () => {
    const session = createSession();
    session.windowTokenLimit = 5;
    session.useSequentialIds = true;

    for (let i = 1; i <= 3; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 3,
      } as Message);
    }

    session.addSummary({
      role: "summary",
      content: "SUM",
      tokens: 2,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    const prompt = session.buildPrompt(session.windowTokenLimit, false);
    expect(prompt.map((m) => m.content)).toEqual(["SUM"]);
  });

  it("fallback to pure truncation when summary too large", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    session.summaryFn = (overflow) =>
      ({
        role: "summary",
        content: "BIG_SUM",
        tokens: 10, // too big to fit in reserved
        summaryOf: new Set(overflow.map((m) => m.id)),
      }) as Message;

    // 4 messages, each 2 tokens => total=8
    for (let i = 1; i <= 4; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // window limit 4 => fallback should return last two
    const prompt = session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ true
    );
    expect(prompt.map((m) => m.content)).toEqual(["M3", "M4"]);
  });

  it("uses existing summary when overflow is fully covered by it", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1, M2, M3
    for (let i = 1; i <= 3; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Add summary for M1–M3
    session.addSummary({
      role: "summary",
      content: "SUM123",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    // Add M4
    session.addMessage({
      role: "user",
      content: "M4",
      tokens: 2,
    } as Message);

    const prompt = session.buildPrompt(session.windowTokenLimit, false);
    expect(prompt.map((m) => m.content)).toEqual(["SUM123", "M4"]);
  });

  it("ignores summary when overflow is not fully covered", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1–M4
    for (let i = 1; i <= 4; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Summary only for M1–M2 (not enough)
    session.addSummary({
      role: "summary",
      content: "SUM12",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2"]),
    } as Message);

    const prompt = session.buildPrompt(session.windowTokenLimit, false);

    // Expect summary to be skipped because it doesn’t fully cover overflow
    expect(prompt.map((m) => m.content)).toContain("M3");
    expect(prompt.map((m) => m.content)).not.toContain("SUM12");
  });

  it("ignores summary when overflow is not fully covered", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1–M4
    for (let i = 1; i <= 4; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Summary only for M1–M2 (not enough)
    session.addSummary({
      role: "summary",
      content: "SUM12",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2"]),
    } as Message);

    const prompt = session.buildPrompt(session.windowTokenLimit, false);
    // Expect summary to be skipped because it doesn’t fully cover overflow
    expect(prompt.map((m) => m.content)).toContain("M3");
    expect(prompt.map((m) => m.content)).not.toContain("SUM12");
  });

  it("falls back to raw messages when summary is too big", () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1–M3
    for (let i = 1; i <= 3; i++) {
      session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Add huge summary
    session.addSummary({
      role: "summary",
      content: "HUGE_SUMMARY",
      tokens: 10,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    const prompt = session.buildPrompt(session.windowTokenLimit, false);

    // console.log(
    //   session.getCompactedMessages(),
    //   session.messages,
    //   session.summaries,
    //   session.messageOrder,
    //   prompt
    // );

    // Summary doesn't fit, should fallback
    expect(prompt.map((m) => m.content)).toContain("M3");
  });
});
