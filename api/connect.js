const mysql = require('mysql2');

const dbConnection = mysql.createConnection({
    host: process.env.HOST,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
}).promise()

module.exports = dbConnection;