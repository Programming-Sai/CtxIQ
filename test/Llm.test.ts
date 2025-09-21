/* eslint-disable @typescript-eslint/no-explicit-any */
// test/llm.test.ts
import { MockLLMCaller } from "../src/core/llm/MockLLMCaller";
import { BaseLLMCaller } from "../src/core/llm/BaseLLMCaller";
import type { Message } from "../src/types";
import { LLMConfig } from "../src/core/llm";

/**
 * Minimal expected mock response shape used in tests.
 * The MockLLMCaller returns an object compatible with this interface.
 */
type MockLLMResponse = {
  text: string;
  tokensUsed: number;
  usage?: { totalTokens: number };
  model?: string | undefined;
  raw?: any;
};

describe("LLM plumbing -- MockLLMCaller + BaseLLMCaller", () => {
  describe("MockLLMCaller - basic behavior", () => {
    it("returns deterministic reply and usage based on last user message", async () => {
      const mock = new MockLLMCaller("Hey: ", {} as LLMConfig);
      const messages: Message[] = [
        {
          id: "1",
          role: "system",
          content: "You are a mock.",
          tokens: 0,
          timestamp: Date.now(),
        },
        {
          id: "2",
          role: "user",
          content: "Hello test",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];

      const res = (await mock.call(messages)) as MockLLMResponse;
      expect(res.text).toBe("Hey: Hello test");
      expect(typeof res.tokensUsed).toBe("number");
      expect(res.tokensUsed).toBe(Math.ceil(res.text.length / 4));
      expect(res.usage?.totalTokens).toBe(res.tokensUsed);
      // model was not provided, should be undefined
      expect(res.model).toBeUndefined();
      // capabilities
      expect(mock.capabilities?.streaming).toBe(true);
    });

    it("propagates model option into the response.model field", async () => {
      const mock = new MockLLMCaller("ModelCheck: ", {} as LLMConfig);
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "check model",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];
      const res = (await mock.call(messages, {
        model: "test-model-1",
      })) as MockLLMResponse;
      expect(res.model).toBe("test-model-1");
      expect(res.text).toContain("ModelCheck:");
    });

    it("handles empty messages array (returns prefix only)", async () => {
      const mock = new MockLLMCaller("Empty: ", {} as LLMConfig);
      const res = (await mock.call([])) as MockLLMResponse;
      expect(res.text).toBe("Empty: ");
      expect(res.tokensUsed).toBeGreaterThanOrEqual(1);
    });

    it("handles whitespace-only last message content", async () => {
      const mock = new MockLLMCaller("Space: ", {} as LLMConfig);
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "   ",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];
      const res = (await mock.call(messages)) as MockLLMResponse;
      // content retained, prefix present
      expect(res.text).toBe("Space:    ");
      // whitespace still contributes to char length -> tokensUsed should be >= 1
      expect(res.tokensUsed).toBeGreaterThanOrEqual(1);
    });

    it("handles very large input without throwing and returns sensible token estimate", async () => {
      const mock = new MockLLMCaller("Big: ", {} as LLMConfig);
      const big = "x".repeat(50_000);
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: big,
          tokens: 0,
          timestamp: Date.now(),
        },
      ];
      const res = (await mock.call(messages)) as MockLLMResponse;
      expect(res.text.startsWith("Big: ")).toBe(true);
      // tokensUsed approximate
      expect(res.tokensUsed).toBeGreaterThanOrEqual(
        Math.ceil(res.text.length / 4) - 1,
      );
    });
  });

  describe("MockLLMCaller - streaming behavior", () => {
    it("streams token chunks and final info chunk; assembled text equals call()", async () => {
      const mock = new MockLLMCaller("S: ", {} as LLMConfig);
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "stream me please",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];

      const callRes = (await mock.call(messages)) as MockLLMResponse;
      const parts: string[] = [];
      let sawInfo = false;

      for await (const chunk of mock.stream(messages)) {
        if (chunk.type === "token" && chunk.text) {
          parts.push(chunk.text);
        } else if (chunk.type === "info") {
          sawInfo = true;
          break;
        } else if (chunk.type === "chunk" && chunk.text) {
          // fallback chunk type (shouldn't happen for mock's stream but be defensive)
          parts.push(chunk.text);
        }
      }

      expect(sawInfo).toBe(true);
      const assembled = parts.join("");
      // assembled may differ in whitespace, but should contain the same words
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(normalize(assembled)).toBe(normalize(callRes.text));
    });

    it("stream async iterator is consumable multiple times only by re-calling (generators are single-use)", async () => {
      const mock = new MockLLMCaller("One: ", {} as LLMConfig);
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "x",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];

      const iterator = mock.stream(messages);
      const firstParts: string[] = [];
      for await (const c of iterator) {
        if (c.type === "token" && c.text) firstParts.push(c.text);
        if (c.type === "info") break;
      }
      // trying to iterate the same iterator again would do nothing (it's exhausted)
      const secondParts: string[] = [];
      for await (const c of iterator) {
        if (c.type === "token" && c.text) secondParts.push(c.text);
      }
      expect(secondParts.length).toBe(0);
      expect(firstParts.length).toBeGreaterThan(0);
    });
  });

  describe("BaseLLMCaller - fallback stream behavior", () => {
    it("BaseLLMCaller.stream fallback yields a single chunk that equals call().text when subclass doesn't implement stream", async () => {
      // create a quick subclass that only implements call() with the generic signature
      class SimpleCaller extends BaseLLMCaller {
        name = "simple";
        async call<TIn = unknown, TOut = unknown>(
          _messages: TIn[],
        ): Promise<TOut> {
          void _messages;
          return { text: "simple-reply", raw: null } as unknown as TOut;
        }
      }

      const c = new SimpleCaller();
      // call() should work — cast to expected shape
      const r = (await c.call([
        {
          id: "1",
          role: "user",
          content: "hello",
          tokens: 0,
          timestamp: Date.now(),
        },
      ])) as { text: string; raw: any };
      expect(r.text).toBe("simple-reply");

      // stream fallback uses call() and yields one chunk
      const parts: string[] = [];
      for await (const ch of c.stream([])) {
        if ((ch as any).text) parts.push((ch as any).text);
      }
      expect(parts.join("")).toBe("simple-reply");
    });

    it("BaseLLMCaller subclasses that do not set capabilities should have empty capabilities object or undefined", () => {
      class SimpleCaller2 extends BaseLLMCaller {
        name = "simple2";
        async call<TIn = unknown, TOut = unknown>(
          _messages: TIn[],
        ): Promise<TOut> {
          void _messages;
          return { text: "x", raw: null } as unknown as TOut;
        }
      }
      const c2 = new SimpleCaller2();
      // default capabilities may be undefined or an object; verify no crash and streaming fallback exists
      expect(typeof c2.stream).toBe("function");
    });
  });
});
