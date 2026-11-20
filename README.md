# FrictionFlow

FrictionFlow is a mindful-browsing / digital-wellbeing system with three parts:

1. **Browser extension** (\`extension/\`) - blocks distracting sites with a countdown and optional math challenge, then grants a time-limited focus pass.
2. **Backend API + dashboard** (\`server.js\`, \`public/\`) - Express + SQLite service that records bypass events.
3. **Prototype web UI** (\`web/prototype.html\`) - standalone concept dashboard using \`localStorage\` for offline experimentation.

## Quick start (local backend)

\`\`\`bash
cp .env.example .env
npm ci
npm start
\`\`\`

The backend listens on \`http://127.0.0.1:5001\` by default.

## API

- \`GET /health\` - unauthenticated health check; does not expose database paths.
- \`POST /api/analytics\` - records an event.
- \`GET /api/analytics?limit=50&offset=0\` - lists recent events.
- \`GET /api/stats\` - aggregate statistics.

All analytics endpoints require an \`X-API-Key\` header when \`API_KEY\` is configured. In production, \`API_KEY\` is mandatory and is required for reads and writes. Query-string API keys are not accepted.

Example:

\`\`\`bash
curl -H "X-API-Key: $API_KEY" http://127.0.0.1:5001/api/analytics
\`\`\`

## Environment variables

- \`PORT\` - HTTP port (default \`5001\`).
- \`HOST\` - bind address (default \`127.0.0.1\`; use \`0.0.0.0\` behind a container or hosting proxy).
- \`DB_PATH\` - SQLite file location.
- \`CORS_ORIGIN\` - comma-separated trusted origins; \`*\` is development-only.
- \`API_KEY\` - required in production; protects analytics endpoints.

For a hosted deployment, configure \`NODE_ENV=production\`, a strong random \`API_KEY\`, an explicit \`CORS_ORIGIN\` (or leave it empty if only browser-extension origins are used), and \`HOST=0.0.0.0\` when required by the platform.

## Extension install

1. Open \`chrome://extensions\` or \`about:debugging\`.
2. Enable developer mode and load the unpacked \`extension/\` directory.
3. Configure the backend API key in extension storage as \`backendApiKey\` when analytics are enabled.
4. Add domains as hostnames such as \`youtube.com\`, not URL fragments.

Rules match the exact hostname and its subdomains. They do not match lookalike domains such as \`notyoutube.com\`.

## Tests

\`\`\`bash
npm test
npm run check
npm run test:smoke
\`\`\`

## Docker

\`\`\`bash
docker build -t frictionflow-backend -f Dockerfile.txt .
docker run -p 5001:5001 -v frictionflow-data:/app/data \\
  -e HOST=0.0.0.0 -e DB_PATH=/app/data/frictionflow.db \\
  -e NODE_ENV=production -e API_KEY="$API_KEY" frictionflow-backend
\`\`\`
