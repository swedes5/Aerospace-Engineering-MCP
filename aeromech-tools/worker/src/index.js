// Aeromech Tools — remote MCP server for Cloudflare Workers (no dependencies, no login).
//
// Endpoint:  https://<your-worker>.<your-subdomain>.workers.dev/mcp
//
// Optional private link: set a secret variable named MCP_PATH_SECRET on the Worker
// (Settings -> Variables and Secrets). The endpoint then becomes
//   https://<your-worker>.<your-subdomain>.workers.dev/mcp/<MCP_PATH_SECRET>
// and plain /mcp returns 404, so only people you give the full link to can use it.

const SERVER_INFO = { name: "aeromech-tools", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "get_isa_atmosphere",
    description:
      "Computes standard atmospheric properties (1976 US Standard Atmosphere, 0–86 km) " +
      "given geometric altitude in meters and an optional temperature offset in °C (ISA+ΔT).",
    inputSchema: {
      type: "object",
      properties: {
        altitude_m: { type: "number", description: "Geometric altitude in meters (0–86000)" },
        delta_t_c: { type: "number", default: 0, description: "Temperature offset from standard, °C" },
      },
      required: ["altitude_m"],
    },
  },
  {
    name: "cantilever_end_load_deflection",
    description:
      "Calculates max deflection and tip slope for a cantilever beam with an end point load. " +
      "Accepts unit strings, e.g. load: '500 N' or '100 lbf'; length: '2 m' or '36 in'; " +
      "youngs_modulus: '70 GPa' or '10 Msi'; moment_of_inertia: '4.5e-6 m^4' or '12 in^4'.",
    inputSchema: {
      type: "object",
      properties: {
        load: { type: "string" },
        length: { type: "string" },
        youngs_modulus: { type: "string" },
        moment_of_inertia: { type: "string" },
      },
      required: ["load", "length", "youngs_modulus", "moment_of_inertia"],
    },
  },
];

// ---------- Atmosphere (US Standard Atmosphere 1976) ----------
const R_EARTH = 6356766; // m
const G0 = 9.80665;
const R_AIR = 287.05287;
const GAMMA = 1.4;
const R_GAS = 287.058; // used for density & speed of sound (matches the original Python server)
// [base geopotential altitude (m), lapse rate (K/m)]
const LAYERS = [
  [0, -0.0065], [11000, 0], [20000, 0.001], [32000, 0.0028],
  [47000, 0], [51000, -0.0028], [71000, -0.002], [84852, 0],
];

function isa(altitudeM, deltaTC = 0) {
  if (!Number.isFinite(altitudeM) || altitudeM < -5000 || altitudeM > 86000)
    throw new Error("altitude_m must be between -5000 and 86000");
  const h = (R_EARTH * altitudeM) / (R_EARTH + altitudeM); // geopotential altitude
  let T = 288.15, p = 101325;
  for (let i = 0; i < LAYERS.length; i++) {
    const [hb, L] = LAYERS[i];
    const hTop = i + 1 < LAYERS.length ? LAYERS[i + 1][0] : Infinity;
    const dh = Math.min(h, hTop) - hb;
    if (i > 0 && h < hb) break;
    const Tn = T + L * dh;
    p = L === 0 ? p * Math.exp((-G0 * dh) / (R_AIR * T)) : p * Math.pow(T / Tn, G0 / (R_AIR * L));
    T = Tn;
    if (h <= hTop) break;
  }
  const Tact = T + deltaTC;
  const rho = p / (R_GAS * Tact);
  const a = Math.sqrt(GAMMA * R_GAS * Tact);
  const r = (x, d) => Number(x.toFixed(d));
  return {
    altitude_m: altitudeM,
    temperature_K: r(Tact, 2),
    pressure_Pa: r(p, 2),
    density_kg_m3: r(rho, 4),
    speed_of_sound_m_s: r(a, 2),
  };
}

// ---------- Cantilever beam ----------
const UNITS = {
  force: { n: 1, newton: 1, newtons: 1, kn: 1e3, lbf: 4.4482216152605, kip: 4448.2216152605, kips: 4448.2216152605 },
  length: { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, inch: 0.0254, inches: 0.0254, ft: 0.3048, feet: 0.3048 },
  pressure: {
    pa: 1, kpa: 1e3, mpa: 1e6, gpa: 1e9, psi: 6894.757293168, ksi: 6894757.293168, msi: 6894757293.168,
    "n/m^2": 1, "n/mm^2": 1e6,
  },
  inertia: { "m^4": 1, "cm^4": 1e-8, "mm^4": 1e-12, "in^4": 0.0254 ** 4, "ft^4": 0.3048 ** 4 },
};

function parseQty(str, kind, field) {
  const m = String(str).trim().match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([a-z0-9^/*]+)$/i);
  if (!m) throw new Error(`${field}: could not parse '${str}' (expected e.g. '500 N')`);
  const unit = m[2].toLowerCase().replace("**", "^");
  const f = UNITS[kind][unit];
  if (f === undefined)
    throw new Error(`${field}: unknown unit '${m[2]}'. Allowed: ${Object.keys(UNITS[kind]).join(", ")}`);
  return parseFloat(m[1]) * f;
}

function cantilever({ load, length, youngs_modulus, moment_of_inertia }) {
  const P = parseQty(load, "force", "load");
  const L = parseQty(length, "length", "length");
  const E = parseQty(youngs_modulus, "pressure", "youngs_modulus");
  const I = parseQty(moment_of_inertia, "inertia", "moment_of_inertia");
  if (L <= 0 || E <= 0 || I <= 0) throw new Error("length, youngs_modulus and moment_of_inertia must be positive");
  const delta = (P * L ** 3) / (3 * E * I);
  const theta = (P * L ** 2) / (2 * E * I);
  return {
    max_deflection_mm: Number((delta * 1000).toFixed(4)),
    max_deflection_inches: Number((delta / 0.0254).toFixed(5)),
    slope_at_tip_rad: Number(theta.toFixed(6)),
  };
}

// ---------- MCP (JSON-RPC over Streamable HTTP, stateless) ----------
function handleRpc(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

  if (id === undefined || id === null) return null; // notification: no response

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const args = params?.arguments || {};
      try {
        let out;
        if (params?.name === "get_isa_atmosphere") out = isa(Number(args.altitude_m), Number(args.delta_t_c ?? 0));
        else if (params?.name === "cantilever_end_load_deflection") out = cantilever(args);
        else return err(-32602, `Unknown tool: ${params?.name}`);
        return ok({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${method}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const secret = env && env.MCP_PATH_SECRET ? String(env.MCP_PATH_SECRET) : "";
    const mcpPath = secret ? `/mcp/${secret}` : "/mcp";

    if (url.pathname === "/") {
      return new Response("Aeromech Tools MCP server is running.", {
        headers: { "Content-Type": "text/plain", ...CORS },
      });
    }
    // Everything except the MCP endpoint (including /.well-known/oauth-* discovery) must be 404,
    // so Claude knows this server does not use login.
    if (url.pathname !== mcpPath) return new Response("Not Found", { status: 404, headers: CORS });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
    }
    const replies = (Array.isArray(body) ? body : [body]).map(handleRpc).filter(Boolean);
    if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
    return Response.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
  },
};
