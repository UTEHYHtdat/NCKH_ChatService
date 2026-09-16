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
    const { conversationId, senderId, content, parentMessageId, attachments } = params;
    let { mentionedUserIds } = params;

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

    // Extract mentioned users if not explicitly provided
    if (!mentionedUserIds || !Array.isArray(mentionedUserIds)) {
      mentionedUserIds = [];
      const mentionRegex = /@\[.*?\]\((\d+)\)/g;
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentionedUserIds.push(parseInt(match[1], 10));
      }
    }

    // Tạo message (bao gồm cập nhật last_message_at trong transaction)
    const message = await MessageRepository.create({
      conversationId,
      senderId,
      content: content.trim(),
      parentMessageId,
      attachments,
      mentionedUserIds,
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
   * Chỉnh sửa tin nhắn
   */
  async editMessage({ messageId, senderId, newContent }) {
    if (!newContent || newContent.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }
    if (newContent.length > 5000) {
      throw new Error('Message too long (max 5000 characters)');
    }

    const message = await MessageRepository.editMessage(messageId, senderId, newContent.trim());
    return message;
  }

  /**
   * Xóa tin nhắn (soft delete)
   */
  async deleteMessage({ messageId, userId }) {
    const message = await MessageRepository.softDeleteMessage(messageId, userId);
    return message;
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
