const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const { ConversationRepository } = require('../repositories/conversation.repositories');
const { messageService } = require('../services/message.service');

const router = Router();

// Áp dụng middleware xác thực JWT cho tất cả các route
router.use(authMiddleware);

// GET /conversations — Lấy danh sách conversation của user hiện tại
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId; // Lấy từ JWT đã verify bởi authMiddleware
    console.log(`[ConversationController] Fetching conversations for user ${userId}`);
    const conversations = await ConversationRepository.getByUserId(userId);
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : undefined;

    const result = await messageService.getMessages(conversationId, userId, cursor);
    res.json(result);
  } catch (err) {
    console.error('Error fetching messages:', err);
    const errorMessage = err instanceof Error ? err.message : 'Error';
    res.status(403).json({ message: errorMessage });
  }
});

// POST /conversations/:id/messages — Gửi tin nhắn qua HTTP (fallback khi mất socket)
router.post('/:id/messages', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const userId = req.user.userId; // Lấy từ JWT đã verify — KHÔNG hardcode
    const content = req.body?.content;

    if (isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const result = await messageService.sendMessage({
      conversationId,
      senderId: userId,
      content,
    });

    // Emit socket event nếu io đang chạy (dual delivery: HTTP + Socket)
    const io = req.app.locals.io;
    if (io) {
      io.to(`conversation:${conversationId}`).emit('newMessage', {
        id: result.message.id,
        conversationId,
        sender: result.message.users,
        content: result.message.content,
        createdAt: result.message.created_at,
      });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      conversationId,
    });
  } catch (err) {
    console.error('Error sending message:', err);
    const errorMessage = err instanceof Error ? err.message : 'Send failed';
    res.status(400).json({ message: errorMessage });
  }
});

module.exports = router;
