const router = require("express").Router();
const bcrypt = require("bcrypt");
const dbConnection = require("../connect");

router.post("/register", async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    const q = "INSERT INTO users (username,email,password) VALUE (?)";
    const values = [req.body.username, req.body.email, hashedPassword]

    const user =await dbConnection.query(q, [values])
    return res.status(200).json(user)

  } catch (err) {
    res.status(500).json(err)
  }
});

router.post("/login", async (req, res) => {
  try {
   
    const [users] = await dbConnection.query('SELECT * FROM users WHERE email = ?', [req.body.email]);
    if (users.length === 0) { return res.status(404).json("user not found"); }
    const validPassword = await bcrypt.compare(req.body.password, users[0].password)
    !validPassword &&  res.status(400).json("wrong password")
    delete users[0].password;
    res.status(200).json(users[0])
  } catch (err) {
    res.status(500).json(err)
  }
});

module.exports = router;
