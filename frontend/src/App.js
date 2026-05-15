import "./App.css";
import { ReactComponent as HisaSvg } from "./hisa.svg";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaLongArrowAltDown, FaLongArrowAltUp } from "react-icons/fa";
import classNames from "classnames";

const API_URL = (process.env.REACT_APP_API_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);
const WS_URL = API_URL.replace(/^http/, "ws");

const getOccupiedBedSlugs = (bookings) => {
  if (!Array.isArray(bookings)) return [];

  return [
    ...new Set(
      bookings
        .map((booking) => booking.bedSlug)
        .filter((bedSlug) => typeof bedSlug === "string" && bedSlug),
    ),
  ];
};

const getBookingForName = (bookings, name) => {
  if (!Array.isArray(bookings) || !name) return null;

  return bookings.find(
    (booking) =>
      typeof booking.name === "string" &&
      booking.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
};

const getBookingsByBed = (bookings) => {
  if (!Array.isArray(bookings)) return {};

  return bookings.reduce((bookingsByBed, booking) => {
    if (
      typeof booking.bedSlug === "string" &&
      booking.bedSlug &&
      typeof booking.name === "string" &&
      booking.name
    ) {
      bookingsByBed[booking.bedSlug] = booking.name;
    }

    return bookingsByBed;
  }, {});
};

function App() {
  const [floor, setFloor] = useState(1);
  const [nameInput, setNameInput] = useState("");
  const [guestName, setGuestName] = useState("");
  const [occupiedBeds, setOccupiedBeds] = useState([]);
  const [bookingsByBed, setBookingsByBed] = useState({});
  const [selectedBed, setSelectedBed] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const svgRef = useRef(null);

  const markBedOccupied = useCallback((bedSlug, name) => {
    setOccupiedBeds((currentBeds) => [
      ...new Set([...currentBeds, bedSlug]),
    ]);

    if (name) {
      setBookingsByBed((currentBookings) => ({
        ...currentBookings,
        [bedSlug]: name,
      }));
    }
  }, []);

  const markBedAvailable = useCallback((bedSlug) => {
    setOccupiedBeds((currentBeds) =>
      currentBeds.filter((currentBed) => currentBed !== bedSlug),
    );
    setBookingsByBed((currentBookings) => {
      const nextBookings = { ...currentBookings };
      delete nextBookings[bedSlug];
      return nextBookings;
    });
    setSelectedBed((currentBed) => (currentBed === bedSlug ? "" : currentBed));
  }, []);

  const applyBookings = useCallback(
    (bookings) => {
      setOccupiedBeds(getOccupiedBedSlugs(bookings));
      setBookingsByBed(getBookingsByBed(bookings));

      const booking = getBookingForName(bookings, guestName);

      if (booking?.bedSlug) {
        setSelectedBed(booking.bedSlug);
      } else {
        setSelectedBed("");
      }
    },
    [guestName],
  );

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) return;

    const beds = svg.querySelectorAll(".bed");

    beds.forEach((bed) => {
      const use = bed.querySelector("use");

      if (!use) return;

      // hide image
      use.style.opacity = "0";

      // create border
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );

      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");
      rect.setAttribute("rx", "30px");
      rect.setAttribute("ry", "30px");
      rect.setAttribute("width", "825");
      rect.setAttribute("height", "500");
      rect.setAttribute("class", "bed-border");

      if (!bed.querySelector(".bed-border")) {
        bed.appendChild(rect);
      }

      if (!bed.querySelector(".bed-name")) {
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );

        text.setAttribute("x", "412.5");
        text.setAttribute("y", "250");
        text.setAttribute("class", "bed-name");

        bed.appendChild(text);
      }
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;

    if (!svg) return;

    const beds = svg.querySelectorAll(".bed");

    beds.forEach((bed) => {
      const text = bed.querySelector(".bed-name");

      if (!text) return;

      text.textContent = bookingsByBed[bed.id] ?? "";
    });
  }, [bookingsByBed]);

  useEffect(() => {
    if (typeof fetch !== "function") return;

    let isMounted = true;

    fetch(`${API_URL}/bookings`)
      .then((response) => response.json())
      .then((data) => {
        if (isMounted) {
          applyBookings(data.bookings);
        }
      })
      .catch((error) => {
        console.error("Could not load bookings", error);
      });

    return () => {
      isMounted = false;
    };
  }, [applyBookings]);

  useEffect(() => {
    if (typeof WebSocket !== "function") return;

    const socket = new WebSocket(WS_URL);

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "bookings") {
          applyBookings(data.bookings);
          return;
        }

        if (data.type === "booking_created" && data.booking?.bedSlug) {
          markBedOccupied(data.booking.bedSlug, data.booking.name);
        }

        if (data.type === "booking_deleted" && data.booking?.bedSlug) {
          markBedAvailable(data.booking.bedSlug);
        }
      } catch (error) {
        console.error("Could not read booking update", error);
      }
    });

    return () => {
      socket.close();
    };
  }, [applyBookings, markBedAvailable, markBedOccupied]);

  const bookBed = useCallback(
    async (event) => {
      const bed = event.target.closest(".bed");

      if (!bed?.id) return;

      if (!guestName) {
        setErrorMessage("Name is required before booking a bed.");
        return;
      }

      if (occupiedBeds.includes(bed.id)) {
        setErrorMessage("This bed is already occupied.");
        return;
      }

      if (selectedBed) {
        setErrorMessage("You can only book one bed.");
        return;
      }

      const confirmed = window.confirm(
        `Are you sure you want to book ${bed.id}?`,
      );

      if (!confirmed) return;

      try {
        const response = await fetch(`${API_URL}/bookings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: guestName,
            slug: bed.id,
          }),
        });

        if (response.ok) {
          markBedOccupied(bed.id, guestName);
          setSelectedBed(bed.id);
          setErrorMessage("");
          return;
        }

        const data = await response.json();

        if (response.status === 409 && data.error === "Bed is already booked") {
          markBedOccupied(bed.id, data.booking?.name);
        }

        setErrorMessage(data.error ?? "Could not book bed.");
      } catch (error) {
        setErrorMessage("Could not book bed.");
        console.error("Could not book bed", error);
      }
    },
    [guestName, markBedOccupied, occupiedBeds, selectedBed],
  );

  const saveGuestName = useCallback(
    (event) => {
      event.preventDefault();

      const trimmedName = nameInput.trim();

      if (!trimmedName) {
        setErrorMessage("Name is required before booking a bed.");
        return;
      }

      setGuestName(trimmedName);
      setErrorMessage("");
    },
    [nameInput],
  );

  const removeBooking = useCallback(async () => {
    if (!guestName || !selectedBed) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove your booking for ${selectedBed}?`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_URL}/bookings/${encodeURIComponent(selectedBed)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: guestName,
          }),
        },
      );

      if (response.ok || response.status === 404) {
        markBedAvailable(selectedBed);
        setErrorMessage("");
        return;
      }

      const data = await response.json();
      setErrorMessage(data.error ?? "Could not remove booking.");
    } catch (error) {
      setErrorMessage("Could not remove booking.");
      console.error("Could not remove booking", error);
    }
  }, [guestName, markBedAvailable, selectedBed]);

  const occupiedBedStyles = useMemo(() => {
    if (occupiedBeds.length === 0) {
      return "";
    }

    return `
${occupiedBeds.map((x) => `#${x} use`).join(", ")} {
  opacity: 1 !important;
  display:block !important;
}
${occupiedBeds.map((x) => `#${x} .bed-border`).join(", ")} {
  display:none !important;
}
${occupiedBeds.map((x) => `#${x} .bed-name`).join(", ")} {
  display: block;
}
    `;
  }, [occupiedBeds]);

  return (
    <div className="App">
      <style>{`
.lvl-2 {
  ${floor === 2 ? "" : "display: none;"}
}

.bed {
  fill: none;
  stroke: transparent;
  stroke-width: 10;
}

.bed:hover {
  stroke: black;
}

.bed-border {
  stroke: red;
  stroke-width: 10;
  fill: none;
  stroke-linecap: round;
  stroke-dasharray: 20 50;
}

.bed:hover .bed-border {
  stroke: black;
  fill: black;
  stroke-dasharray: 0 0;
  cursor: pointer;
}

.bed-name {
  display: none;
  fill: white;
  font-size: 80px;
  font-weight: 700;
  paint-order: stroke;
  pointer-events: none;
  stroke: black;
  stroke-linejoin: round;
  stroke-width: 18px;
  text-anchor: middle;
  dominant-baseline: middle;
}

${occupiedBedStyles}
      `}</style>
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm rounded-b-lg">
        <div className="flex flex-col items-start">
          <div className="text-lg font-semibold text-gray-700">Nadstropje:</div>
          {guestName && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>
                {guestName}
                {selectedBed ? ` - ${selectedBed}` : ""}
              </span>
              {selectedBed && (
                <button
                  className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  onClick={removeBooking}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 bg-gray-100 px-4 py-2 rounded-full">
          <button
            className={classNames("text-gray-600 transition", {
              "text-gray-200": floor === 1,
              "hover:text-black": floor !== 1,
            })}
          >
            <FaLongArrowAltDown
              onClick={() => setFloor(Math.max(floor - 1, 1))}
            />
          </button>

          <span className="text-lg font-bold text-gray-800 w-6 text-center">
            {floor}
          </span>

          <button
            className={classNames("text-gray-600 transition", {
              "text-gray-200": floor === 2,
              "hover:text-black": floor !== 2,
            })}
            disabled={floor === 2}
          >
            <FaLongArrowAltUp
              onClick={() => setFloor(Math.min(floor + 1, 2))}
            />
          </button>
        </div>
      </header>
      {errorMessage && (
        <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}
      {!guestName && (
        <form
          className="mx-6 mt-4 flex items-center gap-3 rounded border border-gray-200 bg-white px-4 py-3 shadow-sm"
          onSubmit={saveGuestName}
        >
          <label className="text-sm font-medium text-gray-700" htmlFor="guest-name">
            Name
          </label>
          <input
            id="guest-name"
            className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            autoFocus
          />
          <button
            className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Start
          </button>
        </form>
      )}
      <HisaSvg ref={svgRef} className="spinner" onClick={bookBed} />
    </div>
  );
}

export default App;
