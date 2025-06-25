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
});
