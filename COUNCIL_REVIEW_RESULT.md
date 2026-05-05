# Magenta Mobile Test Automation — Definitive Improvement & Optimization Plan

> Council: 4 members (UX Designer, Product Manager, QA Engineer, Software Engineer) × 2 providers (Anthropic Claude Sonnet 4.6 + OpenAI GPT-4.1)
> 25 API calls, 3 debate rounds, 72% agreement, CLEAN audit

---

# Magenta Mobile Test Automation — Definitive Improvement & Optimization Plan

---

## Executive Summary

The Magenta framework has a sound architectural foundation but carries ten specific pain points that compound each other: a device singleton that blocks multi-device work, unvalidated iOS process output that causes silent failures, implicit crash recovery state that is untestable, and a Studio UI missing its most critical features (test execution, results, heal review). This plan addresses all ten pain points in priority order, with specific file references, code patterns, and effort estimates derived from council consensus — resolving divergences in favor of the best-justified position in each case.

---

## Detailed Answer

---

## 1. Framework Architecture Improvements

---

### 1.1 Type Safety: Zod Schemas at Every idb/xcrun Boundary

**Problem:** 8 `as any`/`as unknown` casts in iOS implementations mean idb/WDA output shape changes silently corrupt behavior at runtime. Pain points #1 and #5 share this root cause.

**Resolution of divergence:** All four members agreed Zod is the correct tool. Zod provides a single definition for both runtime validation and TypeScript inference — no separate type + guard to maintain, and `.default()` elegantly handles the iOS scale fallback. Manual `assertX()` functions require maintaining two artifacts.

**Pre-implementation requirement:** Before writing schemas, run `idb describe --udid <udid> --json` against a real booted simulator and pin exact field names (`os_version` vs `osVersion`, `screen.scale` vs `screenScale`). Mismatched names cause `.safeParse()` to return `success: false` on every call.

```typescript
// packages/core/src/devices/ios/schemas/idb.schemas.ts
import { z } from 'zod';

export const IdbDescribeSchema = z.object({
  udid: z.string(),
  name: z.string(),
  os_version: z.string(),           // verify exact field name against real idb output
  screen: z.object({
    width: z.number(),
    height: z.number(),
    scale: z.number().default(3.0), // fires when field absent from a successful parse
    density: z.number().optional(),
  }),
  state: z.enum(['Booted', 'Shutdown', 'Creating']),
});

export const IdbAccessibilityNodeSchema = z.object({
  frame: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  accessibilityIdentifier: z.string().optional(),
  label: z.string().optional(),
  value: z.string().optional(),
  elementType: z.number(),
  enabled: z.boolean().default(true),
  children: z.lazy((): z.ZodTypeAny => IdbAccessibilityNodeSchema.array()).optional(),
});

export type IdbDescribe = z.infer<typeof IdbDescribeSchema>;
export type IdbAccessibilityNode = z.infer<typeof IdbAccessibilityNodeSchema>;
```

Apply `.safeParse()` at all 8 cast sites:

```typescript
// packages/core/src/devices/ios/SimctlDevice.ts
const output = await this.runIdb(['describe', '--udid', this.udid, '--json']);
const parsed = IdbDescribeSchema.safeParse(JSON.parse(output));
if (!parsed.success) {
  logger.warn('idb describe schema validation failed', {
    errors: parsed.error.flatten(),
    udid: this.udid,
  });
  eventBus.emit('device:describe_failed', {
    udid: this.udid,
    reason: 'schema_mismatch',
    errors: parsed.error.flatten(),
  });
  // handle gracefully — see 1.2 for scale fallback
}
```

**Effort: M | Priority: HIGH**

---

### 1.2 iOS Scale Factor: Two-Tier Fallback

**Resolution of divergence:** The lookup table (Member A) is fragile — device name strings are locale-sensitive and require manual maintenance. "Warn only" (Members B/D) is insufficient because coordinate mismatches are silent test failures. The correct solution combines Zod's `.default(3.0)` for the field-absent case with an explicit `try/catch` for the process-failure case. These are two distinct failure modes requiring separate handling.

```typescript
// packages/core/src/devices/ios/SimctlDevice.ts

async getScaleFactor(): Promise<number> {
  try {
    const output = await this.runIdb(['describe', '--udid', this.udid, '--json']);
    const parsed = IdbDescribeSchema.safeParse(JSON.parse(output));
    if (!parsed.success) {
      // idb responded but shape was unexpected
      eventBus.emit('device:describe_failed', {
        udid: this.udid,
        reason: 'schema_mismatch',
        fallbackScale: 3.0,
        errors: parsed.error.flatten(),
      });
      return 3.0;
    }
    // .default(3.0) already applied by Zod if field was absent from a valid response
    return parsed.data.screen.scale;
  } catch (err) {
    // idb describe threw entirely — process crash, timeout, or not installed
    eventBus.emit('device:describe_failed', {
      udid: this.udid,
      reason: 'process_error',
      fallbackScale: 3.0,
      error: (err as Error).message,
    });
    return 3.0;
  }
}
```

Every fallback fires a structured `device:describe_failed` event so the team can audit which devices are hitting it. The fallback value of 3.0 matches existing behavior — changing it is a separate decision requiring coordinate validation across the test suite.

**Effort: S | Priority: HIGH**

---

### 1.3 Device Management: Break the Studio Backend Singleton

**Problem:** `packages/studio` backend holds a single `Device` instance. Blocks multi-device inspection, parallel test observation, and the device reconnect retry feature (pain point #11).

**Fix: `DeviceRegistry` with a pending-map to prevent double-connect race conditions.** Without the `pending` Map, two concurrent `connect()` calls for the same `udid` both pass the `devices.has()` check before either resolves, creating two instances for one physical device.

```typescript
// packages/studio/src/server/DeviceRegistry.ts
export class DeviceRegistry extends EventEmitter {
  private devices = new Map<string, InstrumentedDevice>();
  private pending = new Map<string, Promise<InstrumentedDevice>>();
  private activeStreams = new Map<string, DeviceStreamSession>();

  async connect(udid: string, platform: 'ios' | 'android'): Promise<InstrumentedDevice> {
    if (this.devices.has(udid)) return this.devices.get(udid)!;

    // Two concurrent calls for the same udid both await this promise.
    // Prevents double-instantiation of a single physical device.
    if (this.pending.has(udid)) return this.pending.get(udid)!;

    const connection = (async () => {
      const raw = platform === 'ios'
        ? new SimctlDevice(udid)
        : new AndroidDevice(udid);
      const device = new InstrumentedDevice(raw, eventBus);
      await device.initialize();
      this.devices.set(udid, device);
      this.pending.delete(udid);
      this.emit('device:connected', { udid, platform });
      return device;
    })();

    this.pending.set(udid, connection);
    // Clean up pending entry on failure so retry is possible
    connection.catch(() => this.pending.delete(udid));
    return connection;
  }

  disconnect(udid: string): void {
    this.activeStreams.get(udid)?.stop();
    this.activeStreams.delete(udid);
    this.devices.delete(udid);
    this.emit('device:disconnected', { udid });
  }

  async reconnect(udid: string, platform: 'ios' | 'android'): Promise<InstrumentedDevice> {
    this.disconnect(udid);
    return this.connect(udid, platform);
  }

  get(udid: string): InstrumentedDevice | undefined {
    return this.devices.get(udid);
  }

  getAll(): InstrumentedDevice[] {
    return [...this.devices.values()];
  }

  registerStream(udid: string, session: DeviceStreamSession): void {
    this.activeStreams.set(udid, session);
  }
}

export const deviceRegistry = new DeviceRegistry();
```

**TTL/heartbeat-based stale entry cleanup is v2 scope.** V1 cleanup is triggered by explicit `disconnect()` calls and WebSocket close events. Stale entry detection requires a heartbeat mechanism — a separate work item after the registry is stable in production.

All WebSocket routes must now require `udid` as a first-class parameter:

```typescript
// packages/studio/src/server/wsRoutes.ts
ws.on('connection', (socket, req) => {
  const udid = new URL(req.url!, 'ws://x').searchParams.get('udid');
  if (!udid) { socket.close(4001, 'udid required'); return; }
  const device = deviceRegistry.get(udid);
  if (!device) { socket.close(4004, `Device ${udid} not found`); return; }
  const session = new DeviceStreamSession(socket, device);
  deviceRegistry.registerStream(udid, session);
  session.start();
});
```

**Enables:** Studio reconnect button (calls `registry.reconnect(udid, platform)`), multi-device sync view, parallel test observation UI.

**Effort: M | Priority: CRITICAL**

---

### 1.4 Crash Recovery: Formal State Machine

**Problem:** The consecutive-crash counter + restart logic in `run-parallel.ts` (1684 lines) is implicit state with no testable transition model. Studio cannot observe shard health.

**Fix: `ShardStateMachine` extracted to `packages/core/src/runner/ShardStateMachine.ts`.** The `consecutiveCrashCount` lives as a field on the machine instance — not embedded in any state value. If the counter were inside a discriminated union state, it would reset when the machine transitions away from `CRASH_DETECTED` back to `RUNNING`. The crash threshold check happens before the state transition table runs, with a direct assignment to `QUARANTINED` — no recursive `transition()` call.

```typescript
// packages/core/src/runner/ShardStateMachine.ts
export type ShardState =
  | 'IDLE'
  | 'RUNNING'
  | 'CRASH_DETECTED'
  | 'RECOVERING'
  | 'QUARANTINED'
  | 'COMPLETED';

export type ShardEvent =
  | { type: 'TEST_START'; testId: string }
  | { type: 'TEST_PASS' }
  | { type: 'TEST_FAIL'; error: Error }
  | { type: 'CRASH_DETECTED'; crashInfo: CrashInfo }
  | { type: 'RECOVERY_SUCCESS' }
  | { type: 'RECOVERY_FAIL' };

const TRANSITIONS: Record<ShardState, Partial<Record<ShardEvent['type'], ShardState>>> = {
  IDLE:           { TEST_START: 'RUNNING' },
  RUNNING:        { TEST_PASS: 'IDLE', TEST_FAIL: 'IDLE', CRASH_DETECTED: 'CRASH_DETECTED' },
  CRASH_DETECTED: { RECOVERY_SUCCESS: 'RUNNING', RECOVERY_FAIL: 'RECOVERING' },
  RECOVERING:     { RECOVERY_SUCCESS: 'RUNNING', RECOVERY_FAIL: 'QUARANTINED' },
  QUARANTINED:    {},
  COMPLETED:      {},
};

export class ShardStateMachine extends EventEmitter {
  private state: ShardState = 'IDLE';
  // crashCount is a separate field — persists across all state transitions
  private crashCount = 0;
  readonly maxCrashes: number;

  constructor(readonly shardId: number, opts = { maxCrashes: 3 }) {
    super();
    this.maxCrashes = opts.maxCrashes;
  }

  transition(event: ShardEvent): ShardState {
    if (event.type === 'CRASH_DETECTED') {
      this.crashCount++;
      if (this.crashCount >= this.maxCrashes) {
        // Direct assignment — no recursive call, no table ambiguity
        const prev = this.state;
        this.state = 'QUARANTINED';
        this.emitTransition(prev, 'QUARANTINED', event);
        return 'QUARANTINED';
      }
    }

    const nextState = TRANSITIONS[this.state]?.[event.type];
    if (!nextState) {
      eventBus.emit('shard:invalid_transition', {
        shardId: this.shardId,
        from: this.state,
        event: event.type,
      });
      return this.state;
    }

    const prev = this.state;
    this.state = nextState;
    this.emitTransition(prev, nextState, event);
    return this.state;
  }

  private emitTransition(from: ShardState, to: ShardState, event: ShardEvent): void {
    eventBus.emit('shard:state_change', {
      shardId: this.shardId,
      from,
      to,
      crashCount: this.crashCount,
      event: event.type,
    });
  }

  get current(): ShardState { return this.state; }
  get crashes(): number { return this.crashCount; }
}
```

**Scope clarification:** The state machine itself is **M** effort and fully unit-testable without device infrastructure. Extracting it from `run-parallel.ts` and wiring `shard:state_change` events to Studio (which has no existing IPC surface with the runner) is **XL** — treat these as two separate work items. Extract and test the machine first; IPC wiring is a subsequent sprint.

**Effort: M (state machine extraction) + XL (full Studio IPC wiring) | Priority: HIGH**

---

### 1.5 Healing Log Persistence: Robust Storage

**Problem:** Hardcoded file path, no error handling on disk write failure, risk of unbounded memory growth on re-queue (pain point #4).

**Resolution of divergence:** NDJSON is correct for this use case — each line is a self-contained JSON object, the file is appendable without loading the full log, and Studio can stream-parse it for the Heal Review Panel. Members B and D's reference to "Parquet DB" is incoherent (Parquet is a columnar file format, not a database) and was not adopted.

```typescript
// packages/core/src/healing/HealingLogger.ts
export class HealingLogger {
  private buffer: HealEvent[] = [];
  private flushTimer: NodeJS.Timeout;
  private readonly logPath: string;
  private static readonly MAX_BUFFER = 500;

  constructor(opts: { logDir?: string; flushIntervalMs?: number } = {}) {
    this.logPath = path.join(
      opts.logDir
        ?? process.env.MAGENTA_LOG_DIR
        ?? path.join(os.homedir(), '.magenta'),
      'healing-log.ndjson'
    );
    this.flushTimer = setInterval(() => this.flush(), opts.flushIntervalMs ?? 5000);
  }

  record(event: HealEvent): void {
    this.buffer.push({ ...event, ts: Date.now() });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    const lines = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
    try {
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await fs.appendFile(this.logPath, lines, 'utf8');
    } catch (err) {
      // Re-buffer up to cap — prevents unbounded growth on persistent disk failure.
      // Events beyond the cap are dropped; the log_error event records the count.
      const available = HealingLogger.MAX_BUFFER - this.buffer.length;
      if (available > 0) {
        this.buffer.unshift(...batch.slice(0, available));
      }
      const dropped = batch.length - Math.max(0, available);
      eventBus.emit('healing:log_error', {
        error: (err as NodeJS.ErrnoException).code,
        dropped,
        path: this.logPath,
      });
    }
  }

  destroy(): Promise<void> {
    clearInterval(this.flushTimer);
    return this.flush();
  }
}
```

**Effort: S | Priority: MEDIUM**

---

### 1.6 Step Screenshots: Replace `console.log` Proxy

**Problem:** Parsing `Step N:` from proxied `console.log` output (pain point #6) breaks on any log reformatter or library that emits a similar prefix.

**Fix: Explicit step context API using `AsyncLocalStorage`.** The runner already uses `AsyncLocalStorage` for shard-scoped logging — this extends the existing pattern. The screenshot responsibility belongs to the shard runner's event subscriber, which has the device reference as a constructor parameter. `withStep` itself carries no device reference and no dependency on any global device map.

```typescript
// packages/core/src/runner/StepContext.ts
import { AsyncLocalStorage } from 'async_hooks';

export interface StepCtx {
  shardId: number;
  testId: string;
  stepIndex: number;
  stepLabel: string;
}

export const stepStorage = new AsyncLocalStorage<StepCtx>();

export async function withStep<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const parent = stepStorage.getStore();
  const ctx: StepCtx = {
    shardId: parent?.shardId ?? -1,
    testId: parent?.testId ?? 'unknown',
    stepIndex: (parent?.stepIndex ?? 0) + 1,
    stepLabel: label,
  };

  return stepStorage.run(ctx, async () => {
    eventBus.emit('step:start', ctx);
    try {
      const result = await fn();
      eventBus.emit('step:pass', ctx);
      return result;
    } catch (err) {
      eventBus.emit('step:fail', { ...ctx, error: err });
      throw err;
    }
  });
}
```

In `ShardRunner.ts`, the device reference is a constructor parameter — never a global:

```typescript
// packages/core/src/runner/ShardRunner.ts
eventBus.on('step:start', async (ctx: StepCtx) => {
  if (ctx.shardId !== this.shardId) return;
  try {
    const img = await this.device.screenshot();
    eventBus.emit('step:screenshot', { ...ctx, img });
  } catch {
    // Screenshot failure must not fail the test step
  }
});
```

Migration in test files:

```typescript
// Before
console.log('Step 3: Tap add to cart');
await cartPage.tapAddToCart();

// After
await withStep('Tap add to cart', () => cartPage.tapAddToCart());
```

`withStep` is additive — existing `console.log` calls continue to work until removed. Migration across 96 test files is best done file-by-file during normal maintenance, not as a big-bang codemod.

**Effort: M | Priority: HIGH**

---

### 1.7 WebSocket: Backpressure and Frame Dropping for LiveScreen

**Problem:** No backpressure on JPEG streaming (pain point #7). Slow simulators queue frames indefinitely, leading to memory growth and stale video.

```typescript
// packages/studio/src/server/DeviceStreamSession.ts
export class DeviceStreamSession {
  private frameQueue: Buffer[] = [];
  private sending = false;
  private dropped = 0;
  private readonly MAX_QUEUE = 3;
  private readonly BACKPRESSURE_BYTES: number;

  constructor(
    private ws: WebSocket,
    private device: InstrumentedDevice,
    opts: { backpressureBytes?: number } = {}
  ) {
    // 512KB default — tune based on observed behavior in production
    this.BACKPRESSURE_BYTES = opts.backpressureBytes ?? 512 * 1024;
  }

  enqueueFrame(jpeg: Buffer): void {
    if (this.frameQueue.length >= this.MAX_QUEUE) {
      this.frameQueue.shift(); // drop oldest — live video wants recency, not completeness
      this.dropped++;
      if (this.dropped % 30 === 0) {
        eventBus.emit('stream:frame_drop', {
          udid: this.device.udid,
          dropped: this.dropped,
        });
      }
    }
    this.frameQueue.push(jpeg);
    if (!this.sending) this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    this.sending = true;
    try {
      while (this.frameQueue.length > 0) {
        if (this.ws.readyState !== WebSocket.OPEN) break;
        if ((this.ws as any).bufferedAmount > this.BACKPRESSURE_BYTES) {
          await new Promise(r => setTimeout(r, 16));
          continue;
        }
        const frame = this.frameQueue.shift()!;
        this.ws.send(frame);
      }
    } finally {
      // Always reset — even if WS closed or an error occurred mid-drain
      this.sending = false;
    }
  }

  stop(): void {
    this.frameQueue = [];
  }
}
```

**FPS governor:** Client sends preferred FPS in connection handshake. Server caps capture interval to `Math.max(1000 / requestedFps, 100)` ms (10 FPS hard floor to protect simulator CPU).

**Note on `ws.bufferedAmount`:** The Node.js `ws` package's `bufferedAmount` behavior may differ from the browser WebSocket API. Verify against `ws` package documentation and tune the 512KB threshold against observed production behavior.

**Effort: S | Priority: HIGH**

---

### 1.8 Test Metadata: Centralized YAML Registry

**Problem:** QASE IDs, priorities, and quarantine flags are hardcoded in `run-parallel.ts` (pain point #8). Priority changes require touching the runner.

```yaml
# scripts/config/test-registry.yaml
tests:
  - file: "tests/ios/marketplace/search.spec.ts"
    qaseId: "TC-1042"
    priority: Critical
    verticals: [marketplace]
    quarantine: false
    tags: [smoke, search]

  - file: "tests/android/checkout/payment.spec.ts"
    qaseId: "TC-2088"
    priority: High
    verticals: [checkout]
    quarantine: true
    quarantineReason: "Race condition on payment webview load — JIRA-4421"
    tags: [payment, regression]
```

```typescript
// scripts/config/test-registry.ts
import { z } from 'zod';
import yaml from 'js-yaml';
import * as fs from 'fs';

const TestEntrySchema = z.object({
  file: z.string(),
  qaseId: z.string().optional(),
  priority: z.enum(['Critical', 'High', 'Standard']),
  verticals: z.string().array(),
  quarantine: z.boolean().default(false),
  quarantineReason: z.string().optional(),
  tags: z.string().array().default([]),
});

export type TestEntry = z.infer<typeof TestEntrySchema>;

export function loadTestRegistry(registryPath: string): TestEntry[] {
  const raw = yaml.load(fs.readFileSync(registryPath, 'utf8')) as { tests: unknown[] };
  return raw.tests.map((entry, i) => {
    const result = TestEntrySchema.safeParse(entry);
    if (!result.success) {
      // Fail at startup — better than a mid-run surprise
      throw new Error(`test-registry.yaml entry ${i}: ${result.error.message}`);
    }
    return result.data;
  });
}
```

**CI requirement:** Add a lint step that verifies every `file:` path in the registry exists on disk. Without this, the registry silently drifts from the actual test suite. Both the runner and Studio backend source metadata from this manifest — never hardcoded.

**Effort: S | Priority: MEDIUM**

---

### 1.9 Console Log Buffer Limit

**Problem:** Console logs accumulate indefinitely in the Studio backend (pain point #10).

```typescript
// packages/studio/src/server/LogBuffer.ts
export class RingBuffer<T> {
  private buf: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    if (this.buf.length >= this.capacity) this.buf.shift();
    this.buf.push(item);
  }

  toArray(): T[] { return [...this.buf]; }
  get size(): number { return this.buf.length; }
}

export const logBuffer = new RingBuffer<LogEntry>(2000);
```

On new WebSocket client connect, send `logBuffer.toArray()` as an initial hydration payload before streaming new entries. The same generic `RingBuffer<T>` class can back the WS frame queue if needed.

**Effort: XS | Priority: LOW**

---

## 2. Studio UI/UX Improvements

---

### 2.1 Information Architecture: Activity Bar Layout

The current Studio layout has no navigation model for the features being added. All four members independently identified this need.

```
┌─────────────────────────────────────────────────────────────┐
│  MAGENTA STUDIO                          ⌘K  ⚙  ◉ Recording │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│  DEVICES │   [Primary Workspace — changes per active tab]   │
│  ──────  │                                                  │
│  📱 Dev  │                                                  │
│  📱 Stg  │                                                  │
│  ──────  │                                                  │
│  TABS    │                                                  │
│  🔴 Live │                                                  │
│  🔍 Inspect                                                 │
│  ⏺  Record                                                  │
│  ▶  Run  │                                                  │
│  📊 Results                                                 │
│  💊 Heal │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

Left sidebar: persistent device list (one card per `udid`) with per-device reconnect button + platform icon. Right: mode-scoped workspace. This pattern is familiar to every automation engineer using VS Code.

**Effort: L | Priority: CRITICAL**

---

### 2.2 LiveScreen: Interaction Layer

**Click-to-tap with coordinate translation and visual feedback:**

```tsx
// packages/studio/src/client/components/LiveScreen.tsx
const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  const rect = canvasRef.current!.getBoundingClientRect();
  const scaleX = deviceWidth / rect.width;
  const scaleY = deviceHeight / rect.height;
  const x = Math.round((e.clientX - rect.left) * scaleX);
  const y = Math.round((e.clientY - rect.top) * scaleY);

  setTapRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
  ws.send(JSON.stringify({ type: 'tap', udid, x, y }));
}, [deviceWidth, deviceHeight, udid]);
```

Additional interactions:
- **Coordinate overlay:** toggle with `G` key — shows device-space coordinates at mouse position
- **Zoom:** `+`/`-` keyboard shortcuts, pinch-to-zoom on trackpad
- **Swipe:** existing 4-direction buttons retained; drag-to-swipe gesture (existing `mouseDown > 15px` mode) remains

**Effort: M | Priority: HIGH**

---

### 2.3 ElementInspector: Hierarchy Path + Selector Ranking

**Empty state:** "Select an element to inspect" — never a blank panel.

```
┌─────────────────────────────────────────────────────┐
│ ELEMENT INSPECTOR                         [📋 Copy] │
├─────────────────────────────────────────────────────┤
│ HIERARCHY  (click any node to select it)            │
│  LinearLayout                                       │
│   └─ ScrollView                                     │
│      └─ RecyclerView                                │
│         └─ ► TextView  [selected]                   │
├─────────────────────────────────────────────────────┤
│ PROPERTIES                                          │
│  id          com.app:id/product_title               │
│  text        "Nike Air Max 90"                      │
│  bounds      [24,180][360,220]                      │
│  clickable   true                                   │
├─────────────────────────────────────────────────────┤
│ SELECTORS  (ranked by reliability)                  │
│  ● id      ✓ Best     [copy]                        │
│  ○ text    ✓ Good     [copy]                        │
│  ○ xpath   ⚠ Fragile  [copy]                        │
├─────────────────────────────────────────────────────┤
│ ACTIONS                                             │
│  [Tap]  [Long Press]  [Add to Recorder]             │
└─────────────────────────────────────────────────────┘
```

Hierarchy is clickable — selecting a parent highlights it on LiveScreen. Selector ranking reflects the existing `scripts/config/locators.ts` priority order: `id > text > description > type > coordinates`.

**Effort: M | Priority: HIGH**

---

### 2.4 ActionRecorder: Copy/Export and Step Management

Copy-to-clipboard and export are a P0 gap — the recorder currently produces no usable output.

```tsx
// packages/studio/src/client/components/ActionRecorder.tsx
<CopyButton
  onClick={() => {
    // navigator.clipboard requires HTTPS or localhost.
    // Studio served over plain HTTP on non-localhost fails silently without this fallback.
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generateCode('ts')).catch(() => {
        openCopyFallbackModal(generateCode('ts'));
      });
    } else {
      openCopyFallbackModal(generateCode('ts'));
    }
  }}
/>
<ExportDropdown
  options={['TypeScript', 'YAML', 'JSON']}
  onExport={exportCode}
/>
<PlaybackButton onClick={replaySteps} tooltip="Replay recorded steps on device" />
<ClearButton onClick={clearSteps} />
```

`openCopyFallbackModal` renders a modal with a `<pre>` element and selected text — works in any browser context including plain HTTP.

**Step list with inline edit:**

```
Step 1  tap     id="login_button"              [✎] [🗑]
Step 2  type    "user@example.com"             [✎] [🗑]
Step 3  swipe   UP  500ms                      [✎] [🗑]
        [+ Add assertion]  [+ Add wait]
```

**Live code preview panel** — right panel updates in real time as steps are recorded.

**Effort: S | Priority: HIGH**

---

### 2.5 Test Execution UI (MVP Scope)

The largest Studio gap (pain point #9). Studio currently has no awareness of test runs.

**MVP includes:** live test run display, per-shard status (queued/running/pass/fail), per-step progress, and screenshot grid for the active run.

**MVP excludes:**