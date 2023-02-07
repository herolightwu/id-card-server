const bodyParser = require("body-parser");
var express = require("express");
const session = require("express-session");
const cors = require("cors");

var app = express();

app.use(
  session({
    secret: "MY_SECRET",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: !true },
  })
);

var index = require("./routes/index");

// Setup JSON parser
// app.use(bodyParser.json());
// app.use(
//   bodyParser.urlencoded({
//     extended: true,
//   })
// );
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb" }));

// serving static files
app.use('/uploads', express.static('uploads'));

app.use("/", cors(), index);

app.use(function (req, res, next) {
  res.status(404).send("Sorry cant find that!");
});

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(3000, function () {
  console.log("ID Card Server listening on port 3000!");
});
