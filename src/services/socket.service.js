const { verifyToken } = require('../utils/jwt');
const { UserRepository } = require('../repositories/user.repository');
const { ConversationRepository } = require('../repositories/conversation.repositories');
const { messageService } = require('./message.service');

// ─── In-memory Socket Tracking ─────────────────────────────────────────────
// Socket IDs là ephemeral (mất khi server restart) nên không cần lưu DB.
// Dùng Map để track: userId → Set<socketId> (hỗ trợ 1 user nhiều tab/device)
const userSocketMap = new Map();

function _addUserSocket(userId, socketId) {
  if (!userSocketMap.has(userId)) userSocketMap.set(userId, new Set());
  userSocketMap.get(userId).add(socketId);
}

function _removeUserSocket(userId, socketId) {
  const sockets = userSocketMap.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) userSocketMap.delete(userId);
}

function isUserOnline(userId) {
  return userSocketMap.has(userId) && userSocketMap.get(userId).size > 0;
}

// ─── Input Validation Helpers ──────────────────────────────────────────────
function parsePositiveInt(value, fieldName) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
  return parsed;
}

// ─── Socket.IO Init ────────────────────────────────────────────────────────
function initSocketIO(io) {
  // ─── Middleware: Verify JWT khi connect ───────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Missing token'));

      const payload = verifyToken(token);
      const userId = payload.userId || payload.id || payload.user_id || payload.sub;

      if (!userId) {
        return next(new Error('Invalid token payload: missing user identifier'));
      }

      // Validate user tồn tại trong DB và lấy thông tin đầy đủ
      // JWT của AuthService chỉ có { userId, role } — không có username/email
      const user = await UserRepository.validateExists(userId);

      socket.userId = userId;
      socket.username = user.username;   // lấy từ DB, không phải từ JWT
      socket.fullName = user.full_name;

      next();
    } catch (error) {
      next(new Error('Unauthorized: ' + error.message));
    }
  });

  // ─── Connection ────────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`[Socket] User ${userId} connected: ${socket.id}`);

    // Đăng ký socket vào in-memory map
    _addUserSocket(userId, socket.id);

    // Auto join vào tất cả conversation rooms của user
    const conversations = await ConversationRepository.getByUserId(userId);
    for (const conv of conversations) {
      socket.join(`conversation:${conv.id}`);
    }

    // Thông báo cho các user khác biết user này online
    socket.broadcast.emit('userOnline', { userId, isOnline: true });

    // ─── Event: Lấy danh sách conversation ──────────────────────────────────
    socket.on('getConversations', async (_, callback) => {
      try {
        const conversations = await ConversationRepository.getByUserId(userId);
        if (typeof callback === 'function') {
          callback({ success: true, conversations });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unable to load conversations';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    // ─── Event: Lấy tin nhắn (có cursor pagination) ──────────────────────────
    socket.on('getMessages', async (data, callback) => {
      try {
        const conversationId = parsePositiveInt(data?.conversationId, 'conversationId');
        const cursor = data?.cursor ? parsePositiveInt(data.cursor, 'cursor') : undefined;

        const result = await messageService.getMessages(conversationId, userId, cursor);

        if (typeof callback === 'function') {
          callback({ success: true, ...result });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unable to load messages';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    // ─── Event: Gửi tin nhắn ─────────────────────────────────────────────────
    socket.on('sendMessage', async (data, callback) => {
      try {
        const conversationId = parsePositiveInt(data?.conversationId, 'conversationId');
        const content = data?.content;

        const { message } = await messageService.sendMessage({
          conversationId,
          senderId: userId,
          content,
        });

        // Emit tới tất cả thành viên trong conversation room
        io.to(`conversation:${conversationId}`).emit('newMessage', {
          id: message.id,
          conversationId,
          sender: message.users,
          content: message.content,
          createdAt: message.created_at,
        });

        if (typeof callback === 'function') {
          callback({ success: true, message });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Send failed';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    // ─── Event: Typing indicator ──────────────────────────────────────────────
    socket.on('typingStart', (data) => {
      const conversationId = data?.conversationId;
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('userTyping', {
        userId,
        username: socket.username,
        conversationId,
      });
    });

    socket.on('typingStop', (data) => {
      const conversationId = data?.conversationId;
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('userStopTyping', {
        userId,
        conversationId,
      });
    });

    // ─── Event: Đánh dấu đã đọc ──────────────────────────────────────────────
    socket.on('markRead', async (data, callback) => {
      try {
        const conversationId = parsePositiveInt(data?.conversationId, 'conversationId');

        await messageService.markAsRead(conversationId, userId);

        // Thông báo cho các thành viên khác biết user này đã đọc
        socket.to(`conversation:${conversationId}`).emit('messageRead', {
          conversationId,
          readByUserId: userId,
          readAt: new Date(),
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Mark read failed';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    // ─── Event: Join conversation (cho conversation mới tạo sau khi connect) ──
    socket.on('joinConversation', async (data, callback) => {
      try {
        const conversationId = parsePositiveInt(data?.conversationId, 'conversationId');

        // Kiểm tra user có quyền join không
        const conversation = await ConversationRepository.findByIdAndUser(
          conversationId,
          userId,
        );
        if (!conversation) {
          throw new Error('Access denied or conversation not found');
        }

        socket.join(`conversation:${conversationId}`);

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Join failed';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    // ─── Event: Disconnect ────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] User ${userId} disconnected: ${socket.id}`);

      _removeUserSocket(userId, socket.id);

      // Chỉ thông báo offline nếu user không còn socket nào khác (tab/device khác)
      if (!isUserOnline(userId)) {
        // Dùng socket.broadcast chứ KHÔNG dùng io.emit
        // để không gửi lại cho socket đã disconnect
        socket.broadcast.emit('userOffline', { userId, isOnline: false });
      }
    });
  });
}

module.exports = { initSocketIO, isUserOnline };
