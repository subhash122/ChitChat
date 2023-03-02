const router = require("express").Router();
const bcrypt = require("bcrypt");
const dbConnection = require("../connect");

router.get("/", async (req, res) => {
  const userId = req.query.userId;
  const username = req.query.username;
  try {
    const [users] = userId
      ? await dbConnection.query('SELECT * FROM users WHERE _id = ?', [userId])
      : await dbConnection.query('SELECT * FROM users WHERE email = ?', [username]);
    const { password, ...other } = users[0];
    res.status(200).json(other);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", async (req, res) => {
  if (req.body.userId === req.params.id || req.body.isAdmin) {
    try {
      await dbConnection.query('DELETE FROM users WHERE _id = ?', [req.params.id]);
      res.status(200).json("Account has been deleted");
    } catch (err) {
      return res.status(500).json(err);
    }
  } else {
    return res.status(403).json("You can delete only your account!");
  }
});

module.exports = router;
