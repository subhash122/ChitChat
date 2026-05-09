# Real-Time Chat Application Architecture Guide

A comprehensive guide covering industry-standard approaches for building a real-time chat application with message delivery receipts (WhatsApp-style ticks).

---

## Table of Contents

1. [Core Requirements](#core-requirements)
2. [System Architecture Overview](#system-architecture-overview)
3. [How WhatsApp-Style Ticks Work](#how-whatsapp-style-ticks-work)
4. [Technology Stack](#technology-stack)
5. [Complete Process Flows](#complete-process-flows)
6. [With vs Without RabbitMQ](#with-vs-without-rabbitmq)
7. [Kafka vs RabbitMQ](#kafka-vs-rabbitmq)
8. [Database Schema](#database-schema)

---

## Core Requirements

- Real-time message delivery
- Single tick (✓) — message sent to server
- Double tick (✓✓) — message delivered to recipient's device
- Blue double tick (✓✓) — message read/seen by recipient
- Persistent chat history on login

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SYSTEM OVERVIEW                                │
│                                                                         │
│  ┌──────────┐    WebSocket     ┌──────────────┐      ┌──────────────┐  │
│  │  Alice's  │◄═══════════════►│              │      │              │  │
│  │  Browser  │                 │   WebSocket   │◄────►│  PostgreSQL  │  │
│  └──────────┘                 │    Server     │      │   Database   │  │
│                                │   (Node.js)  │      │              │  │
│  ┌──────────┐    WebSocket     │              │      └──────────────┘  │
│  │  Bob's   │◄═══════════════►│              │             │           │
│  │  Browser  │                 └──────┬───────┘             │           │
│  └──────────┘                        │                     │           │
│                                       │ publish/consume     │           │
│                                       ▼                     │           │
│                                ┌──────────────┐             │           │
│                                │   RabbitMQ   │             │           │
│                                │    Broker    │             │           │
│                                │              │             │           │
│                                │ ┌──────────┐ │             │           │
│                                │ │ user.alice│ │             │           │
│                                │ │  .messages│ │             │           │
│                                │ └──────────┘ │             │           │
│                                │ ┌──────────┐ │             │           │
│                                │ │ user.bob  │ │             │           │
│                                │ │  .messages│ │             │           │
│                                │ └──────────┘ │             │           │
│                                └──────────────┘             │           │
│                                                              │           │
│  ┌──────────┐    HTTP/REST     ┌──────────────┐             │           │
│  │  Any      │◄═══════════════►│   Next.js    │◄────────────┘           │
│  │  Browser  │                 │   App Server │  (chat history,         │
│  └──────────┘                 │   (API + UI) │   auth, pages)          │
│                                └──────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: WebSocket server and Next.js server are separate processes. Next.js handles HTTP (pages, API routes). WebSocket server handles persistent real-time connections.

---

## How WhatsApp-Style Ticks Work

| State | Icon | Trigger |
|-------|------|---------|
| **Sent** | Single grey tick (✓) | Server acknowledges it received the message |
| **Delivered** | Double grey tick (✓✓) | Recipient's device receives the message |
| **Read** | Double blue tick (✓✓) | Recipient opens the chat / message becomes visible |

### Message Status State Machine

```
    ┌─────────┐         ┌─────────────┐         ┌──────────┐
    │         │         │             │         │          │
    │  SENT   │────────►│  DELIVERED  │────────►│   READ   │
    │         │         │             │         │          │
    │  ✓      │         │  ✓✓ (grey)  │         │ ✓✓ (blue)│
    │         │         │             │         │          │
    └─────────┘         └─────────────┘         └──────────┘
         │                    │                      │
    Triggered by:        Triggered by:          Triggered by:
    Server saves         Recipient's device     Recipient OPENS
    msg to DB            RECEIVES the msg       the chat and VIEWS
                                                the message
         │                    │                      │
    DB column:           DB column:              DB column:
    status='sent'        status='delivered'      status='read'
    created_at=now       delivered_at=now        read_at=now
```

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js | SSR for initial page load, client components for chat UI |
| WebSocket | Socket.IO | Auto-reconnection, room support, fallback to polling |
| Message Broker | RabbitMQ | Reliable delivery, per-user queues, mature ecosystem |
| Database | PostgreSQL (with Prisma ORM) | Relational model fits conversations/messages, type safety |
| Auth | NextAuth.js or JWT | Session management + WebSocket auth |
| WS Server | Custom Node.js server | Next.js API routes don't support persistent WebSocket connections |

---

## Complete Process Flows

### Flow 1: User Login & Connection Setup

```
Alice (browser)           Next.js Server         WS Server            RabbitMQ
    │                          │                     │                    │
    │── POST /api/login ──────►│                     │                    │
    │   {email, password}      │                     │                    │
    │                          │── verify creds ──►  │                    │
    │                          │   against DB        │                    │
    │◄── JWT token ───────────│                     │                    │
    │                          │                     │                    │
    │══ WS connect ═══════════════════════════════►  │                    │
    │   (sends JWT in handshake)                     │                    │
    │                          │                     │── verify JWT       │
    │                          │                     │   (extract userId) │
    │                          │                     │                    │
    │                          │                     │── subscribe ──────►│
    │                          │                     │   queue:           │
    │                          │                     │   user.alice.msgs  │
    │                          │                     │                    │
    │                          │                     │◄── pending msgs ──│
    │                          │                     │   (if any queued)  │
    │                          │                     │                    │
    │◄══ WS: pending msgs ═══════════════════════──│                    │
    │   delivered to Alice                           │                    │
```

### Flow 2: Loading Chat History (on app open)

```
Alice (browser)              Next.js Server              PostgreSQL
    │                             │                          │
    │── GET /api/conversations ──►│                          │
    │                             │── SELECT conversations ─►│
    │                             │   WHERE user_id = alice  │
    │                             │◄── conversation list ───│
    │◄── conversations list ─────│                          │
    │                             │                          │
    │   [Alice clicks on chat    │                          │
    │    with Bob]               │                          │
    │                             │                          │
    │── GET /api/messages ──────►│                          │
    │   ?conversationId=X        │                          │
    │   &cursor=latest           │                          │
    │   &limit=50                │                          │
    │                             │── SELECT messages ──────►│
    │                             │   WHERE conv_id = X      │
    │                             │   ORDER BY created DESC  │
    │                             │   LIMIT 50               │
    │                             │◄── last 50 messages ────│
    │◄── messages + statuses ───│                          │
    │                             │                          │
    │   [Alice scrolls up]       │                          │
    │                             │                          │
    │── GET /api/messages ──────►│                          │
    │   ?cursor=msg_id_51        │                          │
    │   &limit=50                │── SELECT next 50 ───────►│
    │                             │◄── older messages ──────│
    │◄── older messages ────────│                          │
```

### Flow 3: Sending a Message (Both Users Online) — Complete Happy Path

```
Alice (browser)         WS Server              RabbitMQ          Bob (browser)
    │                      │                      │                    │
    │  [Alice types "Hey Bob!" and hits send]                          │
    │                                                                  │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 1: SEND                                            │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                                           │
    │══ WS: send_message ═►│                                           │
    │  {                   │                                           │
    │   to: "bob",         │                                           │
    │   text: "Hey Bob!",  │                                           │
    │   tempId: "abc123"   │  ← client-generated temp ID              │
    │  }                   │     for optimistic UI                     │
    │                      │                                           │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 2: PERSIST + ACK (single tick ✓)                   │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                                           │
    │                      │── INSERT INTO messages ──► PostgreSQL     │
    │                      │   (id: msg_001,                           │
    │                      │    sender: alice,                         │
    │                      │    receiver: bob,                         │
    │                      │    text: "Hey Bob!",                      │
    │                      │    status: "sent",                        │
    │                      │    created_at: now)                       │
    │                      │◄── OK ───────────────── PostgreSQL        │
    │                      │                                           │
    │◄══ WS: message_ack ═│                                           │
    │  {                   │                                           │
    │   tempId: "abc123",  │  ← maps temp ID to real ID               │
    │   msgId: "msg_001",  │                                           │
    │   status: "sent"     │  ← UI shows single tick ✓                │
    │  }                   │                                           │
    │                      │                                           │
    │  Alice's UI:         │                                           │
    │  ┌──────────────┐    │                                           │
    │  │ Hey Bob!  ✓  │    │                                           │
    │  └──────────────┘    │                                           │
    │                      │                                           │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 3: PUBLISH TO RABBITMQ                             │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                      │                    │
    │                      │── publish ──────────►│                    │
    │                      │   queue:             │                    │
    │                      │   user.bob.messages  │                    │
    │                      │                      │                    │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 4: DELIVER TO BOB (consumer active)                │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                      │                    │
    │                      │◄── consume ─────────│                    │
    │                      │══ WS: new_message ══════════════════════►│
    │                      │  {msgId: "msg_001", from: "alice",       │
    │                      │   text: "Hey Bob!"}                      │
    │                      │                                           │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 5: DELIVERED ACK (double tick ✓✓)                  │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                                           │
    │                      │◄══ WS: message_delivered ════════════════│
    │                      │   { msgId: "msg_001" }                    │
    │                      │── UPDATE status='delivered' ► PostgreSQL  │
    │                      │                                           │
    │◄══ WS: status_update │                                           │
    │  {msgId: "msg_001",  │                                           │
    │   status: "delivered"}│  ← UI shows double tick ✓✓              │
    │                      │                                           │
    │  Alice's UI:         │                                           │
    │  ┌──────────────┐    │                                           │
    │  │ Hey Bob! ✓✓  │    │                                           │
    │  └──────────────┘    │                                           │
    │                      │                                           │
    │  ┌─────────────────────────────────────────────────────────┐     │
    │  │ STEP 6: READ ACK (blue double tick ✓✓)                  │     │
    │  └─────────────────────────────────────────────────────────┘     │
    │                      │                                           │
    │                      │       [Bob opens Alice's chat]            │
    │                      │◄══ WS: message_read ════════════════════│
    │                      │   { msgIds: ["msg_001"] }                 │
    │                      │── UPDATE status='read' ──► PostgreSQL    │
    │                      │                                           │
    │◄══ WS: status_update │                                           │
    │  {msgId: "msg_001",  │                                           │
    │   status: "read"}    │  ← UI shows BLUE double tick ✓✓          │
    │                      │                                           │
    │  Alice's UI:         │                                           │
    │  ┌──────────────┐    │                                           │
    │  │ Hey Bob! ✓✓  │    │  (✓✓ is now blue)                        │
    │  └──────────────┘    │                                           │
```

### Flow 4: Sending a Message (Recipient OFFLINE)

```
Alice (browser)         WS Server              RabbitMQ            Bob (OFFLINE)
    │                      │                      │                    ✗
    │══ WS: send_message ═►│                      │
    │  "Hey Bob!"          │                      │
    │                      │── INSERT (sent) ────► PostgreSQL
    │◄══ WS: ack (✓) ════│                      │
    │                      │                      │
    │                      │── publish ──────────►│
    │                      │   queue:             │
    │                      │   user.bob.messages  │
    │                      │                      │
    │                      │   ┌─────────────────────────────────┐
    │                      │   │  No consumer on Bob's queue!    │
    │                      │   │  Message STAYS in queue.        │
    │                      │   │                                 │
    │                      │   │  queue: user.bob.messages       │
    │                      │   │  ┌───────┐ ┌───────┐ ┌───────┐ │
    │                      │   │  │ msg_1 │ │ msg_2 │ │ msg_3 │ │
    │                      │   │  └───────┘ └───────┘ └───────┘ │
    │                      │   │  (piling up over hours/days)    │
    │                      │   └─────────────────────────────────┘
    │                      │                      │
    │  Alice's UI:         │                      │
    │  ┌──────────────┐    │                      │
    │  │ Hey Bob!  ✓  │    │  ← STAYS single tick │
    │  │ You there? ✓ │    │    (never delivered)  │
    │  │ Hello??   ✓  │    │                      │
    │  └──────────────┘    │                      │
```

### Flow 5: Offline User Reconnects

```
    Bob (browser)          WS Server              RabbitMQ
        │                      │                      │
        │                      │   queue: user.bob.messages
        │                      │   ┌───────┐ ┌───────┐ ┌───────┐
        │                      │   │ msg_1 │ │ msg_2 │ │ msg_3 │
        │                      │   └───────┘ └───────┘ └───────┘
        │                      │                      │
  [Bob opens app]              │                      │
        │                      │                      │
        │══ WS connect ══════►│                      │
        │   (JWT handshake)    │                      │
        │                      │── subscribe ────────►│
        │                      │   user.bob.messages  │
        │                      │                      │
        │                      │◄── msg_1 ───────────│  ┐
        │◄══ WS: new_message ═│                      │  │
        │                      │◄── msg_2 ───────────│  ├─ queue drains
        │◄══ WS: new_message ═│                      │  │  one by one
        │                      │◄── msg_3 ───────────│  │
        │◄══ WS: new_message ═│                      │  ┘
        │                      │                      │
        │                      │   queue: user.bob.messages
        │                      │   [ EMPTY — all consumed ]
        │                      │                      │
  [Bob's client auto-sends     │                      │
   delivered acks for all]     │                      │
        │                      │                      │
        │══ WS: delivered ════►│                      │
        │  {msgIds:            │                      │
        │   [msg_1,msg_2,msg_3]}                      │
        │                      │                      │
        │                      │── UPDATE all 3 ────► PostgreSQL
        │                      │   status='delivered'
        │                      │                      │
        │                      │══ WS to Alice: ═══════════════► Alice
        │                      │  status_update
        │                      │  msg_1: delivered ✓✓
        │                      │  msg_2: delivered ✓✓
        │                      │  msg_3: delivered ✓✓
        │                      │
        │                      │              Alice's UI updates:
        │                      │              ┌──────────────┐
        │                      │              │ Hey Bob! ✓✓  │
        │                      │              │ You there?✓✓ │
        │                      │              │ Hello??  ✓✓  │
        │                      │              └──────────────┘
```

---

## How RabbitMQ Consumer Attach/Detach Works

The WS server is always running, but it **dynamically attaches and detaches RabbitMQ consumers** based on who is currently online.

```
RabbitMQ Broker
┌─────────────────────────────────────────────────┐
│                                                 │
│   queue: user.alice.messages  → [msg3, msg2]    │  ← Messages accumulate
│   queue: user.bob.messages    → [msg1]          │     when no consumer
│   queue: user.charlie.messages→ []              │     is attached
│                                                 │
└─────────────────────────────────────────────────┘
```

**Pseudocode logic:**

```js
wsServer.on('connection', (socket, user) => {
    // User online → START consuming their RabbitMQ queue
    const consumer = rabbitMQ.consume(`user.${user.id}.messages`, (msg) => {
        socket.emit('new_message', msg)
        db.updateStatus(msg.id, 'delivered')
        notifySender(msg.senderId, msg.id, 'delivered')
    })

    socket.on('disconnect', () => {
        // User offline → STOP consuming their queue
        rabbitMQ.cancel(consumer)
        // Messages pile up until next reconnect
    })
})
```

---

## With vs Without RabbitMQ

### Side-by-Side Flow Comparison

```
══════════════════════════════════════════════════════════
                WITHOUT RabbitMQ
══════════════════════════════════════════════════════════

  Alice ──► WS Server ──► DB (save)
                      │
                      ├── Bob online? YES → push via WS → done
                      │
                      └── Bob online? NO  → message sits in DB
                                             │
                         [Bob reconnects] ───┘
                                             │
                         WS Server ──► DB: "give me Bob's
                                           undelivered msgs"
                         DB ──► WS Server ──► Bob


══════════════════════════════════════════════════════════
                WITH RabbitMQ
══════════════════════════════════════════════════════════

  Alice ──► WS Server ──► DB (save)
                      │
                      └──► RabbitMQ (publish to Bob's queue)
                                    │
                          Bob online? (consumer attached)
                                    │
                             YES ───┴──► push via WS → done
                             NO  ────── message waits in queue
                                             │
                         [Bob reconnects] ───┘
                                             │
                         WS Server subscribes to queue
                         RabbitMQ PUSHES messages ──► Bob
                         (no DB query needed)
```

### When Does RabbitMQ Matter?

**Scenario 1: Single Server, 100 Users — No real difference**

```
Without RabbitMQ:  Works fine ✓
With RabbitMQ:     Works fine ✓ (but extra complexity)
Verdict: RabbitMQ is overkill
```

**Scenario 2: Multiple Server Instances — RabbitMQ Wins**

```
WITHOUT RabbitMQ:
                                 ┌─────────────────┐
                          ┌─────►│ WS Server 1     │  Alice is here
┌──────────────┐          │      │ (knows Alice)    │
│ Load Balancer│──────────┤      └─────────────────┘
└──────────────┘          │      ┌─────────────────┐
                          └─────►│ WS Server 2     │  Bob is here
                                 │ (knows Bob)      │
                                 └─────────────────┘

  PROBLEM: Server 1 doesn't know Bob is on Server 2.
  SOLUTION: Need Redis Pub/Sub — you're building a broker yourself.


WITH RabbitMQ:
                                 ┌─────────────────┐
                          ┌─────►│ WS Server 1     │  Alice is here
┌──────────────┐          │      │                  │
│ Load Balancer│──────────┤      └────────┬────────┘
└──────────────┘          │               │ publish to user.bob.messages
                          │               ▼
                          │      ┌─────────────────┐
                          │      │    RabbitMQ      │
                          │      └────────┬────────┘
                          │               │ consumer on Server 2
                          │               ▼
                          │      ┌─────────────────┐
                          └─────►│ WS Server 2     │  Bob is here
                                 └─────────────────┘

  Servers don't need to know about each other.
```

**Scenario 3: Burst Reconnections — DB under load**

```
WITHOUT RabbitMQ:
  1000 users reconnect → 1000 DB queries simultaneously → DB stressed

WITH RabbitMQ:
  1000 users reconnect → 1000 queue subscriptions → RabbitMQ drains at its pace
  DB only hit for status UPDATEs (can be batched)
```

**Scenario 4: Server Crashes Mid-Delivery**

```
WITHOUT RabbitMQ:
  Server crashes → need background job to retry stuck "sent" messages
  You're building a queue system on top of your DB.

WITH RabbitMQ:
  Server crashes → message still in durable queue → auto-delivered on restart
  No extra code needed.
```

### Comparison Table

| Concern | Without RabbitMQ | With RabbitMQ |
|---------|-----------------|---------------|
| Offline delivery | DB query on reconnect | Queue auto-drains on reconnect |
| Multiple servers | Need Redis Pub/Sub | Works natively |
| Server crash recovery | Need background job | Queue persists, auto-retry |
| Burst reconnections | DB gets hammered | RabbitMQ absorbs the load |
| Complexity | Simpler to start | Extra infrastructure |
| Infrastructure | Just DB + WS server | DB + WS + RabbitMQ |
| Best for | Small apps, MVPs, <1000 users | Production, scale, reliability |

---

## Kafka vs RabbitMQ

### Fundamental Difference

```
RabbitMQ = Smart Broker, Dumb Consumer
"I'll route your message to the right queue and delete it once consumed"

Kafka = Dumb Broker, Smart Consumer
"I'll store everything in a log. You figure out what you've already read"
```

### How They Work Internally

**RabbitMQ — Message Queue:**

```
Producer ──► Exchange ──► Queue ──► Consumer

  msg1 is DELETED from queue after Bob consumes it.
  Gone forever. Can't re-read.
```

**Kafka — Distributed Log:**

```
Producer ──► Topic (Partition) ──► Consumer reads at offset

  topic: "chat-messages"
  ┌──────┬──────┬──────┬──────┬──────┬──────┐
  │ msg0 │ msg1 │ msg2 │ msg3 │ msg4 │ msg5 │
  └──────┴──────┴──────┴──────┴──────┴──────┘
  offset: 0      1      2      3      4      5
                               ▲
                        Consumer (Bob)
                        "I last read offset 2,
                         give me from offset 3"

  msg3 is STILL THERE after Bob reads it. Nothing deleted.
  Bob's offset moves to 4. That's it.
  Messages stay for days/weeks (configurable retention).
```

### The Real-World Analogy

```
RabbitMQ = Post Office

  You write a letter addressed to Bob.
  Post office routes it to Bob's mailbox.
  Bob picks it up → letter is gone from the system.
  Nobody else can read that letter.

Kafka = Newspaper

  Something happens → it gets published in today's paper.
  EVERYONE can read it. 1 reader or 10,000 readers.
  The paper doesn't disappear after someone reads it.
  You can go back and read last week's paper too.
```

### Same Chat App — Kafka vs RabbitMQ

**RabbitMQ: Natural fit for direct messaging**

```
queue: user.bob     → ["Hey Bob"]
Bob's consumer picks it up → message GONE. Simple. Direct.
```

**Kafka: Awkward for direct messaging**

```
topic: chat-messages
┌────────┬────────┬────────┬────────┬────────┐
│ A→B    │ C→D    │ B→A    │ A→B    │ E→F    │
│"Hey    │"hello" │"Hi     │"What's │"sup"   │
│ Bob"   │        │ Alice" │ up?"   │        │
└────────┴────────┴────────┴────────┴────────┘

ALL messages from ALL users in the same stream.
Bob must filter: "give me only msgs WHERE to=bob"
Bob is reading ALL messages just to find his own.
```

### Comparison Table

| Concern | RabbitMQ | Kafka |
|---------|---------|-------|
| "Send msg to Bob" | Publish to Bob's queue. Done. ✓ | Publish to topic, Bob filters. ✗ |
| Offline delivery | Queue holds msgs until consumed ✓ | Consumer resumes at last offset ✓ |
| Delete after read | Yes, automatic ✓ | No, must wait for retention ✗ |
| 1:1 routing | Native. Built for this. ✓ | Awkward. Must partition by user ✗ |
| Latency | ~1ms ✓ | ~5-10ms (batching) ✗ |
| Chat history from broker | Can't. Messages deleted after ack ✗ | Can. Replay from any offset ✓ |
| 10,000 users | 10,000 queues. Fine. ✓ | A few partitions. Fine. ✓ |
| 10M users | 10M queues. Struggle. ✗ | Few hundred partitions. ✓ |
| Infrastructure | Single binary. Simple. ✓ | ZooKeeper/KRaft + brokers. Heavy. ✗ |
| Throughput | ~50K msgs/sec | Millions of msgs/sec |
| Best for chat? | YES ✓ (up to ~100K users) | Overkill ✗ (unless WhatsApp scale) |

### When Companies Use Kafka in Chat

Large companies use Kafka **alongside** RabbitMQ, not instead of it:

```
Alice sends "Hey Bob"
     │
     ▼
┌──────────┐     ┌───────────┐
│ WS Server│────►│ RabbitMQ  │──► Bob (real-time delivery)
└────┬─────┘     └───────────┘
     │
     │ also publish event
     ▼
┌──────────┐
│  Kafka   │──► Analytics ("msgs per hour" dashboard)
│  (event  │──► Search indexing (make msgs searchable)
│   log)   │──► ML pipeline (spam/abuse detection)
│          │──► Compliance (audit log, legal holds)
│          │──► Push notification service
└──────────┘

Kafka is NOT delivering the chat message to Bob.
Kafka is broadcasting the EVENT "a message was sent"
to many downstream services that each care about it.
```

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│                        PostgreSQL                            │
│                                                              │
│  ┌─────────────┐       ┌──────────────────────────────────┐ │
│  │   users      │       │           messages                │ │
│  ├─────────────┤       ├──────────────────────────────────┤ │
│  │ id (PK)     │───┐   │ id (PK)                          │ │
│  │ email       │   │   │ conversation_id (FK)             │ │
│  │ name        │   ├──►│ sender_id (FK → users)           │ │
│  │ password    │   ├──►│ receiver_id (FK → users)         │ │
│  │ avatar_url  │   │   │ content                          │ │
│  │ created_at  │   │   │ status (sent|delivered|read)     │ │
│  └─────────────┘   │   │ created_at                       │ │
│                     │   │ delivered_at (nullable)          │ │
│  ┌──────────────┐   │   │ read_at (nullable)              │ │
│  │conversations │   │   └──────────────────────────────────┘ │
│  ├──────────────┤   │                                        │
│  │ id (PK)      │   │                                        │
│  │ user1_id(FK)─┼───┘                                        │
│  │ user2_id(FK)─┼───┘                                        │
│  │ last_msg_at  │                                            │
│  │ created_at   │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities Summary

| Component | Responsibility |
|-----------|---------------|
| Next.js | UI rendering, login pages, REST APIs for chat history |
| WebSocket Server | Real-time message relay, status updates, manages online/offline state, attaches/detaches RabbitMQ consumers |
| RabbitMQ | Message buffer for offline users, per-user queues, guaranteed delivery, decouples sender from receiver |
| PostgreSQL | Permanent storage: users, conversations, messages with status + timestamps, chat history on login |

---

## Key Takeaways

1. **WebSockets** handle the "show it instantly" problem
2. **RabbitMQ** handles the "what if the user is offline" problem
3. **PostgreSQL** handles the "show me my old chats" problem
4. The tick system is just status state transitions (`sent` → `delivered` → `read`) triggered by client acknowledgments
5. Use **RabbitMQ for direct delivery**, **Kafka for event fan-out** to multiple services
6. For most chat apps (<100K users), RabbitMQ + PostgreSQL + WebSocket is the sweet spot
