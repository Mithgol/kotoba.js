const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator/check');
const multer = require('multer');
const upload = multer();

const { createThread, createReply, deletePosts } = require('../controllers/posting.js');
const middlewares = require('../utils/middlewares');
const Post = require('../models/post');


router.post('/form/post', [
    upload.array('files'),
    body('board').isAlphanumeric(),
    body('replythread').isInt({ min: 0 }),
    body('replythread').toInt(),
    body('email').isEmpty(),
    body('name').isLength({ max: 75 }),
    body('em').normalizeEmail(),
    body('captcha').trim(),
    body('subject').isLength({ max: 75 }),
    body('message').trim(),
    body('postpassword').trim(),
    body('sage').toBoolean(),
    body('noko').toBoolean(),
    middlewares.validateRequest
  ],
  async (req, res, next) => {
    // TODO check ban
    const ip = req.ip;
    // TODO check capthca
    const capthca = req.body.capthca;
    const files = req.files;
    const boardUri = req.body.board;

    const postData = {
      ip: ip,
      boardUri: boardUri,
      name: req.body.name,
      email: req.body.sage ? 'sage' : req.body.em,
      subject: req.body.subject,
      body: req.body.message,
      password: req.body.postpassword,
      isSage: req.body.sage || req.body.em == 'sage'
    };

    const noko = req.body.postredir || req.body.em == 'noko';

    const replythread = req.body.replythread;
    const isNewThread = replythread == 0;
    let threadId = replythread;
    try {
      if (isNewThread) {
        threadId = await createThread(boardUri, postData, files);
      } else {
        await createReply(boardUri, replythread, postData, files);
      }
    } catch (error) {
      next(error);
      return;
    }

    const redirectUri = noko
      ? `/${ boardUri }/res/${ threadId }.html`
      : `/${ boardUri }`;
    res.redirect(302, redirectUri);
  }
);


router.post('/form/delpost', [
    body('posts').exists(),
    body('postpassword').exists(),
    middlewares.validateRequest
  ],
  async (req, res, next) => {
    try {
      const password = req.body.postpassword;
      const postsQuery = req.body.posts
        .map(boardAndNumber => {
          const [boardUri, postId] = boardAndNumber.split('/');
          return { boardUri: boardUri, postId: parseInt(postId) };
        });
      if (postsQuery.length === 0) {
        throw new Error('Error: No posts selected.');
      }
      const selectedPosts = await Post.find({ $or: postsQuery });
      if (selectedPosts.length === 0) {
        throw new Error('Error: None of selected posts exists.');
      }
      const mathcedPasswords = await Promise.all(
        selectedPosts.map(post => post.checkPassword(password)));
      const postsToDelete = selectedPosts
        .filter((_, index) => mathcedPasswords[index]);
      if (postsToDelete.length === 0) {
        throw new Error('Error: Incorrect password for deletion.');
      }
      const delResult = await deletePosts(postsToDelete);
      req.flash('deletion', delResult);
      res.redirect('back');
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
