# Aeromech Tools

A small [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives Claude two engineering calculators:

| Tool | What it does |
|---|---|
| `get_isa_atmosphere` | Temperature, pressure, density and speed of sound at a geometric altitude (1976 US Standard Atmosphere, 0–86 km), with an optional ISA+ΔT temperature offset. |
| `cantilever_end_load_deflection` | Tip deflection and tip slope of a cantilever beam with a point load at the free end (δ = PL³/3EI, θ = PL²/2EI). Takes values with units, metric or imperial. |

There are two versions with identical results:

- **`worker/`**: JavaScript for Cloudflare Workers. Hosted online, so anyone you share the link with can add it to Claude as a custom connector. No dependencies.
- **`python/`**: Python, runs locally on your own computer through Claude Desktop.

## Example questions to ask Claude

- "What's the air density at 5,000 m on an ISA+10 day?"
- "Speed of sound at 11 km?"
- "How far does a 36 in aluminum cantilever deflect under 100 lbf if I = 12 in^4 and E = 10 Msi?"
- "500 N on the end of a 2 m beam, E = 70 GPa, I = 4.5e-6 m^4: deflection and tip slope?"

Supported units for the beam tool:

- **Hosted (JavaScript) version:** force in N, kN, lbf or kip; length in m, cm, mm, in or ft; modulus in Pa, kPa, MPa, GPa, psi, ksi or Msi; moment of inertia in m^4, cm^4, mm^4, in^4 or ft^4.
- **Local (Python) version:** accepts anything the [pint](https://pint.readthedocs.io) unit library understands.

---

## Option A: Host it on Cloudflare Workers (free)

### Deploy from the dashboard (no installs)

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) and go to **Workers & Pages → Create application → Start with Hello World!**
2. Name it (e.g. `aeromech-tools`) and click **Deploy**.
3. Click **Edit code**, replace everything in `worker.js` with the contents of [`worker/src/index.js`](worker/src/index.js), and click **Deploy**.
4. Visit `https://<your-worker>.<your-subdomain>.workers.dev/`. You should see *"Aeromech Tools MCP server is running."*

### Or deploy with the command line

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

### Keep the link private (recommended)

The server has no login, so anyone who knows the URL can use it. To make the URL work like a password:

1. In the Worker's **Settings → Variables and Secrets**, add a variable of type **Secret** named `MCP_PATH_SECRET` with a long random value. A password manager's generator works well for this; use letters and numbers only.
   (Command-line alternative: `npx wrangler secret put MCP_PATH_SECRET`.)
2. Your endpoint becomes `https://<your-worker>.<your-subdomain>.workers.dev/mcp/<your-secret>`. Plain `/mcp` returns "not found."
3. Share that full link only with people you trust. To revoke access, change the secret.

Without the secret, the endpoint is `https://<your-worker>.<your-subdomain>.workers.dev/mcp`.

The free Workers plan allows 100,000 requests per day. If that's exceeded, requests fail until the next day; you aren't charged.

### Connect it to Claude

In Claude (web or desktop), go to **Customize → Connectors → + → Add custom connector**, give it a name, paste your endpoint URL, and leave the authentication settings empty.

---

## Option B: Run it locally with Claude Desktop (Python)

Requires Python 3.10 or newer.

```bash
cd python
pip install -r requirements.txt
```

Then add the server to Claude Desktop's config file (**Settings → Developer → Edit Config**) and restart Claude:

```json
{
  "mcpServers": {
    "aeromech-tools": {
      "command": "python",
      "args": ["/path/to/aeromech-tools/python/server.py"]
    }
  }
}
```

On Windows, use a path like `"C:\\path\\to\\aeromech-tools\\python\\server.py"`, with double backslashes.

---

## Notes

- Altitude is **geometric** (height above sea level), so values differ slightly from tables indexed by geopotential altitude. At 11,000 m geometric the temperature is 216.77 K, not the tabulated 216.65 K at 11 km geopotential.
- Density and speed of sound use R = 287.058 J/(kg·K) and γ = 1.4.
- These are textbook formulas for quick estimates and learning, not a substitute for engineering review.

## License

[MIT](LICENSE)
