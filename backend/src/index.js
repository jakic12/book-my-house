import express from "express";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const currentDir = dirname(fileURLToPath(import.meta.url));
const bookingsFilePath = join(currentDir, "..", "data", "bookings.json");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
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

    if (!file.trim()) {
      return [];
    }

    const bookings = JSON.parse(file);

    if (!Array.isArray(bookings)) {
      return [];
    }

    return bookings;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    if (error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
};

const saveBookings = async (bookings) => {
  await mkdir(dirname(bookingsFilePath), { recursive: true });
  await writeFile(bookingsFilePath, `${JSON.stringify(bookings, null, 2)}\n`);
};

const normalizeName = (body) => {
  if (typeof body.name !== "string") {
    return "";
  }

  return body.name.trim();
};

const getNameKey = (name) => (typeof name === "string" ? name.trim().toLowerCase() : "");

const createBooking = async (body) => {
  const name = normalizeName(body);
  const bedSlug = typeof body.slug === "string" ? body.slug.trim() : "";

  if (!name) {
    return {
      statusCode: 400,
      error: "Name is required"
    };
  }

  if (!bedSlug) {
    return {
      statusCode: 400,
      error: "Bed slug is required"
    };
  }

  const bookings = await readBookings();
  const nameAlreadyHasBooking = bookings.some(
    (booking) => getNameKey(booking.name) === getNameKey(name)
  );

  if (nameAlreadyHasBooking) {
    return {
      statusCode: 409,
      error: "You already booked a bed"
    };
  }

  const bedIsAlreadyBooked = bookings.some((booking) => booking.bedSlug === bedSlug);

  if (bedIsAlreadyBooked) {
    return {
      statusCode: 409,
      error: "Bed is already booked"
    };
  }

  const booking = {
    name,
    bedSlug
  };

  bookings.push(booking);
  await saveBookings(bookings);

  return {
    statusCode: 201,
    booking
  };
};

const deleteBooking = async (bedSlug, body) => {
  const name = normalizeName(body);
  const normalizedBedSlug = typeof bedSlug === "string" ? bedSlug.trim() : "";

  if (!name) {
    return {
      statusCode: 400,
      error: "Name is required"
    };
  }

  if (!normalizedBedSlug) {
    return {
      statusCode: 400,
      error: "Bed slug is required"
    };
  }

  const bookings = await readBookings();
  const booking = bookings.find(
    (currentBooking) => currentBooking.bedSlug === normalizedBedSlug
  );

  if (!booking) {
    return {
      statusCode: 404,
      error: "Booking was not found"
    };
  }

  if (getNameKey(booking.name) !== getNameKey(name)) {
    return {
      statusCode: 403,
      error: "You can only remove your own booking"
    };
  }

  const nextBookings = bookings.filter(
    (currentBooking) => currentBooking.bedSlug !== normalizedBedSlug
  );

  await saveBookings(nextBookings);

  return {
    statusCode: 200,
    booking
  };
};

const sendSocketMessage = (socket, message) => {
  socket.send(JSON.stringify(message));
};

const broadcastSocketMessage = (message) => {
  const payload = JSON.stringify(message);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
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
    const result = await createBooking(req.body);

    if (result.error) {
      res.status(result.statusCode).json({
        error: result.error
      });
      return;
    }

    broadcastSocketMessage({
      type: "booking_created",
      booking: result.booking
    });

    res.status(result.statusCode).json({
      booking: result.booking
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/bookings/:slug", async (req, res, next) => {
  try {
    const result = await deleteBooking(req.params.slug, req.body);

    if (result.error) {
      res.status(result.statusCode).json({
        error: result.error
      });
      return;
    }

    broadcastSocketMessage({
      type: "booking_deleted",
      booking: result.booking
    });

    res.status(result.statusCode).json({
      booking: result.booking
    });
  } catch (error) {
    next(error);
  }
});

wss.on("connection", async (socket) => {
  sendSocketMessage(socket, {
    type: "connected"
  });

  try {
    const bookings = await readBookings();
    sendSocketMessage(socket, {
      type: "bookings",
      bookings
    });
  } catch (error) {
    sendSocketMessage(socket, {
      type: "error",
      error: "Could not load bookings"
    });
  }

  socket.on("message", async (message) => {
    try {
      const body = JSON.parse(message.toString());

      if (body.type !== "book_bed") {
        sendSocketMessage(socket, {
          type: "error",
          error: "Unknown message type"
        });
        return;
      }

      const result = await createBooking(body);

      if (result.error) {
        sendSocketMessage(socket, {
          type: "booking_error",
          statusCode: result.statusCode,
          error: result.error
        });
        return;
      }

      broadcastSocketMessage({
        type: "booking_created",
        booking: result.booking
      });
    } catch (error) {
      sendSocketMessage(socket, {
        type: "error",
        error: "Invalid message"
      });
    }
  });
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

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`WebSocket listening on ws://localhost:${port}`);
});
