// cPanel'in Node.js App (Passenger) arayüzü, `next start` komutunu değil,
// process.env.PORT'ta dinleyen bir .js giriş dosyası bekler. Bu dosya o
// köprüyü kurar — `npm run build` sonrası Passenger tarafından çalıştırılır.
// Yerel geliştirmede kullanılmaz (`npm run dev` / `next dev` kullanılır).
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Cdrive ${port} portunda dinliyor`);
  });
});
