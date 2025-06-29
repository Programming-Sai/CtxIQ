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
      const window = session.getMessageWindow(8, undefined, compacted);
      expect(window.map((m) => m.content)).toEqual(["Next"]);
    });
  });
});
