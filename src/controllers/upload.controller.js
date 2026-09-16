const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth.middleware');
const { messageService } = require('../services/message.service');

const router = Router({ mergeParams: true });

// ─── Cấu hình lưu trữ file ─────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads/chat');

// Tạo thư mục upload nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Tạo thư mục theo ngày để phân tán file
    const dateDir = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const destDir = path.join(UPLOAD_DIR, dateDir);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Tạo tên file duy nhất: timestamp_random_originalname
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_') // Sanitize tên file
      .substring(0, 50); // Giới hạn độ dài
    cb(null, `${uniqueSuffix}_${baseName}${ext}`);
  },
});

// ─── Giới hạn và filter file ────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  // Ảnh
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Tài liệu
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text/Code
  'text/plain', 'text/csv', 'text/markdown',
  // Nén
  'application/zip', 'application/x-rar-compressed', 'application/gzip',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5; // Tối đa 5 file/lần upload

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Loại file không được hỗ trợ: ${file.mimetype}`), false);
    }
  },
});

// Áp dụng xác thực JWT
router.use(authMiddleware);

// ─── POST /conversations/:conversationId/attachments ────────────────────────
// Upload file và tạo tin nhắn kèm đính kèm
router.post('/', upload.array('files', MAX_FILES), async (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    const userId = req.user.userId;
    const content = req.body?.content || '';

    if (isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Chuẩn bị dữ liệu attachments từ file đã upload
    const attachments = req.files.map((file) => ({
      fileName: file.originalname,
      filePath: `/uploads/chat/${new Date().toISOString().slice(0, 10)}/${file.filename}`,
      fileType: file.mimetype,
      fileSize: file.size,
      thumbnailPath: file.mimetype.startsWith('image/')
        ? `/uploads/chat/${new Date().toISOString().slice(0, 10)}/${file.filename}` // Dùng ảnh gốc làm thumbnail tạm
        : null,
    }));

    // Tạo message kèm attachments
    const result = await messageService.sendMessage({
      conversationId,
      senderId: userId,
      content: content || `📎 ${req.files.length} file đính kèm`,
      attachments,
    });

    // Emit socket event nếu io đang chạy
    const io = req.app.locals.io;
    if (io) {
      io.to(`conversation:${conversationId}`).emit('newMessage', {
        id: result.message.id,
        conversationId,
        sender: result.message.users,
        content: result.message.content,
        createdAt: result.message.created_at,
        attachments: attachments.map((a, i) => ({
          id: i + 1, // Tạm — sẽ có ID thật từ DB nếu include
          file_name: a.fileName,
          file_path: a.filePath,
          file_type: a.fileType,
          file_size: a.fileSize,
          thumbnail_path: a.thumbnailPath,
        })),
      });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      attachments,
    });
  } catch (err) {
    console.error('[Upload] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ message: errorMessage });
  }
});

// ─── Xử lý lỗi Multer ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: `File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: `Tối đa ${MAX_FILES} file mỗi lần upload` });
    }
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

module.exports = router;
