import dns from "node:dns";

dns.setServers([
  "8.8.8.8",
  "1.1.1.1"
]);

console.log("DNS:", dns.getServers());

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
});

console.log(process.env.MONGO_URI_CUSTOMERS);

const { default: app } = await import("./app.js");
await import("./config/database.js");

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 UrbanLite running on port ${PORT}`);
});