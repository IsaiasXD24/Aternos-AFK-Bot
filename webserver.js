const express = require("express");
const app = express();

app.get("/", (request, response) => {
  response.sendStatus(200); // Esto responde con un código 200 (OK)
});

app.listen(process.env.PORT, () => {
  console.log("Keep-Alive Server is ready!");
});
