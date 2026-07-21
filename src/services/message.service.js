const { MessageRepository } = require('../repositories/message.repositories');
const { ConversationRepository } = require('../repositories/conversation.repositories');

class MessageService {
  /**
   * Xử lý pipeline gửi tin nhắn:
   * 1. Kiểm tra Conversation tồn tại và user có quyền
   * 2. Validate nội dung tin nhắn
   * 3. Tạo Message + cập nhật last_message_at (trong transaction)
   * 4. Đánh dấu đã đọc cho sender
   * 5. Tăng unread_count cho các thành viên khác
   * 6. Return message để Socket emit
   */
  async sendMessage(params) {
    const { conversationId, senderId, content } = params;

    // Kiểm tra quyền truy cập
    const conversation = await ConversationRepository.findByIdAndUser(
      conversationId,
      senderId,
    );
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }
    if (content.length > 5000) {
      throw new Error('Message too long (max 5000 characters)');
    }

    // Tạo message (bao gồm cập nhật last_message_at trong transaction)
    const message = await MessageRepository.create({
      conversationId,
      senderId,
      content: content.trim(),
    });

    // Đánh dấu đã đọc cho sender ngay khi gửi
    await MessageRepository.markAsRead(message.id, senderId);

    // Tăng unread_count cho các thành viên khác
    await ConversationRepository.incrementUnreadCounts(conversationId, senderId);

    return {
      message,
      memberIds: conversation.conversation_members.map((m) => m.user_id),
    };
  }

  /**
   * Lấy tin nhắn của conversation (cursor pagination)
   * Trả về: { messages, hasMore, nextCursor }
   */
  async getMessages(conversationId, userId, cursor) {
    const conversation = await ConversationRepository.findByIdAndUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    return MessageRepository.getRecent(conversationId, cursor);
  }

  /**
   * Đánh dấu tất cả tin nhắn chưa đọc trong conversation là đã đọc
   * và reset unread_count về 0
   */
  async markAsRead(conversationId, userId) {
    await MessageRepository.markConversationAsRead(conversationId, userId);
  }
}

const messageService = new MessageService();
module.exports = { messageService };
