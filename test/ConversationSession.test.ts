// test/ConversationSession.test.ts
import { ConversationSession } from "../src/core/ConversationSession";
import { Message } from "../src/types";

describe("ConversationSession", () => {
  const makeMessage = (
    role: Message["role"] = "user",
    content = "Hi!",
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

  test("adds and retrieves a message", async () => {
    const session = createSession();
    const msg = makeMessage() as Message;
    await session.addMessage(msg);

    const all = session.getMessages();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBeDefined();
    expect(all[0].content).toBe("Hi!");

    const byId = session.getMessageById(all[0].id!);
    expect(byId).toEqual(all[0]);
  });

  test("deletes a message", async () => {
    const session = createSession();
    await session.addMessage(makeMessage() as Message);
    const id = session.getMessages()[0].id!;
    const result = session.deleteMessage(id);

    expect(result).toBe(true);
    expect(session.getMessages()).toHaveLength(0);
  });

  test("edits a message", async () => {
    const session = createSession();
    await session.addMessage(makeMessage() as Message);
    const orig = session.getMessages()[0];
    const newMsg = { ...orig, content: "Edited" };
    session.editMessage(orig.id!, newMsg);

    const edited = session.getMessageById(orig.id!);
    expect(edited?.content).toBe("Edited");
  });

  test("clearMessages empties buffer", async () => {
    const session = createSession();
    await session.addMessage(makeMessage() as Message);
    session.clearMessages();
    expect(session.getMessages()).toHaveLength(0);
  });

  test("clone copies messages", async () => {
    const session = createSession();
    await session.addMessage(makeMessage() as Message);
    const clone = session.clone("sess-2", "Clone");

    expect(clone.getMessages()).toHaveLength(1);
    expect(clone.sessionName).toContain("Clone");
    expect(clone.id).toBe("sess-2");
  });

  describe("Summaries and Compaction", () => {
    it("should compact messages, excluding those covered by summaries", async () => {
      const session = createSession();
      session.useSequentialIds = true;
      session.windowTokenLimit = 4;

      // Add raw messages
      await session.addMessage({
        role: "user",
        content: "A",
        tokens: 1,
      } as Message);
      await session.addMessage({
        role: "user",
        content: "B",
        tokens: 1,
      } as Message);
      await session.addMessage({
        role: "user",
        content: "C",
        tokens: 1,
      } as Message);

      // Summary covering first three
      await session.addMessage({
        role: "summary",
        content: "Summ ABC",
        tokens: 2,
        summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
      } as Message);

      // Add another message after summary
      await session.addMessage({
        role: "user",
        content: "D",
        tokens: 1,
      } as Message);

      const compacted = session.getCompactedMessages();
      expect(compacted.map((m) => m.content)).toEqual(["Summ ABC", "D"]);
    });

    it("getMessageWindow truncates compacted messages within token limit", async () => {
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

      // Fix: await each addMessage sequentially (forEach with async callback doesn't wait)
      for (const item of data) {
        await session.addMessage(item as Message);
      }

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
      // llmFormatter: async (msgs) => msgs,
    });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("pure truncation when no summaryFn provided", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    // 3 messages, each 2 tokens
    await session.addMessage({
      role: "user",
      content: "A",
      tokens: 2,
    } as Message);
    await session.addMessage({
      role: "user",
      content: "B",
      tokens: 2,
    } as Message);
    await session.addMessage({
      role: "user",
      content: "C",
      tokens: 2,
    } as Message);

    // window limit 4 tokens → should keep last two
    const prompt = await session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false,
    );
    expect(prompt.map((m) => m.content)).toEqual(["B", "C"]);
  });

  it("inserts summary + fitting messages on overflow", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // mock countTokens to use the .tokens property
    jest.spyOn(session, "countTokensInMessage").mockImplementation(async () => {
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
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }
    // Total tokens = 10. Window limit 4 → usable=3 (after 15% reserve)
    const prompt = await session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false,
    );

    // Expect: summary(M1‐M4) + only M5 (tokens=2)
    expect(prompt.length).toBe(2);
    expect(prompt[0].content).toBe("SUM");
    expect(prompt[1].content).toBe("M5");
  });

  it("reuses existing summary when overflow fully covered", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add messages 1–3
    for (let i = 1; i <= 3; i++) {
      await session.addMessage({
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
    await session.addSummary(postSummary as Message);

    await session.addMessage({
      role: "user",
      content: `M5`,
      tokens: 2,
    } as Message);

    // Window limit small so overflow=[m1,m2,m3] which is fully covered
    const prompt = await session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ false,
    );

    expect(prompt[0].content).toBe("PRE_SUM");
  });

  it("uses summary over full messages when it fits but originals don't", async () => {
    const session = createSession();
    session.windowTokenLimit = 5;
    session.useSequentialIds = true;

    for (let i = 1; i <= 3; i++) {
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 3,
      } as Message);
    }

    await session.addSummary({
      role: "summary",
      content: "SUM",
      tokens: 2,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    const prompt = await session.buildPrompt(session.windowTokenLimit, false);
    expect(prompt.map((m) => m.content)).toEqual(["SUM"]);
  });

  it("fallback to pure truncation when summary too large", async () => {
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
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // window limit 4 => fallback should return last two
    const prompt = await session.buildPrompt(
      session.windowTokenLimit,
      /*fallback*/ true,
    );
    expect(prompt.map((m) => m.content)).toEqual(["M3", "M4"]);
  });

  it("uses existing summary when overflow is fully covered by it", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1, M2, M3
    for (let i = 1; i <= 3; i++) {
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Add summary for M1–M3
    await session.addSummary({
      role: "summary",
      content: "SUM123",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    // Add M4
    await session.addMessage({
      role: "user",
      content: "M4",
      tokens: 2,
    } as Message);

    const prompt = await session.buildPrompt(session.windowTokenLimit, false);
    expect(prompt.map((m) => m.content)).toEqual(["SUM123", "M4"]);
  });

  it("ignores summary when overflow is not fully covered", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1–M4
    for (let i = 1; i <= 4; i++) {
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Summary only for M1–M2 (not enough)
    await session.addSummary({
      role: "summary",
      content: "SUM12",
      tokens: 1,
      summaryOf: new Set(["msg-1", "msg-2"]),
    } as Message);

    const prompt = await session.buildPrompt(session.windowTokenLimit, false);

    // Expect summary to be skipped because it doesn’t fully cover overflow
    expect(prompt.map((m) => m.content)).toContain("M3");
    expect(prompt.map((m) => m.content)).not.toContain("SUM12");
  });

  it("falls back to raw messages when summary is too big", async () => {
    const session = createSession();
    session.windowTokenLimit = 4;
    session.useSequentialIds = true;

    // Add M1–M3
    for (let i = 1; i <= 3; i++) {
      await session.addMessage({
        role: "user",
        content: `M${i}`,
        tokens: 2,
      } as Message);
    }

    // Add huge summary
    await session.addSummary({
      role: "summary",
      content: "HUGE_SUMMARY",
      tokens: 10,
      summaryOf: new Set(["msg-1", "msg-2", "msg-3"]),
    } as Message);

    const prompt = await session.buildPrompt(session.windowTokenLimit, false);

    // Summary doesn't fit, should fallback
    expect(prompt.map((m) => m.content)).toContain("M3");
  });

  it("always includes system messages at the start of the prompt", async () => {
    const session = createSession();
    session.windowTokenLimit = 1;
    session.useSequentialIds = true;

    await session.addMessage({
      role: "system",
      content: "INIT_SYS",
      tokens: 0,
    } as Message);
    // Add a lot of user/assistant messages...
    for (let i = 0; i < 50; i++) {
      await session.addMessage({
        role: "user",
        content: `msg ${i}`,
        tokens: 1,
      } as Message);
    }

    const llmMsgs = await session.getLLMMessages(10);

    // First messages should be all system prompts
    expect(llmMsgs[0].role).toBe("system");
    // Should never be summarised or omitted
    expect(llmMsgs.some((m) => m.role === "system")).toBe(true);
  });
});

// Add this block to your existing test/ConversationSession.test.ts

describe("ConversationSession • Additional Edge & Integration Tests", () => {
  const makeMessage = (
    role: Message["role"] = "user",
    content = "Hello",
    tokens = 1,
  ): Partial<Message> => ({ role, content, tokens });

  const createSession = () =>
    new ConversationSession({
      id: "sess-edge",
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: "Edge Session",
    });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("updates lastModifiedAt and emits on add/edit/delete/clear", async () => {
    const session = createSession();
    const ts0 = session.lastModifiedAt;

    // addMessage
    const addSpy = jest.fn();
    session.on("messageAdded", addSpy);
    await session.addMessage(makeMessage() as Message);
    expect(session.lastModifiedAt).toBeGreaterThan(ts0);
    expect(addSpy).toHaveBeenCalled();

    // editMessage
    const msg = session.getMessages()[0];
    const editSpy = jest.fn();
    session.on("messageEdited", editSpy);
    const ts1 = session.lastModifiedAt;
    session.editMessage(msg.id!, { ...msg, content: "X" } as Message);
    expect(session.lastModifiedAt).toBeGreaterThan(ts1);
    expect(editSpy).toHaveBeenCalled();

    // deleteMessage
    const delSpy = jest.fn();
    session.on("messageDeleted", delSpy);
    const ts2 = session.lastModifiedAt;
    session.deleteMessage(msg.id!);
    expect(session.lastModifiedAt).toBeGreaterThan(ts2);
    expect(delSpy).toHaveBeenCalledWith(msg.id, true);

    // clearMessages
    await session.addMessage(makeMessage() as Message);
    const clearSpy = jest.fn();
    session.on("messagesCleared", clearSpy);
    const ts3 = session.lastModifiedAt;
    session.clearMessages();
    expect(session.lastModifiedAt).toBeGreaterThan(ts3);
    expect(clearSpy).toHaveBeenCalled();
  });

  it("serializes and deserializes to identical state via toJSON/fromJSON", async () => {
    const session = createSession();
    session.useSequentialIds = true;
    session.windowTokenLimit = 10;
    await session.addMessage({
      role: "user",
      content: "A",
      tokens: 1,
    } as Message);
    await session.addSummary({
      role: "summary",
      content: "S",
      tokens: 1,
      summaryOf: new Set([session.getMessages()[0].id!]),
    } as Message);

    const data = session.toJSON();
    const clone = createSession();
    clone.fromJSON(data);
    // deep comparison of critical fields
    expect(clone.id).toBe(session.id);
    expect(clone.sessionName).toBe(session.sessionName);
    expect(clone.getMessages().map((m) => m.content)).toEqual(
      session.getMessages().map((m) => m.content),
    );
    expect(clone.getSummaries().map((s) => s.content)).toEqual(
      session.getSummaries().map((s) => s.content),
    );
    expect(clone.messageOrder).toEqual(session.messageOrder);
  });

  it("honors a custom tokenCounterFn and falls back when it errors", async () => {
    const session = createSession();
    // custom counter that returns length of string
    session.tokenCounterFn = (txt) => txt.length;
    expect(await session.countTokensInMessage("abc def")).toBe(7);
    // custom counter that throws
    session.tokenCounterFn = () => {
      throw new Error();
    };
    expect(await session.countTokensInMessage("one two")).toBe(2);
  });

  it("throws if llmFormatter returns non-array", async () => {
    const session = createSession();
    session.llmFormatter = <T>(_: Message[]) => ({}) as unknown as T[];
    await session.addMessage({
      role: "user",
      content: "X",
      tokens: 1,
    } as Message);
    await expect(session.getLLMMessages()).rejects.toThrow(
      /llmFormatter must return an array/,
    );
  });

  it("setSummaries replaces old set and clearSummaries empties it", async () => {
    const session = createSession();
    session.useSequentialIds = true;
    // initial summaries
    await session.addSummary({
      role: "summary",
      content: "Old",
      tokens: 1,
      summaryOf: new Set(),
    } as Message);
    expect(session.getSummaries()).toHaveLength(1);

    // replace with two new
    const s1: Message = {
      id: "s1",
      role: "summary",
      content: "A",
      tokens: 1,
      timestamp: Date.now(),
      summaryOf: new Set(),
    };
    const s2: Message = {
      id: "s2",
      role: "summary",
      content: "B",
      tokens: 1,
      timestamp: Date.now(),
      summaryOf: new Set(),
    };
    session.setSummaries([s1, s2]);
    expect(session.getSummaries().map((s) => s.content)).toEqual(["A", "B"]);

    // clear summaries
    session.clearSummaries();
    expect(session.getSummaries()).toHaveLength(0);
  });

  it("getFirstMessage and getLastMessage behave correctly", async () => {
    const session = createSession();
    expect(session.getFirstMessage()).toBeUndefined();
    expect(session.getLastMessage()).toBeUndefined();

    await session.addMessage({
      role: "user",
      content: "First",
      tokens: 1,
    } as Message);
    await session.addMessage({
      role: "user",
      content: "Last",
      tokens: 1,
    } as Message);

    expect(session.getFirstMessage()?.content).toBe("First");
    expect(session.getLastMessage()?.content).toBe("Last");
  });

  it("clone produces an independent copy", async () => {
    const session = createSession();
    await session.addMessage({
      role: "user",
      content: "Orig",
      tokens: 1,
    } as Message);
    const clone = session.clone("new-id", "New Name");

    // mutate clone
    clone.addMessage({
      role: "user",
      content: "CloneOnly",
      tokens: 1,
    } as Message);
    expect(clone.getMessages().map((m) => m.content)).toContain("CloneOnly");
    // original should not have that
    expect(session.getMessages().map((m) => m.content)).not.toContain(
      "CloneOnly",
    );
  });

  it("hasMessages and hasSummaryOverflowed reflect session state", async () => {
    const session = createSession();
    expect(session.hasMessages()).toBe(false);
    expect(session.hasSummaryOverflowed()).toBe(false);

    await session.addMessage({
      role: "user",
      content: "X",
      tokens: 1,
    } as Message);
    expect(session.hasMessages()).toBe(true);

    await session.addSummary({
      role: "summary",
      content: "S",
      tokens: 1,
      summaryOf: new Set([session.getMessages()[0].id!]),
    } as Message);
    expect(session.hasSummaryOverflowed()).toBe(true);
  });

  it("merge() always throws not implemented", () => {
    const session = createSession();
    expect(() => session.merge()).toThrow(/not implemented/);
  });

  it("removes references and drops empty summaries when deleting summarized messages", async () => {
    const session = createSession();
    session.useSequentialIds = true;

    // create a message and a summary of it
    await session.addMessage({
      role: "user",
      content: "X",
      tokens: 1,
    } as Message);
    const msgId = session.getMessages()[0].id!;
    await session.addSummary({
      role: "summary",
      content: "S",
      tokens: 1,
      summaryOf: new Set([msgId]),
    } as Message);

    expect(session.getSummaries()).toHaveLength(1);

    // delete the original message — summary should auto-delete
    session.deleteMessage(msgId);
    expect(session.getSummaries()).toHaveLength(0);
  });

  it("never drops system prompts from a built prompt, even under heavy truncation", async () => {
    const session = createSession();
    session.windowTokenLimit = 1;
    session.useSequentialIds = true;

    // add a system prompt and a normal message
    await session.addMessage({
      role: "system",
      content: "SYS",
      tokens: 1,
    } as Message);
    await session.addMessage({
      role: "user",
      content: "U",
      tokens: 1,
    } as Message);

    const prompt = await session.buildPrompt(1, true);
    expect(prompt[0].role).toBe("system");
    expect(prompt.some((m) => m.role === "system")).toBe(true);
  });

  it("correctly filters messages by role", async () => {
    const session = createSession();
    await session.addMessage({
      role: "user",
      content: "A",
      tokens: 1,
    } as Message);
    await session.addMessage({
      role: "assistant",
      content: "B",
      tokens: 1,
    } as Message);
    await session.addMessage({
      role: "system",
      content: "C",
      tokens: 1,
    } as Message);

    expect(
      session.filterMessagesByRole("assistant").map((m) => m.content),
    ).toEqual(["B"]);
  });

  it("preserves summaryOf sets through toJSON/fromJSON", async () => {
    const session = createSession();
    session.useSequentialIds = true;
    await session.addMessage({
      role: "user",
      content: "M",
      tokens: 1,
    } as Message);
    const id = session.getMessages()[0].id!;
    await session.addSummary({
      role: "summary",
      content: "S",
      tokens: 1,
      summaryOf: new Set([id]),
    } as Message);

    const json = session.toJSON();
    const loaded = createSession();
    loaded.fromJSON(json);

    const restoredSummary = loaded.getSummaries()[0]!;
    expect(restoredSummary.summaryOf).toBeInstanceOf(Set);
    expect(Array.from(restoredSummary.summaryOf!)).toEqual([id]);
  });

  it("allows a correctly-typed llmFormatter to reshape messages", async () => {
    const session = createSession();
    session.llmFormatter = <T>(msgs: Message[]) =>
      msgs.map((m) => ({ text: m.content, role: m.role })) as unknown as T[];
    await session.addMessage({
      role: "user",
      content: "OK",
      tokens: 1,
    } as Message);

    const out = await session.getLLMMessages<{ text: string; role: string }>();
    expect(out[0]).toEqual({ text: "OK", role: "user" });
  });
});
