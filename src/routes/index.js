const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/conversation', require('./conversation.routes'));
router.use('/message', require('./message.routes'));

module.exports = router;
