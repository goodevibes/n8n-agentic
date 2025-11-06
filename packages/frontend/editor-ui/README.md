![n8n.io - Workflow Automation](https://user-images.githubusercontent.com/65276001/173571060-9f2f6d7b-bac0-43b6-bdb2-001da9694058.png)

# n8n-editor-ui

The UI to create and update n8n workflows

```
npm install n8n -g
```

## Project setup

```
pnpm install
```

### Compiles and hot-reloads for development

```
pnpm serve
```

### Compiles and minifies for production

```
pnpm build
```

### Run your tests

```
pnpm test
```

### Lints and fixes files

```
pnpm lint
```

### Run your end-to-end tests

```
pnpm test:e2e
```

### Run your unit tests

```
pnpm test:unit
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).

## License

You can find the license information [here](https://github.com/n8n-io/n8n/blob/master/README.md#license)

### vibe8n Panel

The vibe8n panel provides an integrated MCP agent interface within the n8n editor.

**Quick Start (defaults to localhost):**
```bash
pnpm --filter n8n-editor-ui serve
```

**Custom API URL:**
```bash
export VITE_MCP_AGENT_API_URL='http://localhost:8000'  # or your custom URL
pnpm --filter n8n-editor-ui serve
```

**Authentication Configuration:**
- **Localhost (default)**: No authentication required - works immediately
- **Cloud (vibe8n.io)**: Authentication always required with email signup
- **Self-hosted with auth**: Set `VITE_MCP_AGENT_REQUIRE_AUTH=true` to enable signup

With the frontend running you'll see a "vibe8n" button in the lower-right corner. Click it to open the chat panel that connects to your MCP agent server.
