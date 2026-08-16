import { config } from "dotenv";
import path from "path";

// Testler .env.test'i kullanır (ayrı bir "cdrive_test" MySQL veritabanı) —
// asla geliştirme/production veritabanına karşı çalışmaz.
config({ path: path.resolve(__dirname, "../.env.test") });
