import { ApproxTokenCounter } from "../src/core/tokens/ApproxTokenCounter";
import { OpenAiTokenCounter } from "../src/core/tokens/OpenAiTokenCounter";
import type { Message } from "../src/types";

describe("Token Management", () => {
  describe("ApproxTokenCounter", () => {
    it("counts tokens approximately", async () => {
      const counter = new ApproxTokenCounter();
      const result = await counter.count("hello world");
      expect(result.chars).toBe(11);
      expect(result.words).toBe(2);
      expect(result.tokens).toBe(Math.ceil(11 / 4));
      expect(result.method).toBe("approx");
    });

    it("respects includeRoles", async () => {
      const counter = new ApproxTokenCounter();
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          content: "Hi",
          tokens: 0,
          timestamp: Date.now(),
        },
        {
          id: "2",
          role: "assistant",
          content: "Hello",
          tokens: 0,
          timestamp: Date.now(),
        },
      ];

      const withRoles = await counter.count(messages, { includeRoles: true });
      const withoutRoles = await counter.count(messages, {
        includeRoles: false,
      });

      expect(withRoles.chars).toBeGreaterThan(withoutRoles.chars);
    });

    it("uses custom tokenizerFn if provided", async () => {
      const counter = new ApproxTokenCounter();
      const custom = await counter.count("abc", {
        tokenizerFn: (txt) => txt.length * 10,
      });
      expect(custom.tokens).toBe(30);
      expect(custom.method).toBe("custom");
    });

    // ✅ New edge-case tests
    it("handles empty string safely", async () => {
      const counter = new ApproxTokenCounter();
      const result = await counter.count("");
      expect(result.chars).toBe(0);
      expect(result.words).toBe(0);
      expect(result.tokens).toBe(0);
    });

    it("handles only whitespace as zero words", async () => {
      const counter = new ApproxTokenCounter();
      const result = await counter.count("     ");
      expect(result.words).toBe(0);
      expect(result.tokens).toBeGreaterThanOrEqual(0);
    });

    it("handles large input without crashing", async () => {
      const counter = new ApproxTokenCounter();
      const big = "a".repeat(10_000);
      const result = await counter.count(big);
      expect(result.chars).toBe(10_000);
      expect(result.tokens).toBe(Math.ceil(10_000 / 4));
    });

    it("handles empty message array safely", async () => {
      const counter = new ApproxTokenCounter();
      const result = await counter.count([]);
      expect(result.chars).toBe(0);
      expect(result.words).toBe(0);
      expect(result.tokens).toBe(0);
    });
  });

  describe("OpenAiTokenCounter (fallback)", () => {
    // mock to simulate missing tiktoken for CI
    jest.mock("@dqbd/tiktoken", () => {
      throw new Error("mocked missing tiktoken");
    });

    it("falls back to ApproxTokenCounter when tiktoken is unavailable", async () => {
      const counter = new OpenAiTokenCounter();
      const result = await counter.count("Hello there");
      expect(result.method).toBe("approx");
      expect(result.tokens).toBe(Math.ceil(result.chars / 4));
    });
  });
});
