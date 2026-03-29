import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createCanvas, registerFont } from "canvas";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

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
app.use(express.static(join(__dirname, "dist")));

// Search restaurants by name and/or address
app.get("/api/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ restaurants: [] });
    }

    const raw = q.trim().toUpperCase().replace(/'/g, "''");
    const words = raw.split(/\s+/).filter((w) => w.length > 0);
    const joined = words.join("");

    // Each word must appear in name OR address fields
    const wordClauses = words.map(
      (w) =>
        `(upper(dba) like '%${w}%' OR upper(street) like '%${w}%' OR upper(boro) like '%${w}%' OR zipcode like '%${w}%')`
    );

    // Also match the no-spaces version against the name (sweet green -> sweetgreen)
    const fuzzyClause =
      words.length > 1 ? ` OR upper(dba) like '%${joined}%'` : "";

    const where = `(${wordClauses.join(" AND ")}${fuzzyClause})`;

    const params = new URLSearchParams({
      $where: where,
      $order: "inspection_date DESC",
      $limit: "1000",
    });

    if (APP_TOKEN) {
      params.set("$$app_token", APP_TOKEN);
    }

    const response = await fetch(`${NYC_OPEN_DATA_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`NYC Open Data API error: ${response.status}`);
    }

    const data = await response.json();
    const restaurants = aggregateRestaurants(data);

    res.json({ restaurants });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Failed to search restaurants" });
  }
});

// Get details for a specific restaurant by CAMIS ID
app.get("/api/restaurant/:camis", async (req, res) => {
  try {
    const { camis } = req.params;

    const params = new URLSearchParams({
      $where: `camis='${camis}'`,
      $order: "inspection_date DESC",
      $limit: "200",
    });

    if (APP_TOKEN) {
      params.set("$$app_token", APP_TOKEN);
    }

    const response = await fetch(`${NYC_OPEN_DATA_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`NYC Open Data API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const first = data[0];

    // Group inspections by date
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

    // Find latest grade
    const latestGraded = inspections.find((i) => i.grade);

    res.json({
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
    });
  } catch (error) {
    console.error("Detail error:", error);
    res.status(500).json({ error: "Failed to fetch restaurant details" });
  }
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
}

generateOgImages();

// SPA fallback with OG meta injection
const indexHtml = readFileSync(join(__dirname, "dist", "index.html"), "utf-8");

app.get("*", async (req, res) => {
  const match = req.path.match(/^\/restaurant\/(\d+)/);
  if (!match) return res.send(indexHtml);

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
    const gradeText = grade && ["A", "B", "C"].includes(grade) ? ` — Grade ${grade}` : "";

    const ogUrl = `${req.protocol}://${req.get("host")}${req.path}`;
    const ogKey = ["A", "B", "C"].includes(grade) ? grade.toLowerCase() : "unknown";
    const ogImage = `${req.protocol}://${req.get("host")}/og/${ogKey}.png`;
    const description = `${address} * ${boro}${gradeText}`;

    const ogTags = `
    <meta property="og:title" content="${titleCase} — NYC Restaurant Ratings" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleCase} — NYC Restaurant Ratings" />
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
