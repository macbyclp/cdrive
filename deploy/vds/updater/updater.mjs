#!/usr/bin/env node
// Cdrive updater — uzaktan (SSH'siz) güncelleme sidecar'ı.
//
// Neden ayrı bir konteyner? Uygulama kendi kendini yeniden başlatamaz ve docker soketi
// (= sunucuda root eşdeğeri yetki) uygulamaya verilmemeli. Bu küçük servis:
//   - yalnız compose ağı içinde dinler (port yayınlanmaz), Bearer belirteciyle korunur,
//   - YALNIZCA önceden klonlanmış depoyu (APP_DIR) ve YALNIZCA yapılandırılmış dalı günceller;
//     dışarıdan dal/komut/yol kabul etmez,
//   - güncelleme öncesi veritabanı yedeği alır, yeni sürüm sağlıklı açılmazsa eskisine döner.
//
// Uç noktalar: GET /health (yetkisiz), GET /status, POST /update (Bearer gerekli).
// Sıfır bağımlılık: yalnız Node yerleşikleri. UPDATER_DRY_RUN=1 ile komutlar çalıştırılmadan
// yalnızca günlüğe yazılır (yerelde akışı denemek için).

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const env = process.env;
const cfg = {
  port: Number(env.PORT || 9000),
  token: (env.UPDATER_TOKEN || "").trim(),
  branch: env.UPDATE_BRANCH || "main",
  deployDir: env.DEPLOY_DIR || "/deploy",
  appDir: env.APP_DIR || "/deploy/app",
  composeFile: env.COMPOSE_FILE || "/deploy/docker-compose.yml",
  service: env.APP_SERVICE || "cdrive",
  appContainer: env.APP_CONTAINER || "cdrive-app",
  dbContainer: env.DB_CONTAINER || "cdrive-mysql",
  dbName: env.DB_NAME || "cdrive",
  backupDir: env.BACKUP_DIR || "/backups",
  keepBackups: Number(env.KEEP_BACKUPS || 7),
  stateFile: env.STATE_FILE || "/state/status.json",
  healthTimeoutS: Number(env.HEALTH_TIMEOUT_S || 240),
  dry: env.UPDATER_DRY_RUN === "1",
};
const RUN_IMAGE = env.APP_IMAGE || "cdrive-app:local";
const ROLLBACK_IMAGE = "cdrive-app:rollback";

if (cfg.token.length < 24 || /replace-with|changeme|change-me|example/i.test(cfg.token)) {
  console.error("UPDATER_TOKEN en az 24 karakter olmalı ve şablondaki örnek değer olmamalı (ör. `openssl rand -hex 32`).");
  process.exit(1);
}

// ---- Durum (diske yazılır: updater yeniden başlasa da son sonuç kaybolmaz) ---------------------
const blank = () => ({ state: "idle", from: null, to: null, startedAt: null, finishedAt: null, error: null, log: [] });
let status = blank();
try {
  status = { ...blank(), ...JSON.parse(fs.readFileSync(cfg.stateFile, "utf8")) };
  if (status.state === "running") {
    // Updater işlem ortasında öldüyse "running" takılı kalmasın.
    status = { ...status, state: "failed", error: "Updater işlem sırasında yeniden başlatıldı", finishedAt: new Date().toISOString() };
  }
} catch {
  /* ilk çalıştırma */
}

function save() {
  try {
    fs.mkdirSync(path.dirname(cfg.stateFile), { recursive: true });
    fs.writeFileSync(cfg.stateFile, JSON.stringify(status));
  } catch (e) {
    console.error("durum yazılamadı:", e.message);
  }
}
function log(line) {
  const l = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(l);
  status.log.push(l);
  if (status.log.length > 400) status.log = status.log.slice(-400);
  save();
}

// ---- Komut çalıştırma --------------------------------------------------------------------------
function run(cmd, args, opts = {}) {
  const shown = [cmd, ...args].join(" ");
  if (cfg.dry) {
    log(`DRY-RUN $ ${shown}`);
    return Promise.resolve({ code: 0, out: opts.dryOut ?? "" });
  }
  log(`$ ${shown}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...env, ...(opts.env || {}) } });
    let out = "";
    const onData = (d) => {
      const text = d.toString();
      out += text;
      if (!opts.quiet) text.split("\n").filter(Boolean).forEach((l) => log(`  ${l.slice(0, 300)}`));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || opts.allowFail) resolve({ code, out: out.trim() });
      else reject(new Error(`${shown} → çıkış kodu ${code}`));
    });
  });
}
const capture = async (cmd, args, opts = {}) => (await run(cmd, args, { ...opts, quiet: true })).out;

let project = null;
async function composeProject() {
  if (project) return project;
  if (cfg.dry) return (project = "dry");
  // Compose proje adı, sunucudaki mevcut kurulumun adıyla AYNI olmalı; yoksa yeni (boş) volume'lar
  // oluşur. Kendi konteynerimizin etiketinden okuyoruz.
  project = await capture("docker", ["inspect", env.HOSTNAME || "", "--format", '{{index .Config.Labels "com.docker.compose.project"}}']);
  if (!project) throw new Error("Compose proje adı bulunamadı (updater compose ile başlatılmalı)");
  return project;
}
async function compose(args, opts = {}) {
  const p = await composeProject();
  return run("docker", ["compose", "-p", p, "--project-directory", cfg.deployDir, "-f", cfg.composeFile, ...args], opts);
}

// ---- Yardımcılar -------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy() {
  if (cfg.dry) return true;
  const deadline = Date.now() + cfg.healthTimeoutS * 1000;
  while (Date.now() < deadline) {
    const state = await capture("docker", ["inspect", "-f", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}", cfg.appContainer], { allowFail: true });
    const [run_, health] = state.split("|");
    if (health === "healthy") return true;
    if (health === "unhealthy" || run_ === "exited" || run_ === "dead") return false;
    await sleep(3000);
  }
  return false;
}

async function backupDatabase(stamp) {
  fs.mkdirSync(cfg.backupDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(cfg.backupDir, 0o700); // yedekler yalnız sahibi (root) tarafından okunabilsin
  } catch {
    /* bind mount izinleri değiştirilemiyorsa umask 077 yine de dosyaları korur */
  }
  const file = path.join(cfg.backupDir, `cdrive-${stamp}.sql.gz`);
  // Şifre konteynerin kendi ortamındaki MYSQL_ROOT_PASSWORD'den okunur; updater'a verilmez.
  const script = `docker exec ${cfg.dbContainer} sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines ${cfg.dbName}' | gzip > ${JSON.stringify(file)}`;
  await run("sh", ["-c", `umask 077; set -o pipefail 2>/dev/null; ${script}`]);
  if (!cfg.dry) {
    const size = fs.statSync(file).size;
    if (size < 200) throw new Error("Veritabanı yedeği boş görünüyor; güncelleme iptal edildi");
    log(`Yedek alındı: ${file} (${Math.round(size / 1024)} KB)`);
    const old = fs.readdirSync(cfg.backupDir).filter((f) => /^cdrive-.*\.sql\.gz$/.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - cfg.keepBackups))) fs.rmSync(path.join(cfg.backupDir, f), { force: true });
  }
}

// ---- Güncelleme akışı --------------------------------------------------------------------------
async function update() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  status = { ...blank(), state: "running", startedAt: new Date().toISOString() };
  save();
  let oldSha = null;
  let switched = false;
  try {
    log(`Güncelleme başladı — dal: ${cfg.branch}`);
    oldSha = (await capture("git", ["-C", cfg.appDir, "rev-parse", "HEAD"], { dryOut: "0000000" })) || null;
    status.from = oldSha;
    await run("git", ["-C", cfg.appDir, "fetch", "--prune", "origin", cfg.branch]);
    const newSha = (await capture("git", ["-C", cfg.appDir, "rev-parse", `origin/${cfg.branch}`], { dryOut: "1111111" })) || null;
    status.to = newSha;
    if (oldSha && oldSha === newSha) {
      log("Zaten güncel — yapılacak bir şey yok.");
      status = { ...status, state: "success", finishedAt: new Date().toISOString() };
      return save();
    }
    log(`${oldSha?.slice(0, 7)} → ${newSha?.slice(0, 7)}`);

    log("1/5 Veritabanı yedeği");
    await backupDatabase(stamp);

    log("2/5 Geri dönüş için mevcut imaj etiketleniyor");
    const imageId = await capture("docker", ["inspect", "-f", "{{.Image}}", cfg.appContainer], { allowFail: true, dryOut: "sha256:dry" });
    if (imageId) await run("docker", ["tag", imageId, ROLLBACK_IMAGE]);
    else log("  (çalışan konteyner yok; geri dönüş imajı etiketlenemedi)");

    log("3/5 Yeni kod çekiliyor ve derleniyor");
    switched = true;
    await run("git", ["-C", cfg.appDir, "reset", "--hard", `origin/${cfg.branch}`]);
    await compose(["build", cfg.service], { env: { GIT_SHA: newSha || "unknown", BUILD_TIME: new Date().toISOString() } });

    log("4/5 Uygulama yeniden başlatılıyor (migration'lar açılışta uygulanır)");
    await compose(["up", "-d", "--no-deps", cfg.service]);

    log("5/5 Sağlık kontrolü bekleniyor");
    if (!(await waitHealthy())) throw new Error("Yeni sürüm sağlıklı açılmadı");

    await run("docker", ["image", "prune", "-f"], { allowFail: true });
    log("Güncelleme tamamlandı ✔");
    status = { ...status, state: "success", finishedAt: new Date().toISOString() };
  } catch (e) {
    log(`HATA: ${e.message}`);
    status.error = e.message;
    if (switched && oldSha) {
      try {
        log("Önceki sürüme dönülüyor…");
        await run("git", ["-C", cfg.appDir, "reset", "--hard", oldSha]);
        await run("docker", ["tag", ROLLBACK_IMAGE, RUN_IMAGE]);
        await compose(["up", "-d", "--no-deps", "--no-build", cfg.service]);
        if (!(await waitHealthy())) throw new Error("Önceki sürüm de sağlıklı açılmadı");
        log("Önceki sürüme dönüldü. Not: veritabanı migration'ları ileri yönlüdür; gerekirse yedekten elle dönün.");
        status.state = "rolled_back";
      } catch (e2) {
        log(`GERİ DÖNÜŞ BAŞARISIZ: ${e2.message}`);
        status.error = `${status.error}; geri dönüş: ${e2.message}`;
        status.state = "failed";
      }
    } else {
      status.state = "failed";
    }
    status.finishedAt = new Date().toISOString();
  } finally {
    save();
  }
}

// ---- HTTP --------------------------------------------------------------------------------------
function authorized(req) {
  const given = Buffer.from((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(cfg.token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
  if (!authorized(req)) return send(res, 401, { error: "Yetkisiz" });
  if (req.method === "GET" && url.pathname === "/status") return send(res, 200, status);
  if (req.method === "POST" && url.pathname === "/update") {
    if (status.state === "running") return send(res, 409, { error: "Bir güncelleme zaten sürüyor" });
    void update();
    return send(res, 202, status);
  }
  return send(res, 404, { error: "Bulunamadı" });
});

if (!cfg.dry) {
  // Bind-mount edilen depo başka bir kullanıcıya ait olabilir; git "dubious ownership" demesin.
  spawn("git", ["config", "--global", "--add", "safe.directory", cfg.appDir]).on("error", () => {});
}
server.listen(cfg.port, "0.0.0.0", () => {
  console.log(`cdrive-updater ${cfg.dry ? "(DRY-RUN) " : ""}:${cfg.port} dal=${cfg.branch}`);
});
