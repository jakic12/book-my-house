import express from "express";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const app = express();

app.use(express.json());

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

app.use((req, res) => {
  res.status(404).json({
    error: "Not found"
  });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
