import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const currentDir = dirname(fileURLToPath(import.meta.url));
const bookingsFilePath = join(currentDir, "..", "data", "bookings.json");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

const readBookings = async () => {
  try {
    const file = await readFile(bookingsFilePath, "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const saveBookings = async (bookings) => {
  await mkdir(dirname(bookingsFilePath), { recursive: true });
  await writeFile(bookingsFilePath, `${JSON.stringify(bookings, null, 2)}\n`);
};

const normalizeNames = (body) => {
  const incomingNames = body.names ?? body.name;
  const names = Array.isArray(incomingNames) ? incomingNames : [incomingNames];

  return names
    .filter((name) => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean);
};

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Book My House API"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.get("/bookings", async (req, res, next) => {
  try {
    const bookings = await readBookings();
    res.json({
      bookings
    });
  } catch (error) {
    next(error);
  }
});

app.post("/bookings", async (req, res, next) => {
  try {
    const names = normalizeNames(req.body);
    const bedSlug = typeof req.body.slug === "string" ? req.body.slug.trim() : "";

    if (names.length === 0) {
      res.status(400).json({
        error: "At least one name is required"
      });
      return;
    }

    if (!bedSlug) {
      res.status(400).json({
        error: "Bed slug is required"
      });
      return;
    }

    const bookings = await readBookings();
    const existingBookingIndex = bookings.findIndex((booking) => booking.bedSlug === bedSlug);
    const booking = {
      names,
      bedSlug,
      createdAt: new Date().toISOString()
    };

    if (existingBookingIndex === -1) {
      bookings.push(booking);
    } else {
      bookings[existingBookingIndex] = booking;
    }

    await saveBookings(bookings);

    res.status(existingBookingIndex === -1 ? 201 : 200).json({
      booking
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not found"
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
