const router = require('express').Router();

const controller = require('../controllers/message.controller');

router.get('/', controller.getAll);

module.exports = router;
