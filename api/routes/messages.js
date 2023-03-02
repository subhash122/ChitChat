const router = require("express").Router();
const dbConnection = require("../connect");

router.post("/", async (req, res) => {
  
  try {
    let q = 'INSERT INTO messages (conversationId,sender,text) VALUE (?)'
    const savedMessage = dbConnection.query(q, [req.body.conversationId, req.body.sender, req.body.text]);
    res.status(200).json(savedMessage);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/:conversationId", async (req, res) => {
  try {
    let q = 'SELECT * FROM messages WHERE conversationId = ?'
    const [messages] = dbConnection.query(q, [req.params.conversationId]);
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
