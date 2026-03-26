import {app,server} from "./app.js"

const PORT = 3000;

server.listen(PORT, () => {
  console.log("Server started");
});
