import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { ProviderConfig, ProviderName } from "./types.js";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface QueryResult {
  content: string;
  provider: ProviderName;
  model: string;
  durationMs: number;
}

// ── Provider Instances (lazy singletons) ──

const instances = new Map<string, unknown>();

function getAnthropic(apiKey: string): Anthropic {
  const key = `anthropic:${apiKey}`;
  if (!instances.has(key)) instances.set(key, new Anthropic({ apiKey }));
  return instances.get(key) as Anthropic;
}

function getOpenAI(apiKey: string): OpenAI {
  const key = `openai:${apiKey}`;
  if (!instances.has(key)) instances.set(key, new OpenAI({ apiKey }));
  return instances.get(key) as OpenAI;
}

function getGemini(apiKey: string): GoogleGenAI {
  const key = `gemini:${apiKey}`;
  if (!instances.has(key)) instances.set(key, new GoogleGenAI({ apiKey }));
  return instances.get(key) as GoogleGenAI;
}

// ── Query Functions ──

async function queryAnthropic(config: ProviderConfig, messages: Message[]): Promise<string> {
  const client = getAnthropic(config.apiKey);
  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 8192,
    ...(system ? { system } : {}),
    messages: userMessages,
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function queryOpenAI(config: ProviderConfig, messages: Message[]): Promise<string> {
  const client = getOpenAI(config.apiKey);
  const response = await client.chat.completions.create({
    model: config.model,
    max_completion_tokens: 8192,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return response.choices[0]?.message?.content ?? "";
}

async function queryGemini(config: ProviderConfig, messages: Message[]): Promise<string> {
  const client = getGemini(config.apiKey);
  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages.filter((m) => m.role !== "system");

  // Build conversation content for Gemini
  const contents = userMessages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const response = await client.models.generateContent({
    model: config.model,
    contents,
    config: {
      maxOutputTokens: 8192,
      ...(system ? { systemInstruction: system } : {}),
    },
  });

  return response.text ?? "";
}

// ── Public API ──

export async function query(config: ProviderConfig, messages: Message[]): Promise<QueryResult> {
  const start = Date.now();

  let content: string;
  switch (config.name) {
    case "anthropic":
      content = await queryAnthropic(config, messages);
      break;
    case "openai":
      content = await queryOpenAI(config, messages);
      break;
    case "gemini":
      content = await queryGemini(config, messages);
      break;
  }

  return {
    content,
    provider: config.name,
    model: config.model,
    durationMs: Date.now() - start,
  };
}

export async function queryParallel(
  configs: ProviderConfig[],
  messages: Message[],
): Promise<(QueryResult | null)[]> {
  const results = await Promise.allSettled(configs.map((c) => query(c, messages)));

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[council] ${configs[i].name}/${configs[i].model} failed:`, r.reason?.message ?? r.reason);
    return null;
  });
}

/**
 * Query multiple providers with DIFFERENT messages (one per provider).
 * Used in Stage 1 where each member gets a personalized system prompt.
 */
export async function queryParallelDistinct(
  calls: { config: ProviderConfig; messages: Message[] }[],
): Promise<(QueryResult | null)[]> {
  const results = await Promise.allSettled(calls.map((c) => query(c.config, c.messages)));

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[council] ${calls[i].config.name}/${calls[i].config.model} failed:`, r.reason?.message ?? r.reason);
    return null;
  });
}
