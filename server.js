import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createCanvas, registerFont } from "canvas";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

registerFont(join(__dirname, "dist/fonts/HomeVideo-BLG6G.ttf"), { family: "Home Video" });
registerFont(join(__dirname, "dist/fonts/HomeVideoBold-R90Dv.ttf"), { family: "Home Video", weight: "bold" });

const GRADE_COLORS = { A: "#2563EB", B: "#16A34A", C: "#EA580C" };

const app = express();
const port = 3128;

const NYC_OPEN_DATA_URL =
  "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const APP_TOKEN = process.env.NYC_OPEN_DATA_TOKEN || "";

app.use(express.json());
app.use(express.static(join(__dirname, "dist"), { index: false }));

async function searchRestaurants(q) {
  if (!q || q.trim().length < 2) return [];

  const raw = q.trim().toUpperCase().replace(/'/g, "''");
  const words = raw.split(/\s+/).filter((w) => w.length > 0);
  const joined = words.join("");

  const wordClauses = words.map(
    (w) =>
      `(upper(dba) like '%${w}%' OR upper(street) like '%${w}%' OR upper(boro) like '%${w}%' OR zipcode like '%${w}%')`
  );
  const fuzzyClause =
    words.length > 1 ? ` OR upper(dba) like '%${joined}%'` : "";
  const where = `(${wordClauses.join(" AND ")}${fuzzyClause})`;

  const params = new URLSearchParams({
    $where: where,
    $order: "inspection_date DESC",
    $limit: "1000",
  });
  if (APP_TOKEN) params.set("$$app_token", APP_TOKEN);

  const response = await fetch(`${NYC_OPEN_DATA_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`NYC Open Data API error: ${response.status}`);
  }
  const data = await response.json();
  return aggregateRestaurants(data);
}

async function getRestaurantDetails(camis) {
  const params = new URLSearchParams({
    $where: `camis='${camis}'`,
    $order: "inspection_date DESC",
    $limit: "200",
  });
  if (APP_TOKEN) params.set("$$app_token", APP_TOKEN);

  const response = await fetch(`${NYC_OPEN_DATA_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`NYC Open Data API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.length === 0) return null;

  const first = data[0];

  const inspectionMap = new Map();
  for (const row of data) {
    const date = row.inspection_date?.split("T")[0];
    if (!date) continue;
    if (!inspectionMap.has(date)) {
      inspectionMap.set(date, {
        date,
        score: row.score != null ? Number(row.score) : null,
        grade: row.grade || null,
        gradeDate: row.grade_date?.split("T")[0] || null,
        type: row.inspection_type || null,
        violations: [],
      });
    }
    const insp = inspectionMap.get(date);
    if (row.grade && !insp.grade) {
      insp.grade = row.grade;
      insp.gradeDate = row.grade_date?.split("T")[0] || null;
    }
    if (row.score != null && insp.score == null) {
      insp.score = Number(row.score);
    }
    if (row.violation_description) {
      insp.violations.push({
        code: row.violation_code,
        description: row.violation_description,
        critical: row.critical_flag === "Critical",
      });
    }
  }

  const inspections = Array.from(inspectionMap.values()).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const latestGraded = inspections.find((i) => i.grade);

  return {
    camis: first.camis,
    name: first.dba,
    boro: first.boro,
    building: first.building,
    street: first.street,
    zipcode: first.zipcode,
    phone: first.phone,
    cuisine: first.cuisine_description,
    grade: latestGraded?.grade || null,
    score: latestGraded?.score ?? null,
    gradeDate: latestGraded?.gradeDate || null,
    inspections,
  };
}

// Search restaurants by name and/or address
app.get("/api/search", async (req, res) => {
  try {
    const restaurants = await searchRestaurants(req.query.q);
    res.json({ restaurants });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Failed to search restaurants" });
  }
});

// Get details for a specific restaurant by CAMIS ID
app.get("/api/restaurant/:camis", async (req, res) => {
  try {
    const details = await getRestaurantDetails(req.params.camis);
    if (!details) return res.status(404).json({ error: "Restaurant not found" });
    res.json(details);
  } catch (error) {
    console.error("Detail error:", error);
    res.status(500).json({ error: "Failed to fetch restaurant details" });
  }
});

// MCP server: exposes restaurant lookup tools to Claude
function createMcpServer() {
  const server = new McpServer({
    name: "nyc-restaurant-ratings",
    version: "1.0.0",
  });

  server.tool(
    "search_restaurants",
    "Search NYC restaurants by name, street, borough, or zipcode. Returns up to 20 matches with their CAMIS ID, address, cuisine, and most recent DOHMH letter grade (A/B/C).",
    { query: z.string().min(2).describe("Search terms — e.g. 'sweetgreen brooklyn', 'joe's pizza', '10013'") },
    async ({ query }) => {
      const restaurants = await searchRestaurants(query);
      const trimmed = restaurants.slice(0, 20);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: trimmed.length,
            total: restaurants.length,
            restaurants: trimmed,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "get_restaurant",
    "Get full inspection history for a NYC restaurant by CAMIS ID (obtained from search_restaurants). Includes every inspection date, score, grade, and individual violations.",
    { camis: z.string().describe("CAMIS ID from search_restaurants results") },
    async ({ camis }) => {
      const details = await getRestaurantDetails(camis);
      if (!details) {
        return {
          content: [{ type: "text", text: `No restaurant found with CAMIS ${camis}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
      };
    }
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

function aggregateRestaurants(rows) {
  const map = new Map();

  for (const row of rows) {
    const camis = row.camis;
    if (!map.has(camis)) {
      map.set(camis, {
        camis,
        name: row.dba,
        boro: row.boro,
        building: row.building,
        street: row.street,
        zipcode: row.zipcode,
        cuisine: row.cuisine_description,
        grade: null,
        score: null,
        gradeDate: null,
        latestInspection: null,
      });
    }

    const restaurant = map.get(camis);
    const inspDate = row.inspection_date?.split("T")[0];

    if (
      inspDate &&
      (!restaurant.latestInspection ||
        inspDate > restaurant.latestInspection)
    ) {
      restaurant.latestInspection = inspDate;
      if (row.score != null) {
        restaurant.score = Number(row.score);
      }
    }

    // Keep the most recent grade
    if (row.grade && (!restaurant.gradeDate || inspDate > restaurant.gradeDate)) {
      restaurant.grade = row.grade;
      restaurant.gradeDate = inspDate;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Sort: graded first, then by name
    if (a.grade && !b.grade) return -1;
    if (!a.grade && b.grade) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Generate static OG images at startup
function generateOgImages() {
  const ogDir = join(__dirname, "dist/og");
  mkdirSync(ogDir, { recursive: true });

  const grades = [
    { key: "a", letter: "A", color: GRADE_COLORS.A },
    { key: "b", letter: "B", color: GRADE_COLORS.B },
    { key: "c", letter: "C", color: GRADE_COLORS.C },
    { key: "unknown", letter: "?", color: "#111" },
  ];

  const W = 1200, H = 630;
  const boxSize = 340;
  const border = 20;

  for (const { key, letter, color } of grades) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    const boxX = W / 2 - boxSize / 2;
    const boxY = H / 2 - boxSize / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = border;
    ctx.strokeRect(boxX, boxY, boxSize, boxSize);

    ctx.fillStyle = color;
    ctx.font = '200px "Home Video"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, W / 2, H / 2);

    writeFileSync(join(ogDir, `${key}.png`), canvas.toBuffer("image/png"));
  }

  // Homepage OG: A B C side by side
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const homeBoxSize = 200;
  const homeGap = 100;
  const totalWidth = homeBoxSize * 3 + homeGap * 2;
  const startX = W / 2 - totalWidth / 2;
  const boxY = H / 2 - homeBoxSize / 2;

  for (let i = 0; i < 3; i++) {
    const { letter, color } = grades[i];
    const boxX = startX + i * (homeBoxSize + homeGap);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.round(border * homeBoxSize / boxSize);
    ctx.strokeRect(boxX, boxY, homeBoxSize, homeBoxSize);
    ctx.fillStyle = color;
    ctx.font = '120px "Home Video"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, boxX + homeBoxSize / 2, boxY + homeBoxSize / 2);
  }

  writeFileSync(join(ogDir, "home.png"), canvas.toBuffer("image/png"));
}

generateOgImages();

// SPA fallback with OG meta injection
const indexHtml = readFileSync(join(__dirname, "dist", "index.html"), "utf-8");

app.get("*", async (req, res) => {
  const match = req.path.match(/^\/restaurant\/(\d+)/);
  if (!match) {
    const homeOgTags = `
    <meta property="og:title" content="NYC Restaurant Ratings" />
    <meta property="og:description" content="Search NYC restaurant health inspection grades" />
    <meta property="og:image" content="${req.protocol}://${req.get("host")}/og/home.png" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${req.protocol}://${req.get("host")}/og/home.png" />`;
    return res.send(indexHtml.replace("</head>", `${homeOgTags}\n</head>`));
  }

  const camis = match[1];
  try {
    const params = new URLSearchParams({
      $where: `camis='${camis}'`,
      $order: "inspection_date DESC",
      $limit: "5",
    });
    if (APP_TOKEN) params.set("$$app_token", APP_TOKEN);
    const response = await fetch(`${NYC_OPEN_DATA_URL}?${params}`);
    const data = await response.json();

    if (!data.length) return res.send(indexHtml);

    const first = data[0];
    const name = first.dba || "Restaurant";
    const titleCase = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const address = `${first.building || ""} ${first.street || ""}`.trim();
    const boro = (first.boro || "").toUpperCase();
    const grade = data.find((r) => r.grade)?.grade || "";
    const gradeText = grade && ["A", "B", "C"].includes(grade) ? ` – Grade ${grade}` : "";

    const ogUrl = `${req.protocol}://${req.get("host")}${req.path}`;
    const ogKey = ["A", "B", "C"].includes(grade) ? grade.toLowerCase() : "unknown";
    const ogImage = `${req.protocol}://${req.get("host")}/og/${ogKey}.png`;
    const description = `${address} * ${boro}${gradeText}`;

    const ogTags = `
    <meta property="og:title" content="${titleCase} – NYC Restaurant Ratings" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleCase} – NYC Restaurant Ratings" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />`;

    const html = indexHtml.replace("</head>", `${ogTags}\n</head>`);
    res.send(html);
  } catch {
    res.send(indexHtml);
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
