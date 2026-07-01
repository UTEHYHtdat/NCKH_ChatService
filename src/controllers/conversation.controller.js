const { Router } = require('express');
// Đảm bảo các file middleware, repository, service này cũng đã được chuyển sang .js hoặc export dạng CommonJS
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  ConversationRepository,
} = require('../repositories/conversation.repositories');
const { messageService } = require('../services/message.service');

const router = Router();

// Áp dụng middleware xác thực cho tất cả các route bên dưới
router.use(authMiddleware);

// GET /conversations — Lấy danh sách conversation của user
router.get('/', async (req, res) => {
  try {
    // req.user được đính kèm từ authMiddleware
    // const userId = req.user.userId;
    const userId = 1;
    console.log(
      `[ConversationController] Fetching conversations for user ${userId}`,
    );
    const conversations = await ConversationRepository.getByUserId(userId);
    res.json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /conversations/:id/messages — Load tin nhắn gần nhất (Phân trang bằng cursor)
router.get('/:id/messages', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    // Nếu có cursor trên query string thì parse thành số nguyên, không thì để undefined
    const cursor = req.query.cursor
      ? parseInt(req.query.cursor, 10)
      : undefined;

    const messages = await messageService.getMessages(
      conversationId,
      userId,
      cursor,
    );
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    const errorMessage = err instanceof Error ? err.message : 'Error';
    res.status(403).json({ message: errorMessage });
  }
});

// POST /conversations/:id/messages — Gửi tin nhắn qua HTTP
router.post('/:id/messages', async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    // const userId = req.user.userId;
    const userId = 2;
    const content = req.body?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const result = await messageService.sendMessage({
      conversationId,
      senderId: userId,
      content,
    });

    const io = req.app.locals.io;
    if (io) {
      io.to(`conversation:${conversationId}`).emit('newMessage', {
        id: result.message.id,
        conversationId,
        sender: result.message.sender,
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

// Export router theo chuẩn Node.js CommonJS
module.exports = router;
