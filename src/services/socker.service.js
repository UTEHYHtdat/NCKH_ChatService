// Thay thế import bằng require
const { verifyToken } = require('../utils/jwt');
const { UserRepository } = require('../repositories/user.repository');
const {
  ConversationRepository,
} = require('../repositories/conversation.repositories');
const { messageService } = require('./message.service');

function initSocketIO(io) {
  // ─── Middleware: Verify JWT khi connect ────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Missing token'));

      const payload = verifyToken(token);
      const userId =
        payload.userId || payload.id || payload.user_id || payload.sub;
      if (!userId) {
        return next(
          new Error('Invalid token payload: missing user identifier'),
        );
      }

      socket.userId = userId;
      socket.username = payload.username || payload.name;

      await UserRepository.upsert({
        id: userId,
        username: socket.username,
        email: payload.email,
      });

      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // ─── Connection ────────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`[Socket] User ${userId} connected: ${socket.id}`);

    await UserRepository.setSocketId(userId, socket.id);

    const conversations = await ConversationRepository.getByUserId(userId);
    for (const conv of conversations) {
      socket.join(`conversation:${conv.id}`);
    }

    socket.broadcast.emit('userOnline', { userId });

    socket.on('getConversations', async (_, callback) => {
      try {
        const conversations = await ConversationRepository.getByUserId(userId);
        if (typeof callback === 'function') {
          callback({ success: true, conversations });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unable to load conversations';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    socket.on('getMessages', async (data, callback) => {
      try {
        const { conversationId, cursor } = data || {};
        if (!conversationId) {
          throw new Error('conversationId is required');
        }

        const result = await messageService.getMessages(
          conversationId,
          userId,
          cursor,
        );
        if (typeof callback === 'function') {
          callback({ success: true, ...result });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unable to load messages';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    socket.on('sendMessage', async (data, callback) => {
      try {
        const { message } = await messageService.sendMessage({
          conversationId: data.conversationId,
          senderId: userId,
          content: data.content,
        });

        io.to(`conversation:${data.conversationId}`).emit('newMessage', {
          id: message.id,
          conversationId: data.conversationId,
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

    socket.on('typingStart', (data) => {
      socket.to(`conversation:${data.conversationId}`).emit('userTyping', {
        userId,
        username: socket.username,
        conversationId: data.conversationId,
      });
    });

    socket.on('typingStop', (data) => {
      socket.to(`conversation:${data.conversationId}`).emit('userStopTyping', {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('markRead', async (data, callback) => {
      try {
        await messageService.markAsRead(data.conversationId, userId);
        socket.to(`conversation:${data.conversationId}`).emit('messageRead', {
          conversationId: data.conversationId,
          readByUserId: userId,
          readAt: new Date(),
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Mark read failed';
        if (typeof callback === 'function') {
          callback({ success: false, error: errorMessage });
        }
      }
    });

    socket.on('joinConversation', async (data, callback) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) {
          throw new Error('conversationId is required');
        }

        const conversation = await ConversationRepository.findByIdAndUser(
          conversationId,
          userId,
        );
        if (!conversation) {
          throw new Error('Cannot join conversation');
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

    socket.on('disconnect', async () => {
      console.log(`[Socket] User ${userId} disconnected`);
      await UserRepository.setSocketId(userId, null);
      io.emit('userOffline', { userId });
    });
  });
}

// Export module bằng CommonJS
module.exports = { initSocketIO };
