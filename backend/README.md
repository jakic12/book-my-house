# Book My House Backend

Basic Node.js backend starter using Express.

## Getting Started

```sh
npm install
npm run dev
```

The API will be available at `http://localhost:3001`.

## Scripts

- `npm start` starts the server.
- `npm run dev` starts the server with Node watch mode.

## Endpoints

- `GET /` returns a welcome message.
- `GET /health` returns a health check.
- `GET /bookings` returns saved bed bookings.
- `POST /bookings` saves a bed booking.
- `DELETE /bookings/:slug` removes a bed booking for the given name.

## WebSocket

Connect to:

```text
ws://localhost:3001
```

Send this message to book a bed:

```json
{
  "type": "book_bed",
  "name": "Matej",
  "slug": "bed-1"
}
```

If the bed is free, every connected client receives:

```json
{
  "type": "booking_created",
  "booking": {
    "name": "Matej",
    "bedSlug": "bed-1"
  }
}“
```

If the bed is already booked, the sender receives:

```json
{
  "type": "booking_error",
  "statusCode": 409,
  "error": "Bed is already booked"
}
```

## Booking Payload

Send a booking from the frontend like this:

```json
{
  "name": "Matej",
  "slug": "bed-1"
}
```

Bookings are saved locally to `data/bookings.json`.
The `slug` is treated as the unique bed identifier. Sending another booking with the same `slug` returns a `409` error because that bed is already booked.

Remove a booking from the frontend like this:

```json
{
  "name": "Matej"
}
```

Send it to `DELETE /bookings/bed-1`. Only the person who booked the bed can remove that booking.
