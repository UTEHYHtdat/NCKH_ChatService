# API và Socket Test cho ChaxBox_Service

## 1. Chuẩn bị

- Cài đặt dependencies:

  ```bash
  npm install
  ```

- Thiết lập biến môi trường trong `.env`:

  ```env
  DATABASE_URL="postgresql://user:password@host:port/dbname"
  AES_SECRET_KEY="your_aes_secret_key"
  FRONTEND_URL="http://localhost:3000"
  PORT=3000
  ```

- Khởi động server:
  ```bash
  npm run dev
  ```

> Nếu server chạy thành công, bạn sẽ thấy log `Server running...` hoặc `HTTP running on port ...`.

## 2. REST API

### 2.1. Lấy danh sách conversation của user

- Method: `GET`
- URL: `http://localhost:3000/conversations`
- Headers:
  - `Authorization: Bearer <token>`

#### Curl:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/conversations
```

#### Response mẫu:

```json
[
  {
    "id": 1,
    "conversation_type_id": 2,
    "conversation_name": "Nhóm học",
    "conversation_avatar": null,
    "created_by_id": 5,
    "last_message_at": "2026-06-30T...Z",
    "conversation_members": [
      {
        "user_id": 5,
        "role": "MEMBER",
        "nickname": null,
        "last_read_message_id": 12,
        "unread_count": 0
      }
    ],
    "users": {
      "id": 5,
      "username": "user1"
    },
    "conversation_types": {
      "id": 2,
      "type_code": "GROUP"
    },
    "lastMessage": {
      "id": 33,
      "conversation_id": 1,
      "content": "Xin chào",
      "sender_id": 5,
      "created_at": "2026-06-30T...Z",
      "users": {
        "id": 5,
        "username": "user1"
      }
    }
  }
]
```

### 2.2. Lấy tin nhắn trong conversation

- Method: `GET`
- URL: `http://localhost:3000/conversations/:id/messages`
- Query string tùy chọn: `?cursor=<messageId>`
- Headers:
  - `Authorization: Bearer <token>`

#### Curl:

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/conversations/1/messages?cursor=45"
```

#### Response mẫu:

```json
{
  "messages": [
    {
      "id": 35,
      "conversation_id": 1,
      "sender_id": 5,
      "message_type_id": 1,
      "content": "Hello",
      "created_at": "2026-06-30T...Z",
      "users": {
        "id": 5,
        "username": "user1"
      },
      "readStatus": [
        {
          "user_id": 5,
          "read_at": "2026-06-30T...Z"
        }
      ]
    }
  ],
  "nextCursor": null
}
```

### 2.3. Gửi tin nhắn qua HTTP

- Method: `POST`
- URL: `http://localhost:3000/conversations/:id/messages`
- Headers:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- Body:
  ```json
  {
    "content": "Nội dung tin nhắn"
  }
  ```

#### Curl:

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello mọi người"}' \
  http://localhost:3000/conversations/1/messages
```

#### Response mẫu:

```json
{
  "success": true,
  "message": {
    "id": 36,
    "conversation_id": 1,
    "sender_id": 5,
    "message_type_id": 1,
    "content": "Hello mọi người",
    "created_at": "2026-06-30T...Z",
    "users": {
      "id": 5,
      "username": "user1"
    }
  },
  "conversationId": 1
}
```

## 3. Socket.IO events

### 3.1. Kết nối socket

- URL socket: `http://localhost:3000`
- Kèm token:
  ```js
  const socket = io('http://localhost:3000', {
    auth: {
      token: '<token>',
    },
  });
  ```

### 3.2. Lấy danh sách conversation bằng socket

- Event: `getConversations`
- Payload: none
- Callback:
  ```js
  socket.emit('getConversations', null, (response) => {
    console.log(response);
  });
  ```

### 3.3. Lấy tin nhắn bằng socket

- Event: `getMessages`
- Payload:
  ```js
  {
    "conversationId": 1,
    "cursor": 45
  }
  ```
- Callback:
  ```js
  socket.emit(
    'getMessages',
    { conversationId: 1, cursor: null },
    (response) => {
      console.log(response);
    },
  );
  ```

### 3.4. Gửi tin nhắn bằng socket

- Event: `sendMessage`
- Payload:
  ```js
  {
    "conversationId": 1,
    "content": "Hello từ socket"
  }
  ```
- Callback:
  ```js
  socket.emit(
    'sendMessage',
    {
      conversationId: 1,
      content: 'Hello từ socket',
    },
    (response) => {
      console.log(response);
    },
  );
  ```
- Event nhận khi có tin nhắn mới:
  - `newMessage`
  ```js
  socket.on('newMessage', (payload) => {
    console.log('New message', payload);
  });
  ```

### 3.5. Typing indicators

- Start typing:
  ```js
  socket.emit('typingStart', { conversationId: 1 });
  ```
- Stop typing:
  ```js
  socket.emit('typingStop', { conversationId: 1 });
  ```
- Event nhận:
  - `userTyping`
  - `userStopTyping`

### 3.6. Đánh dấu đã đọc

- Event: `markRead`
- Payload:
  ```js
  {
    "conversationId": 1
  }
  ```
- Callback:
  ```js
  socket.emit('markRead', { conversationId: 1 }, (response) => {
    console.log(response);
  });
  ```
- Event notify:
  - `messageRead`

### 3.7. Vào phòng chat mới

- Event: `joinConversation`
- Payload:
  ```js
  {
    "conversationId": 1
  }
  ```
- Callback:
  ```js
  socket.emit('joinConversation', { conversationId: 1 }, (response) => {
    console.log(response);
  });
  ```

## 4. Lưu ý

- Tất cả request REST cần header `Authorization: Bearer <token>`.
- Socket kết nối cũng cần truyền `token` trong `auth`.
- `conversationId` phải là ID conversation mà user hiện tại đang tham gia.
- Trường hợp pagination: `cursor` là ID tin nhắn cuối cùng đã lấy ở lần trước.
