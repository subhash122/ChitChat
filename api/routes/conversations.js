const router = require("express").Router();
const dbConnection = require("../connect");

//new conv

router.post("/", async (req, res) => {
  try {
    const savedConversation = await dbConnection.query("INSERT INTO conversations (firstUser,secondUser) VALUE (?)", [req.body.senderId, req.body.receiverId])

    res.status(200).json(savedConversation);
  } catch (err) {
    res.status(500).json(err);
  }
});

//get conv of a user

router.get("/:userId", async (req, res) => {
  try {
    const [conversation] = await dbConnection.query("SELECT * FROM conversations WHERE firstUser = ? OR secondUser=?", [req.params.userId, req.params.userId])
    res.status(200).json(conversation);
  } catch (err) {
    res.status(500).json(err);
  }
});


module.exports = router;
