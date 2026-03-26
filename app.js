import express from "express"
import {createServer} from "http"

const app = express();
const server = createServer(app)

app.get("/", (req, res) => {
  res.send("Hello");
});

export {app,server};