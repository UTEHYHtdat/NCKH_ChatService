const { MessageRepository } = require('../repositories/message.repositories');
const {
  ConversationRepository,
} = require('../repositories/conversation.repositories');

class MessageService {
  /**
   * Xử lý toàn bộ pipeline gửi tin nhắn theo spec:
   * 1. Kiểm tra Conversation tồn tại
   * 2. Kiểm tra User thuộc Conversation
   * 3. Validate Message
   * 4. Tạo Message
   * 5. Update Conversation.lastMessage và unread_count
   * 6. Tạo Read Status (cho người gửi)
   * 7. Return message để Emit Socket
   */
  async sendMessage(params) {
    const { conversationId, senderId, content } = params;

    const conversation = await ConversationRepository.findByIdAndUser(
      conversationId,
      senderId,
    );

    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }
    if (content.length > 5000) {
      throw new Error('Message too long (max 5000 characters)');
    }

    const message = await MessageRepository.create({
      conversationId,
      senderId,
      content: content.trim(),
    });

    await MessageRepository.markAsRead(message.id, senderId);
    await ConversationRepository.incrementUnreadCounts(
      conversationId,
      senderId,
    );

    return {
      message,
      memberIds: conversation.conversation_members.map((m) => m.user_id),
    };
  }

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

  async markAsRead(conversationId, userId) {
    await MessageRepository.markConversationAsRead(conversationId, userId);
  }
}

const messageService = new MessageService();
module.exports = { messageService };
