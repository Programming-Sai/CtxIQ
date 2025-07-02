# Problem Tracker<br><br>

## 📋 Table of Contents<br>

- [Sliding window token logic planning](#🆔-20---sliding-window-token-logic-planning)

- [Docs platform choice: MkDocs vs Docusaurus](#🆔-19---docs-platform-choice-mkdocs-vs-docusaurus)

- [tsconfig include/exclude path issues bug](#🆔-18---tsconfig-includeexclude-path-issues-bug)

- [Use rimraf for clean script](#🆔-17---use-rimraf-for-clean-script)

- [npm pack & npm publish workflow](#🆔-16---npm-pack--npm-publish-workflow)

- [ISC vs MIT license basics](#🆔-15---isc-vs-mit-license-basics)

- [package.json keywords for npm search](#🆔-14---packagejson-keywords-for-npm-search)

- [Jest config file extension matters bug](#🆔-13---jest-config-file-extension-matters-bug)

- [TSImplicitAny on parameters](#🆔-12---tsimplicitany-on-parameters)

- [ESLint & TS config missing modules](#🆔-11---eslint--ts-config-missing-modules)

- [Typo in editMessage event name bug](#🆔-10---typo-in-editmessage-event-name-bug)

- [clone() missed copying messages bug](#🆔-9---clone-missed-copying-messages-bug)

- [clearMessages didn’t clear buffer bug](#🆔-8---clearmessages-didnt-clear-buffer-bug)

- [Array.from works on Map iterators](#🆔-7---arrayfrom-works-on-map-iterators)

- [Partial<T> makes all fields optional](#🆔-6---partialt-makes-all-fields-optional)

- [Suppress unused‑vars via underscore or ESLint disable](#🆔-5---suppress-unusedvars-via-underscore-or-eslint-disable)

- [Rename replaceMessage→editMessage for clarity](#🆔-4---rename-replacemessageeditmessage-for-clarity)

- [messageAdded listener crash when throwing](#🆔-3---messageadded-listener-crash-when-throwing)

- [Dynamic property assignment in TS](#🆔-2---dynamic-property-assignment-in-ts)

- [TS Map preserves insertion order](#🆔-1---ts-map-preserves-insertion-order)

---

---

### 🆔 20 - Sliding window token logic planning

<br>**Status:** ⏳ Pending

**Language:** Typescript

**Time Taken:** 10m

### 🐞 Problem Description<br>

Drafted getMessageWindow(windowLimit) algorithm: sum tokens, reset at summaries, return token‑bounded slice

<br>
<br>

---

### 🆔 19 - Docs platform choice: MkDocs vs Docusaurus

<br>**Status:** ⏳ Pending

**Language:** Markdown

**Time Taken:** 8m

### 🐞 Problem Description<br>

Evaluated MkDocs (Python/Jinja) vs Docusaurus (React) for JS project docs; lean toward Docusaurus for JS injection

<br>
<br>

---

### 🆔 18 - tsconfig include/exclude path issues bug

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 5m

### 🐞 Problem Description<br>

No inputs found until tsconfig.json include/exclude corrected

```typescript
'include': ['src/**/*'],'exclude': ['dist']
```

### ✅ Solution Description

<br>
Adjust include paths to match src folder

```typescript
tsconfig.json include: ['src/**/*']
```

<br>
<br>

---

### 🆔 17 - Use rimraf for clean script

<br>**Status:** ✅ Solved

**Language:** Shell

**Time Taken:** 3m

### 🐞 Problem Description<br>

Added 'rimraf dist' in clean script to remove compiled files cross‑platform

<br>
<br>

---

### 🆔 16 - npm pack & npm publish workflow

<br>**Status:** ✅ Solved

**Language:** Shell

**Time Taken:** 5m

### 🐞 Problem Description<br>

Practiced npm login, npm pack to preview tarball, and npm publish --access public for initial versions

<br>
<br>

---

### 🆔 15 - ISC vs MIT license basics

<br>**Status:** ✅ Solved

**Language:** Text

**Time Taken:** 6m

### 🐞 Problem Description<br>

Learned ISC is a permissive license similar to MIT; you can’t retroactively restrict MIT‑licensed code

<br>
<br>

---

### 🆔 14 - package.json keywords for npm search

<br>**Status:** ✅ Solved

**Language:** Json

**Time Taken:** 3m

### 🐞 Problem Description<br>

Learned the 'keywords' field helps npm registry searchability and should list relevant tags

```json
'keywords': ['ai','context']
```

<br>
<br>

---

### 🆔 13 - Jest config file extension matters bug

<br>**Status:** ✅ Solved

**Language:** Javascript

**Time Taken:** 4m

### 🐞 Problem Description<br>

Tests failed until jest.config.js was renamed to jest.config.mjs to match module type

```javascript
module.exports = {...}
```

### ✅ Solution Description

<br>
Rename file and update test command

```javascript
jest --config jest.config.mjs
```

<br>
<br>

---

### 🆔 12 - TSImplicitAny on parameters

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 6m

### 🐞 Problem Description<br>

Disabled noImplicitAny in tsconfig or added explicit types to function parameters to avoid TS7006 errors

<br>
<br>

---

### 🆔 11 - ESLint & TS config missing modules

<br>**Status:** ✅ Solved

**Language:** Javascript

**Time Taken:** 7m

### 🐞 Problem Description<br>

Fixed eslint.config.mjs imports by installing @eslint/js, globals, and typescript-eslint plugins to resolve 'module not found'

```javascript
import js from "@eslint/js";
import globals from "globals";
```

<br>
<br>

---

### 🆔 10 - Typo in editMessage event name bug

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 5m

### 🐞 Problem Description<br>

Emitted 'messageEditted' instead of 'messageEdited', listeners never fired

```typescript
this.emit('messageEditted',...)
```

### ✅ Solution Description

<br>
Corrected event name to 'messageEdited'

```typescript
this.emit("messageEdited", id, newMsg);
```

<br>
<br>

---

### 🆔 9 - clone() missed copying messages bug

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 7m

### 🐞 Problem Description<br>

clone() only copied metadata; new session was empty

```typescript
clone(id,name){return new ConversationSession(...)}
```

### ✅ Solution Description

<br>
Iterate original.messages and set on cloned.messages

```typescript
for (const [i, m] of this.messages) clone.messages.set(i, { ...m });
```

<br>
<br>

---

### 🆔 8 - clearMessages didn’t clear buffer bug

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 6m

### 🐞 Problem Description<br>

clearMessages() stub left messages intact, causing tests to fail

```typescript
clearMessages():void{this.messages.clear()}
```

### ✅ Solution Description

<br>
Implement this.messages.clear() and emit event

```typescript
clearMessages(){this.messages.clear();this.emit('messagesCleared',this.id)}
```

<br>
<br>

---

### 🆔 7 - Array.from works on Map iterators

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 4m

### 🐞 Problem Description<br>

Realized Array.from(map.values()) returns Message[]; Array.from(map.entries()) returns [id, Message] tuples

```typescript
Array.from(this.messages.values());
```

<br>
<br>

---

### 🆔 6 - Partial<T> makes all fields optional

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 4m

### 🐞 Problem Description<br>

Used Partial<Message> to stub incomplete Message objects in tests without requiring all fields

```typescript
const stub: Partial<Message> = { role, content };
```

<br>
<br>

---

### 🆔 5 - Suppress unused‑vars via underscore or ESLint disable

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 5m

### 🐞 Problem Description<br>

Learned to prefix unused parameters with \_ or use eslint-disable-next-line to silence no-unused-vars

```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
```

<br>
<br>

---

### 🆔 4 - Rename replaceMessage→editMessage for clarity

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 3m

### 🐞 Problem Description<br>

Chose editMessage over replaceMessage to more accurately describe updating an existing message in place

```typescript
editMessage(id, newMsg);
```

<br>
<br>

---

### 🆔 3 - messageAdded listener crash when throwing

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 8m

### 🐞 Problem Description<br>

Found that unhandled errors in EventEmitter listeners crash the process

```typescript
this.emit("messageAdded", id, message);
```

### ✅ Solution Description

<br>
Wrapped listener code in try/catch to prevent bubble-up

```typescript
emitter.on('messageAdded', (id,msg)=>{ try{…}catch(e){console.error(e)} });
```

<br>
<br>

---

### 🆔 2 - Dynamic property assignment in TS

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 4m

### 🐞 Problem Description<br>

Discovered you can assign new fields (message.id = id) at runtime in JS/TS without errors, but types must include them or be cast

```typescript
message.id = generatedId;
```

<br>
<br>

---

### 🆔 1 - TS Map preserves insertion order

<br>**Status:** ✅ Solved

**Language:** Typescript

**Time Taken:** 5m

### 🐞 Problem Description<br>

Learned that Map<string,Message> maintains insertion order, unlike plain objects, ideal for chat history sequencing

```typescript
private messages: Map<string, Message> = new Map();
```

<br>
<br>
