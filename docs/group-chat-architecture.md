# Group Chat Feature — Architecture & System Component Diagrams

This document describes the architecture for the group chat feature being added to the existing 1:1 messaging system. The design extends the current stack (Next.js, Express, Socket.IO, RabbitMQ, PostgreSQL) without replacing any infrastructure.

---

## 1. High-Level System Architecture

```
                       GROUP CHAT — HIGH-LEVEL SYSTEM ARCHITECTURE

  ┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
  │   Alice's Browser    │         │    Bob's Browser     │         │  Charlie's Browser   │
  │                      │         │                      │         │                      │
  │  Next.js Frontend    │         │   Next.js Frontend   │         │   Next.js Frontend   │
  │   (port 5000)        │         │    (port 5000)       │         │    (port 5000)       │
  │                      │         │                      │         │                      │
  │  - Chat Sidebar      │         │  - Chat Sidebar      │         │  - Chat Sidebar      │
  │  - Group Chat View   │         │  - Group Chat View   │         │  - Group Chat View   │
  │  - Create Group UI   │         │  - Create Group UI   │         │  - Create Group UI   │
  └──────────┬───────────┘         └──────────┬───────────┘         └──────────┬───────────┘
             │                                │                                │
             │ HTTPS REST  + WSS              │ HTTPS REST + WSS               │ HTTPS REST + WSS
             │ (cookies: httpOnly)            │ (cookies: httpOnly)            │ (cookies: httpOnly)
             │                                │                                │
             └────────────────┬───────────────┴────────────────┬───────────────┘
                              │                                │
                              ▼                                ▼
                  ┌─────────────────────────────────────────────────────┐
                  │              Express Backend  (port 4000)            │
                  │                                                      │
                  │  ┌────────────────────┐    ┌────────────────────┐   │
                  │  │   REST API Layer   │    │  Socket.IO Layer   │   │
                  │  │                    │    │                    │   │
                  │  │  /api/auth/*       │    │  send_group_msg    │   │
                  │  │  /api/users        │    │  new_group_msg     │   │
                  │  │  /api/conversations│    │  group_added       │   │
                  │  │  /api/messages     │    │  send_message      │   │
                  │  │  /api/groups       │◄───┤  new_message       │   │
                  │  │  /api/groups/.../  │    │  message_ack       │   │
                  │  │  members           │    │  status_update     │   │
                  │  │  messages          │    │                    │   │
                  │  └────────┬───────────┘    └─────────┬──────────┘   │
                  │           │                          │              │
                  │           │                          │              │
                  │  ┌────────▼──────────────────────────▼──────────┐  │
                  │  │         Service Layer                         │  │
                  │  │                                                │  │
                  │  │  - Group Service (CRUD + membership)           │  │
                  │  │  - Message Service (1:1 + group)               │  │
                  │  │  - RabbitMQ Service (bind/unbind/publish)      │  │
                  │  │  - Auth Service (JWT in httpOnly cookies)      │  │
                  │  └───────┬──────────────────────────┬─────────────┘  │
                  └─────────│──────────────────────────│─────────────────┘
                            │                          │
                ┌───────────▼─────────────┐  ┌─────────▼──────────────┐
                │    PostgreSQL           │  │    RabbitMQ Broker      │
                │    (port 5432)          │  │    (port 5672 / 15672)  │
                │                         │  │                         │
                │  Tables:                │  │  Exchanges:             │
                │   • users               │  │   • chat.direct         │
                │   • conversations       │  │   • chat.group  (NEW)   │
                │   • messages            │  │                         │
                │   • groups       (NEW)  │  │  Queues (per user):     │
                │   • group_members(NEW)  │  │   • user.alice.messages │
                │   • group_messages(NEW) │  │   • user.bob.messages   │
                │                         │  │   • user.charlie.msgs   │
                │  (source of truth for   │  │                         │
                │   chat history, group   │  │  (durable delivery      │
                │   membership)           │  │   layer with bindings)  │
                └─────────────────────────┘  └─────────────────────────┘

                  Legend:
                    ─── synchronous call           ═══ persistent connection
                    NEW additions for group chat   ▼ data flow direction
```

---

## 2. RabbitMQ Topology — Two Exchanges, One Queue per User

```
              RABBITMQ TOPOLOGY (3 USERS: ALICE, BOB, CHARLIE)
              Alice and Bob in group "Team", Alice and Charlie in group "Devs"

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                          RabbitMQ Broker                                   │
  │                                                                            │
  │  ┌──────────────────────────────┐    ┌──────────────────────────────┐    │
  │  │   chat.direct                │    │   chat.group  (NEW)          │    │
  │  │   type: direct, durable      │    │   type: direct, durable      │    │
  │  └────┬──────────┬──────────┬──┘    └────┬──────────┬──────────┬──┘    │
  │       │          │          │             │          │          │       │
  │   key:│      key:│      key:│        key: │      key:│      key:│       │
  │ alice-id    bob-id    charlie-id   group.team   group.team   group.devs  │
  │       │          │          │        + group.devs    │          │       │
  │       ▼          ▼          ▼             ▼          ▼          ▼       │
  │  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐ │
  │  │ user.alice.messages   │ │  user.bob.messages    │ │ user.charlie. │ │
  │  │                       │ │                       │ │  messages     │ │
  │  │ Bound to:             │ │ Bound to:             │ │ Bound to:     │ │
  │  │  chat.direct → alice  │ │  chat.direct → bob    │ │ chat.direct → │ │
  │  │  chat.group  → team   │ │  chat.group  → team   │ │   charlie     │ │
  │  │  chat.group  → devs   │ │                       │ │ chat.group →  │ │
  │  │                       │ │                       │ │   devs        │ │
  │  │ [durable, persistent] │ │ [durable, persistent] │ │ [durable]     │ │
  │  └───────────┬───────────┘ └───────────┬───────────┘ └──────┬────────┘ │
  └──────────────│─────────────────────────│─────────────────────│──────────┘
                 │ consumer attached       │ consumer attached    │ consumer
                 │ (when Alice online)     │ (when Bob online)    │ when online
                 ▼                         ▼                       ▼
            Alice's WS                 Bob's WS               Charlie's WS

  Key insight:
   • One queue per user — same as 1:1 design.
   • One queue has MULTIPLE bindings — one per "channel" the user listens to.
   • Two exchanges enforce semantic separation (direct vs group traffic).
   • Direct exchange routes by exact key match → with multiple bound queues
     for the same key, all of them receive a copy (broadcast within group).
```

---

## 3. Frontend Component Diagram

```
                       FRONTEND COMPONENT DIAGRAM (Next.js)

  ┌─────────────────────────────────────────────────────────────────────┐
  │                         /chat (ChatPage)                            │
  │                                                                     │
  │   state:                                                            │
  │   ├── currentUser            (from /api/auth/me)                    │
  │   ├── conversations          (1:1)                                  │
  │   ├── groups          (NEW)                                         │
  │   ├── users                  (for starting new chats / groups)      │
  │   ├── activeChat             { type: 'direct'|'group', id }   (NEW) │
  │   └── messages               (1:1 or group, depending on active)    │
  │                                                                     │
  │   hooks:                                                            │
  │   ├── useSocket()            (websocket + cookie auth)              │
  │   └── useRouter()                                                   │
  │                                                                     │
  │   socket listeners:                                                 │
  │   ├── message_ack            (for both direct & group, by tempId)   │
  │   ├── new_message            (1:1)                                  │
  │   ├── new_group_message      (NEW)                                  │
  │   ├── status_update          (1:1 ticks)                            │
  │   └── group_added            (NEW — added to a group while online)  │
  │                                                                     │
  │   ┌─────────────────────┐    ┌─────────────────────────────────┐    │
  │   │   ChatSidebar       │    │   Right Pane (conditional)      │    │
  │   │                     │    │                                 │    │
  │   │   ┌─────────────┐   │    │   if activeChat.type=='group':  │    │
  │   │   │ Header      │   │    │   ┌───────────────────────┐     │    │
  │   │   │  + Logout   │   │    │   │  Group Chat Header    │     │    │
  │   │   │  + Name     │   │    │   │  (name, member count) │     │    │
  │   │   │  + New Group│NEW│    │   ├───────────────────────┤     │    │
  │   │   └─────────────┘   │    │   │  Messages Area        │     │    │
  │   │   ┌─────────────┐   │    │   │   <GroupMessageBubble │     │    │
  │   │   │ Groups list │NEW│    │   │    sender="Bob"       │NEW  │    │
  │   │   │  - Team     │   │    │   │    content="Hi" />    │     │    │
  │   │   │  - Devs     │   │    │   ├───────────────────────┤     │    │
  │   │   └─────────────┘   │    │   │  <MessageInput />     │     │    │
  │   │   ┌─────────────┐   │    │   └───────────────────────┘     │    │
  │   │   │ Direct list │   │    │                                 │    │
  │   │   │  - Bob      │   │    │   else if type=='direct':       │    │
  │   │   │  - Charlie  │   │    │   ┌───────────────────────┐     │    │
  │   │   └─────────────┘   │    │   │  Direct Chat Header   │     │    │
  │   │   ┌─────────────┐   │    │   │   (other user name)   │     │    │
  │   │   │ Start chat: │   │    │   ├───────────────────────┤     │    │
  │   │   │  - Dave     │   │    │   │   <MessageBubble      │     │    │
  │   │   │  - Eve      │   │    │   │    + <TickIcon /> />  │     │    │
  │   │   └─────────────┘   │    │   ├───────────────────────┤     │    │
  │   │                     │    │   │  <MessageInput />     │     │    │
  │   └─────────────────────┘    │   └───────────────────────┘     │    │
  │                              └─────────────────────────────────┘    │
  │                                                                     │
  │   modals (rendered conditionally):                                  │
  │   └── <CreateGroupModal />   (NEW — name + multi-select users)      │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘

  NEW components introduced:
   • CreateGroupModal.tsx        — modal for creating a group
   • GroupMessageBubble.tsx      — bubble with sender name, no tick icons
   • Updated ChatSidebar.tsx     — Groups section + "New Group" button
   • Updated chat/page.tsx       — activeChat discriminated union + new
                                   socket event handlers
```

---

## 4. Server Component Diagram (Express + Services)

```
                       SERVER COMPONENT DIAGRAM (Express + Services)

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                       Express Application (index.ts)                     │
  │                                                                          │
  │   middleware: cors(credentials:true) → cookieParser → express.json       │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐    │
  │  │                       Route Handlers                             │    │
  │  │                                                                  │    │
  │  │  /api/auth/*            routes/auth.ts                           │    │
  │  │   - POST /signup, /login, /logout                                │    │
  │  │   - GET  /me                                                     │    │
  │  │                                                                  │    │
  │  │  /api/users             routes/users.ts                          │    │
  │  │   - GET /                                                        │    │
  │  │                                                                  │    │
  │  │  /api/conversations     routes/conversations.ts                  │    │
  │  │   - GET /, POST /                                                │    │
  │  │                                                                  │    │
  │  │  /api/messages          routes/messages.ts                       │    │
  │  │   - GET /:conversationId                                         │    │
  │  │                                                                  │    │
  │  │  /api/groups       NEW  routes/groups.ts                         │    │
  │  │   - POST   /                  → create group                     │    │
  │  │   - GET    /                  → list user's groups               │    │
  │  │   - GET    /:id               → group details                    │    │
  │  │   - POST   /:id/members       → add member                       │    │
  │  │   - DELETE /:id/members/:uid  → remove member                    │    │
  │  │   - GET    /:id/messages      → paginated history                │    │
  │  └──────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐    │
  │  │                    Socket.IO Handler (services/socket.ts)        │    │
  │  │                                                                  │    │
  │  │   io.use(cookieAuthMiddleware)  ← JWT extracted from cookie      │    │
  │  │                                                                  │    │
  │  │   on connection:                                                 │    │
  │  │     - track in onlineUsers Map                                   │    │
  │  │     - rabbitmqService.startConsuming(userId, dispatch)           │    │
  │  │                                                                  │    │
  │  │   dispatch(msg)        — consumer callback (UPDATED)             │    │
  │  │     if msg.type === 'group':                                     │    │
  │  │       if msg.senderId === userId: return       (echo filter)     │    │
  │  │       socket.emit('new_group_message', msg)                      │    │
  │  │     else:                                                        │    │
  │  │       socket.emit('new_message', msg)                            │    │
  │  │                                                                  │    │
  │  │   event handlers:                                                │    │
  │  │     - send_message         (1:1, existing — tagged type:direct)  │    │
  │  │     - message_delivered    (1:1, existing)                       │    │
  │  │     - message_read         (1:1, existing)                       │    │
  │  │     - send_group_message   NEW                                   │    │
  │  │                                                                  │    │
  │  │   on disconnect:                                                 │    │
  │  │     - remove from onlineUsers                                    │    │
  │  │     - rabbitmqService.stopConsuming(userId)                      │    │
  │  └──────────────────────────────────────────────────────────────────┘    │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐    │
  │  │                       Services                                   │    │
  │  │                                                                  │    │
  │  │  RabbitMQService (services/rabbitmq.ts)                          │    │
  │  │   - connect()                  assert chat.direct + chat.group   │    │
  │  │   - ensureUserQueue(userId)                                      │    │
  │  │   - publishToUser(userId, msg)         → chat.direct             │    │
  │  │   - bindUserToGroup(uid, gid)    NEW   → chat.group              │    │
  │  │   - unbindUserFromGroup(uid, gid) NEW  → chat.group              │    │
  │  │   - publishToGroup(gid, msg)     NEW   → chat.group              │    │
  │  │   - startConsuming(userId, cb)         → user's queue            │    │
  │  │   - stopConsuming(userId)                                        │    │
  │  │                                                                  │    │
  │  │  Prisma Client (lib/prisma.ts)                                   │    │
  │  │   - singleton, used by routes and socket handlers                │    │
  │  └──────────────────────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Model (ER Diagram)

```
                        DATA MODEL — PRISMA / POSTGRESQL

  ┌─────────────────────────┐
  │       users             │
  ├─────────────────────────┤
  │ id            PK uuid   │
  │ email         unique    │
  │ name                    │
  │ password                │
  │ created_at              │
  └────┬────────┬───────────┘
       │        │
       │        │ (one-to-many — various relations)
       │        │
       │        ├─── sent_messages         (existing, Message.senderId)
       │        ├─── received_messages     (existing, Message.receiverId)
       │        ├─── conversations1        (existing, Conversation.user1Id)
       │        ├─── conversations2        (existing, Conversation.user2Id)
       │        │
       │        ├─── group_memberships          NEW   GroupMember.userId
       │        ├─── created_groups             NEW   Group.createdBy
       │        └─── sent_group_messages        NEW   GroupMessage.senderId
       │
       │
  ┌────▼──────────────────────┐     ┌────────────────────────────┐
  │  conversations  (1:1)     │     │  groups          NEW       │
  ├───────────────────────────┤     ├────────────────────────────┤
  │ id            PK uuid     │     │ id            PK uuid      │
  │ user1_id      FK→users    │     │ name                       │
  │ user2_id      FK→users    │     │ created_by    FK→users     │
  │ last_msg_at                     │ created_at                 │
  │ created_at                │     └───────┬────────────────────┘
  │ UNIQUE(user1_id, user2_id)│             │
  └─────┬─────────────────────┘             │ 1
        │ 1                                 │ ├─ many group_members
        │                                   │ └─ many group_messages
        │ many                              │
        ▼                                   │
  ┌───────────────────────────┐             │
  │  messages  (1:1)          │             │
  ├───────────────────────────┤   ┌─────────▼──────────────────┐   ┌──────────────────────────┐
  │ id              PK uuid   │   │  group_members      NEW    │   │  group_messages    NEW   │
  │ conversation_id FK        │   ├────────────────────────────┤   ├──────────────────────────┤
  │ sender_id       FK→users  │   │ id            PK uuid      │   │ id            PK uuid    │
  │ receiver_id     FK→users  │   │ group_id      FK→groups    │   │ group_id      FK→groups  │
  │ content                   │   │ user_id       FK→users     │   │ sender_id     FK→users   │
  │ status   ENUM SENT|       │   │ joined_at                  │   │ content                  │
  │   DELIVERED|READ          │   │ UNIQUE(group_id,user_id)   │   │ created_at               │
  │ created_at                │   │ INDEX(user_id)             │   │ INDEX(group_id,created)  │
  │ delivered_at, read_at     │   └────────────────────────────┘   └──────────────────────────┘
  │ INDEX(conv,created)       │
  │ INDEX(receiver,status)    │
  └───────────────────────────┘

  NEW tables for group chat — kept SEPARATE from Message because group
  messages have no delivery/read tracking. Forcing them into one table
  would mean nullable receiver_id, status, delivered_at, read_at columns.
```

---

## 6. Sequence Diagram — Group Message Flow (All Members Online)

```
                  SEQUENCE: Alice sends "Hi team" in group "Team"
                  Members: Alice, Bob, Charlie — all online

  Alice    Alice's     Express          PostgreSQL    RabbitMQ        Bob/Charlie
   UI      Socket      Server                         Broker          Socket
   │         │           │                  │            │              │
   │ types   │           │                  │            │              │
   │"Hi team"│           │                  │            │              │
   │────────►│           │                  │            │              │
   │         │           │                  │            │              │
   │ optimistic UI:      │                  │            │              │
   │ shows message       │                  │            │              │
   │ instantly with      │                  │            │              │
   │ tempId              │                  │            │              │
   │         │           │                  │            │              │
   │         │  send_group_message          │            │              │
   │         │ ─────────►│                  │            │              │
   │         │  {groupId, content, tempId}  │            │              │
   │         │           │                  │            │              │
   │         │           │ INSERT GroupMessage           │              │
   │         │           │ ────────────────►│            │              │
   │         │           │◄─ {id, createdAt}│            │              │
   │         │           │                  │            │              │
   │         │ message_ack                  │            │              │
   │         │◄──────────│                  │            │              │
   │         │ {tempId,  │                  │            │              │
   │         │  messageId,                  │            │              │
   │         │  createdAt}                  │            │              │
   │         │           │                  │            │              │
   │ replace │           │                  │            │              │
   │ tempId  │           │                  │            │              │
   │ with    │           │                  │            │              │
   │ real id │           │                  │            │              │
   │         │           │                  │            │              │
   │         │           │ publish to chat.group         │              │
   │         │           │ routing key = group.team-id   │              │
   │         │           │ ─────────────────────────────►│              │
   │         │           │ payload: { type:'group',      │              │
   │         │           │   messageId, groupId,         │              │
   │         │           │   senderId, senderName,       │              │
   │         │           │   content, createdAt }        │              │
   │         │           │                  │            │              │
   │         │           │                  │            │ broker fans out
   │         │           │                  │            │ to all 3 queues
   │         │           │                  │            │ (alice, bob,  
   │         │           │                  │            │  charlie)     
   │         │           │                  │            │              │
   │         │           │                  │            │  delivers to  
   │         │           │ consumer(alice)  │            │  alice's queue
   │         │           │◄─────────────────────────────│              │
   │         │           │                  │            │              │
   │         │           │ check: senderId==alice → YES  │              │
   │         │           │ ack(msg) and skip (echo)      │              │
   │         │           │                  │            │              │
   │         │           │                  │            │              │
   │         │           │                  │            │  delivers to  │
   │         │           │ consumer(bob/charlie)         │  bob & charlie│
   │         │           │◄─────────────────────────────│  queues       │
   │         │           │                  │            │              │
   │         │           │ check: senderId!=self         │              │
   │         │           │ emit('new_group_message',...) │              │
   │         │           │ ─────────────────────────────────────────►   │
   │         │           │                  │            │              │
   │         │           │                  │            │              │
   │         │           │                  │            │              ▼
   │         │           │                  │            │   Bob & Charlie's UIs
   │         │           │                  │            │   show message with
   │         │           │                  │            │   "Alice" as sender
```

---

## 7. Sequence Diagram — Offline Delivery for Groups

```
                  SEQUENCE: Charlie is OFFLINE, Alice sends to group

  Alice's    Express    RabbitMQ         Charlie's    Charlie's
  UI/Socket  Server     Broker           Queue        Socket
                                         (in broker)
     │          │           │                │            ✗ OFFLINE
     │  Alice sends msg 1    │                │
     │ ────────►│           │                │
     │          │           │                │
     │          │ INSERT to GroupMessage     │
     │          │ publish to chat.group      │
     │          │ ─────────►│                │
     │          │           │   route to     │
     │          │           │   charlie's    │
     │          │           │ ──────────────►│  msg 1 stored
     │          │           │                │  (durable, persistent)
     │          │           │                │
     │  Alice sends msg 2    │                │
     │ ────────►│           │                │
     │          │ ─────────►│ ──────────────►│  msg 2 stored
     │          │           │                │
     │  Alice sends msg 3    │                │
     │ ────────►│           │                │
     │          │ ─────────►│ ──────────────►│  msg 3 stored
     │          │           │                │
     │                                        │  [msg1, msg2, msg3]
     │                                        │  no consumer attached
     │                                        │
     │                                        │
     │                          Charlie comes online   │
     │                                       │         │
     │                                       │  ◄──────│  WS connect
     │                                       │         │  (cookie auth)
     │                                       │         │
     │                       Express starts consumer   │
     │                                       │         │
     │                       drains queue:   │         │
     │                       msg 1 ────────────────────►│
     │                       msg 2 ────────────────────►│
     │                       msg 3 ────────────────────►│
     │                                       │         │
     │                                       │         │
     │                                       │  Charlie sees all 3
     │                                       │  messages in order
     │                                       │
     │                                       │  queue is now empty
```

---

## 8. Group Lifecycle — Bindings as Membership

```
                  GROUP MEMBERSHIP = RABBITMQ BINDING STATE

  Step 1: Alice creates group "Team" with [Bob, Charlie]
  ────────────────────────────────────────────────────────

       POST /api/groups { name:"Team", memberIds:[bob, charlie] }
                          │
                          ▼
       1. INSERT INTO groups (Alice as creator)
       2. INSERT INTO group_members (Alice, Bob, Charlie)
       3. For each member:
            ensureUserQueue(member.id)
            bindQueue(user.<id>.messages, chat.group, 'group.team-id')
       4. Emit 'group_added' to each online member's socket

  After Step 1 — Binding Table in chat.group:
       group.team-id  →  user.alice.messages
       group.team-id  →  user.bob.messages
       group.team-id  →  user.charlie.messages


  Step 2: Add Dave to the group later
  ─────────────────────────────────────

       POST /api/groups/team-id/members { userId: dave }
                          │
                          ▼
       1. INSERT INTO group_members (Dave)
       2. ensureUserQueue(dave.id)
       3. bindQueue(user.dave.messages, chat.group, 'group.team-id')
       4. Emit 'group_added' to Dave's socket

  After Step 2 — Binding Table in chat.group:
       group.team-id  →  user.alice.messages
       group.team-id  →  user.bob.messages
       group.team-id  →  user.charlie.messages
       group.team-id  →  user.dave.messages       ← NEW row


  Step 3: Charlie leaves the group
  ─────────────────────────────────────

       DELETE /api/groups/team-id/members/charlie-id
                          │
                          ▼
       1. DELETE FROM group_members WHERE user=charlie
       2. unbindQueue(user.charlie.messages, chat.group, 'group.team-id')

  After Step 3 — Binding Table in chat.group:
       group.team-id  →  user.alice.messages
       group.team-id  →  user.bob.messages
       group.team-id  →  user.dave.messages
       (Charlie's binding removed → he won't receive future messages)


  KEY INSIGHT: Group membership is REIFIED as RabbitMQ binding state.
   • DB has the canonical record (group_members table)
   • Bindings are the runtime routing rules
   • Both must stay in sync — server is responsible for both
```

---

## 9. Component Responsibility Summary

```
  ┌────────────────────┬──────────────────────────────────────────────────────┐
  │ Component          │ Responsibility                                       │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ Next.js (client)   │ UI rendering, group/chat selection, optimistic UI,   │
  │                    │ WebSocket event handling, REST calls via cookies     │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ Express REST API   │ Group CRUD, membership management, chat history      │
  │                    │ pagination, auth gating via cookie + JWT             │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ Socket.IO          │ Real-time message relay, send/receive group msgs,    │
  │                    │ trigger RabbitMQ consumer lifecycle per user         │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ RabbitMQ           │ Fan-out group messages to all member queues,         │
  │   chat.group       │ Hold messages for offline members,                   │
  │                    │ Bindings reflect current group membership            │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ RabbitMQ           │ Direct 1:1 message routing (unchanged)               │
  │   chat.direct      │                                                      │
  ├────────────────────┼──────────────────────────────────────────────────────┤
  │ PostgreSQL         │ Canonical source of truth: users, groups, members,   │
  │                    │ messages (1:1), group_messages, chat history         │
  └────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 10. Why This Design Wins

```
✓ Reuses existing per-user queue model
   → One consumer per user handles BOTH 1:1 and group messages
   
✓ One new exchange (not one per group)
   → chat.group is a single shared direct exchange for all groups
   
✓ Offline delivery is automatic
   → Same durable-queue + bound-key mechanism that already works for 1:1
   
✓ Group membership = binding state
   → Adding a member = adding a binding row
   → Removing a member = removing a binding row
   → No "subscription database" needed
   
✓ Bindings persist across broker restarts
   → No re-bind on user reconnect, no startup-time membership sync
   
✓ Separation of concerns
   → chat.direct for 1:1 traffic, chat.group for group traffic
   → Independent policies, monitoring, and future evolution possible
   
✓ Sender echo handled cleanly
   → Broker fans out to ALL members including sender
   → Consumer filters own messages
   → Optimistic ack gives instant sender feedback
   → No duplicate display
```

---

## Related Documents

- [Original 1:1 Chat Architecture Guide](./realtime-chat-architecture-guide.md)
- [Group Chat Implementation Plan](../../../.claude/plans/encapsulated-wandering-pebble.md)
