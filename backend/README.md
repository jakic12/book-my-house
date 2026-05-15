# Book My House Backend

Basic Node.js backend starter using Express.

## Getting Started

```sh
npm install
npm run dev
```

The API will be available at `http://localhost:3000`.

## Scripts

- `npm start` starts the server.
- `npm run dev` starts the server with Node watch mode.

## Endpoints

- `GET /` returns a welcome message.
- `GET /health` returns a health check.
- `GET /bookings` returns saved bed bookings.
- `POST /bookings` saves a bed booking.

## Booking Payload

Send a booking from the frontend like this:

```json
{
  "names": ["Matej", "Jakob"],
  "slug": "bed-1"
}
```

For one person, this also works:

```json
{
  "name": "Matej",
  "slug": "bed-1"
}
```

Bookings are saved locally to `data/bookings.json`.
The `slug` is treated as the unique bed identifier. Sending another booking with the same `slug` updates that bed's saved names.
