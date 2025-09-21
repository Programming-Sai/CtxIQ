# CtxIQ

[![CI](https://github.com/Programming-Sai/CtxIQ/actions/workflows/ci.yml/badge.svg)](https://github.com/Programming-Sai/CtxIQ/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/ctxiq.svg)](https://www.npmjs.com/package/ctxiq)
[![Status](https://img.shields.io/badge/development-active-brightgreen.svg)](#)
[![Status](https://img.shields.io/badge/status-WIP-orange.svg)](#)

> Context and memory orchestration toolkit for building smarter AI assistants in TypeScript.

---

## 🚧 Status

**This project is under active development.**  
Expect frequent updates and breaking changes until the first stable release.  
Follow for progress or contribute!

```mermaid
flowchart TD
  subgraph Core
    CM["ConversationManager"]
    CS["ConversationSession (one session)"]
    TM["TokenManager (ApproxTokenCounter / optional tiktoken)"]
    BP["buildPrompt() / summaryFn (async)"]
    LC["LLMCaller (MockLLMCaller / future adapters)"]
    PM["Prompt Messages"]
    AR["Assistant Reply"]
  end

  subgraph Persistence["Optional Persistence Adapters"]
    LS["LocalStorageAdapter (browser)"]
  end

  %% Main orchestration flow
  CM -->|creates loads lists sessions| CS
  CS -->|stores messages summaries| TM
  CS -->|calls| BP
  BP -->|produces| PM
  PM -->|count tokens| TM
  PM -->|sent to| LC
  LC -->|returns| AR
  AR -->|added to session| CS

  %% Persistence controlled by Manager
  CM -->|save/load session toJSON fromJSON| JSON
  CM -->|save/load session toJSON fromJSON| LS
  CS -->|toJSON fromJSON| CM

  %% Notes with real line breaks
  TM_note["<p align="left"><b>TokenManager</b> used to:<br/>- estimate prompt tokens<br/>- reserve space for summaries<br/>- optionally use tiktoken (lazy-loaded)<p/>"]:::note

  LC_note["<p align="left"><b>LLMCaller</b> is pluggable:<br/>- MockLLMCaller (tests & demo)<br/>- adapters (OpenAI/Groq/etc) to be added later<br/>- summaryFn runs via LLMCaller (async)<p/>"]:::note

  CM_note["<p align="left"><b>ConversationManager</b> responsibilities:<br/>- create/load/save/delete sessions<br/>- choose storage adapter<br/>- provide global config (token budgets, defaults)<br/>- wire TokenManager and LLMCaller instances<p/>"]:::note

  TM -.-> TM_note
  LC -.-> LC_note
  CM -.-> CM_note

  classDef note fill:#f9f,stroke:#333,stroke-width:1px,color:#333;

```

free for dev
open source alternatives
