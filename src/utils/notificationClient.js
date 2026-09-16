const http = require('http');

/**
 * Gửi thông báo cho các thành viên ngoại tuyến
 * Dùng http module để gọi NotificationService nội bộ
 */
const notifyOfflineMembers = ({ memberIds, senderId, senderName, conversationId, conversationName, messageContent }) => {
  try {
    const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8005';
    const internalKey = process.env.INTERNAL_API_KEY;

    if (!internalKey) {
      console.warn('[NotificationClient] Bỏ qua gửi thông báo: Không có INTERNAL_API_KEY');
      return;
    }

    const offlineMemberIds = memberIds.filter(id => id !== senderId);
    
    if (offlineMemberIds.length === 0) return;

    // Rút gọn tin nhắn xuống 100 ký tự
    const truncatedMessage = messageContent.length > 100 
      ? messageContent.substring(0, 97) + '...'
      : messageContent;

    const title = `Tin nhắn mới từ ${senderName}`;
    const url = new URL('/api/v1/notification/internal/send', notificationServiceUrl);

    const payload = JSON.stringify({
      userIds: offlineMemberIds,
      type: 'CHAT',
      title: title,
      message: truncatedMessage,
      reference_id: String(conversationId),
      reference_type: 'conversation'
    });

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-internal-key': internalKey
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`[NotificationClient] Lỗi gửi thông báo. Status: ${res.statusCode}, Body: ${data}`);
        }
      });
    });

    req.on('error', (e) => {
      console.warn(`[NotificationClient] Lỗi kết nối NotificationService: ${e.message}`);
    });

    req.write(payload);
    req.end();
  } catch (error) {
    console.warn(`[NotificationClient] Lỗi không mong muốn: ${error.message}`);
  }
};

module.exports = {
  notifyOfflineMembers
};
