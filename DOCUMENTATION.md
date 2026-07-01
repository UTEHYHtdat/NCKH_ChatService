# ChaxBox Service - Luồng chạy và hướng dẫn test API

## 1. Tổng quan

Dự án này là một backend Node.js dùng Express + Socket.IO, phục vụ cho chức năng chat và hội thoại. Server chính chạy từ file server.js và khởi tạo ứng dụng từ index.js.

## 2. Cấu trúc thư mục chính

- server.js: entry point khởi động server
- index.js: cấu hình Express, CORS, REST routes, Socket.IO
- src/controllers: xử lý HTTP request
- src/services: logic nghiệp vụ chính
- src/repositories: truy vấn dữ liệu qua Prisma
- src/middleware: xác thực và phân quyền
- src/sockets: xử lý socket events
- prisma/schema.prisma: schema database Prisma

## 3. Luồng chạy của hệ thống

### 3.1 Khởi động server

1. Cài dependencies:
   ```bash
   npm install
   ```
2. Tạo Prisma Client:
   ```bash
   npx prisma generate
   ```
3. Khởi động server:
   ```bash
   npm run dev
   ```
   Hoặc:
   ```bash
   node server.js
   ```

### 3.2 Khi server start

- Server sẽ lắng nghe tại cổng 3001 theo mặc định.
- Endpoint health check có sẵn tại:
  - GET /health
- Nếu có file certs/key.pem và certs/cert.pem thì server chạy với HTTPS/WSS, nếu không sẽ fallback sang HTTP.

## 4. Luồng request REST

### 4.1 Health check

- Method: GET
- URL: http://localhost:3001/health
- Mục đích: kiểm tra server đang chạy

Example:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{ "status": "ok" }
```

### 4.2 Lấy danh sách conversation của user

- Method: GET
- URL: http://localhost:3001/conversations
- Yêu cầu: cần gửi JWT trong header Authorization

Header:

```http
Authorization: Bearer <token>
```

Example:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/conversations
```

### 4.3 Lấy danh sách tin nhắn của một conversation

- Method: GET
- URL: http://localhost:3001/conversations/:id/messages
- Yêu cầu: cần JWT
- Query param optional:
  - cursor: id của message để phân trang

Example:

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3001/conversations/1/messages"
```

## 5. Luồng xử lý nghiệp vụ

### 5.1 Request REST đến conversation

Luồng đi như sau:

1. Request đến /conversations...
2. Middleware auth.middleware kiểm tra JWT
3. Controller conversation.controller gọi repository
4. Repository truy vấn Prisma database
5. Response trả về dữ liệu JSON

### 5.2 Gửi tin nhắn

Luồng gửi tin nhắn qua Socket.IO như sau:

1. Client kết nối Socket.IO và gửi JWT trong handshake
2. Socket middleware xác thực token
3. Server join user vào room của các conversation mà họ tham gia
4. Client emit event sendMessage
5. MessageService xử lý nghiệp vụ:
   - kiểm tra conversation tồn tại
   - kiểm tra user có quyền truy cập
   - validate nội dung tin nhắn
   - lưu message vào DB
   - cập nhật lastMessage
   - đánh dấu đã đọc cho sender
6. Server emit event newMessage tới tất cả thành viên trong conversation

## 6. Socket.IO events

### 6.1 Kết nối

Client cần truyền token khi connect:

```javascript
const socket = io('http://localhost:3001', {
  auth: { token: '<jwt>' },
});
```

### 6.2 Gửi tin nhắn

Event:

```javascript
socket.emit(
  'sendMessage',
  {
    conversationId: 1,
    content: 'Hello world',
  },
  (res) => {
    console.log(res);
  },
);
```

### 6.3 Gõ typing

```javascript
socket.emit('typingStart', { conversationId: 1 });
socket.emit('typingStop', { conversationId: 1 });
```

### 6.4 Đánh dấu đã đọc

```javascript
socket.emit('markRead', { conversationId: 1 });
```

## 7. Hướng dẫn test API

### 7.1 Test bằng curl

#### a) Kiểm tra server hoạt động

```bash
curl http://localhost:3001/health
```

#### b) Test endpoint conversation cần token

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/conversations
```

#### c) Test lấy tin nhắn

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3001/conversations/1/messages"
```

### 7.2 Test bằng Postman / Insomnia

1. Tạo request GET tới http://localhost:3001/health
2. Tạo request GET tới http://localhost:3001/conversations
3. Trong header thêm:
   - Key: Authorization
   - Value: Bearer <token>
4. Gửi request và xem response

### 7.3 Test bằng browser / frontend

- Mở frontend và kết nối tới socket server với token JWT
- Thử gửi một tin nhắn và quan sát event newMessage

## 8. Các lưu ý quan trọng

- Cần cấu hình biến môi trường trong file .env:
  - DATABASE_URL
  - JWT_SECRET
  - JWT_EXPIRES_IN
  - AES_SECRET_KEY
- Nếu Prisma Client chưa được generate, chạy:
  ```bash
  npx prisma generate
  ```
- Nếu lỗi liên quan đến token, kiểm tra lại JWT_SECRET và token gửi lên
- Nếu lỗi kết nối DB, kiểm tra DATABASE_URL và trạng thái PostgreSQL

## 9. Troubleshooting

### Prisma lỗi

```bash
npx prisma generate
```

### Server không start

- Kiểm tra port 3001 có đang bị chiếm không
- Kiểm tra file .env có tồn tại và đầy đủ
- Kiểm tra dependencies đã cài xong

### API trả 401

- Token bị thiếu hoặc hết hạn
- Header Authorization sai format

## 10. Kết luận

Backend hiện tại hỗ trợ:

- health check
- lấy danh sách conversation
- lấy tin nhắn của conversation
- gửi tin nhắn realtime qua Socket.IO
- typing indicator và mark as read
