# Cdrive Claude sidecar'ı (bkz. server.mjs ve README.md).
# Claude CLI + küçük HTTP servisi. Docker soketi YOK; yalnızca Cdrive API'sine ve Anthropic'e çıkar.
FROM node:22-bookworm-slim
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force
# Root olmayan kullanıcı: CLI kimlik bilgileri /home/claude/.claude altında (compose'da kalıcı volume).
RUN useradd -m -u 1001 claude && mkdir -p /home/claude/.claude && chown -R claude:claude /home/claude
WORKDIR /srv
COPY server.mjs mcp-cdrive.mjs ./
USER claude
ENV HOME=/home/claude CLAUDE_CONFIG_DIR=/home/claude/.claude NODE_ENV=production PORT=9100
EXPOSE 9100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
