import "./App.css";
import { ReactComponent as HisaSvg } from "./hisa.svg";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaLongArrowAltDown, FaLongArrowAltUp } from "react-icons/fa";
import classNames from "classnames";

const getDefaultApiUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  return `${window.location.protocol}//${window.location.hostname}:3001`;
};

const API_URL = (process.env.REACT_APP_API_URL ?? getDefaultApiUrl()).replace(/\/$/, "");
const WS_URL = API_URL.replace(/^http/, "ws");
const MIN_MAP_SCALE = 0.5;
const BASE_MAP_SCALE = 1;
const MAX_MAP_SCALE = 40;
const MAP_WIDTH = 3508;
const MAP_HEIGHT = 4961;
const MAP_DEFAULT_CENTER_X = 1656;
const MAP_DEFAULT_CENTER_Y = 1210;
const DRAG_CLICK_THRESHOLD = 5;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getPointerDistance = ([firstPointer, secondPointer]) =>
  Math.hypot(firstPointer.x - secondPointer.x, firstPointer.y - secondPointer.y);

const getPointerMidpoint = ([firstPointer, secondPointer]) => ({
  x: (firstPointer.x + secondPointer.x) / 2,
  y: (firstPointer.y + secondPointer.y) / 2,
});

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
  const [nameErrorMessage, setNameErrorMessage] = useState("");
  const [mapTransform, setMapTransform] = useState({
    scale: BASE_MAP_SCALE,
    x: 0,
    y: 0,
  });
  const svgRef = useRef(null);
  const mapViewportRef = useRef(null);
  const mapTransformRef = useRef(mapTransform);
  const activePointersRef = useRef(new Map());
  const dragRef = useRef({
    isDragging: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startMapX: 0,
    startMapY: 0,
  });
  const pinchRef = useRef({
    isPinching: false,
    moved: false,
    startDistance: 0,
    startMidpointX: 0,
    startMidpointY: 0,
    startMapX: 0,
    startMapY: 0,
    startScale: BASE_MAP_SCALE,
  });
  const ignoreNextClickRef = useRef(false);

  const getCenteredMapTransform = useCallback(() => {
    const viewport = mapViewportRef.current;

    if (!viewport) {
      return {
        scale: BASE_MAP_SCALE,
        x: 0,
        y: 0,
      };
    }

    const rect = viewport.getBoundingClientRect();

    return {
      scale: BASE_MAP_SCALE,
      x: rect.width / 2 - MAP_DEFAULT_CENTER_X * BASE_MAP_SCALE,
      y: rect.height / 2 - MAP_DEFAULT_CENTER_Y * BASE_MAP_SCALE,
    };
  }, []);

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
    setMapTransform(getCenteredMapTransform());
  }, [getCenteredMapTransform]);

  useEffect(() => {
    mapTransformRef.current = mapTransform;
  }, [mapTransform]);

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
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }

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

  const startMapDrag = useCallback(
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const viewport = mapViewportRef.current;

      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();

      activePointersRef.current.set(event.pointerId, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });

      if (activePointersRef.current.size >= 2) {
        const pointers = [...activePointersRef.current.values()].slice(0, 2);
        const midpoint = getPointerMidpoint(pointers);
        const currentTransform = mapTransformRef.current;

        pinchRef.current = {
          isPinching: true,
          moved: false,
          startDistance: getPointerDistance(pointers),
          startMidpointX: midpoint.x,
          startMidpointY: midpoint.y,
          startMapX: currentTransform.x,
          startMapY: currentTransform.y,
          startScale: currentTransform.scale,
        };

        dragRef.current = {
          ...dragRef.current,
          isDragging: false,
          pointerId: null,
        };
        return;
      }

      const currentTransform = mapTransformRef.current;

      dragRef.current = {
        isDragging: true,
        moved: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startMapX: currentTransform.x,
        startMapY: currentTransform.y,
      };
    },
    [],
  );

  const moveMap = useCallback((event) => {
    if (activePointersRef.current.has(event.pointerId)) {
      const viewport = mapViewportRef.current;

      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();

      activePointersRef.current.set(event.pointerId, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }

    if (activePointersRef.current.size >= 2 && pinchRef.current.isPinching) {
      const pointers = [...activePointersRef.current.values()].slice(0, 2);
      const midpoint = getPointerMidpoint(pointers);
      const distance = getPointerDistance(pointers);
      const pinch = pinchRef.current;

      if (pinch.startDistance === 0) return;

      const scaleRatio = distance / pinch.startDistance;
      const nextScale = clamp(
        pinch.startScale * scaleRatio,
        MIN_MAP_SCALE,
        MAX_MAP_SCALE,
      );
      const clampedScaleRatio = nextScale / pinch.startScale;

      if (
        Math.abs(distance - pinch.startDistance) > DRAG_CLICK_THRESHOLD ||
        Math.hypot(
          midpoint.x - pinch.startMidpointX,
          midpoint.y - pinch.startMidpointY,
        ) > DRAG_CLICK_THRESHOLD
      ) {
        pinch.moved = true;
      }

      setMapTransform({
        scale: nextScale,
        x:
          midpoint.x -
          (pinch.startMidpointX - pinch.startMapX) * clampedScaleRatio,
        y:
          midpoint.y -
          (pinch.startMidpointY - pinch.startMapY) * clampedScaleRatio,
      });
      return;
    }

    const drag = dragRef.current;

    if (!drag.isDragging || drag.pointerId !== event.pointerId) return;

    const nextX = drag.startMapX + event.clientX - drag.startX;
    const nextY = drag.startMapY + event.clientY - drag.startY;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);

    if (distance > DRAG_CLICK_THRESHOLD) {
      drag.moved = true;
    }

    setMapTransform((currentTransform) => ({
      ...currentTransform,
      x: nextX,
      y: nextY,
    }));
  }, []);

  const stopMapDrag = useCallback((event) => {
    activePointersRef.current.delete(event.pointerId);

    if (pinchRef.current.isPinching) {
      ignoreNextClickRef.current = true;
      pinchRef.current = {
        ...pinchRef.current,
        isPinching: false,
      };
      dragRef.current = {
        ...dragRef.current,
        isDragging: false,
        pointerId: null,
      };

      return;
    }

    const drag = dragRef.current;

    if (!drag.isDragging || drag.pointerId !== event.pointerId) return;

    ignoreNextClickRef.current = drag.moved;

    dragRef.current = {
      ...drag,
      isDragging: false,
      pointerId: null,
    };
  }, []);

  const zoomMap = useCallback((event) => {
    event.preventDefault();

    const viewport = mapViewportRef.current;

    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.88;

    setMapTransform((currentTransform) => {
      const nextScale = clamp(
        currentTransform.scale * zoomFactor,
        MIN_MAP_SCALE,
        MAX_MAP_SCALE,
      );
      const scaleRatio = nextScale / currentTransform.scale;

      return {
        scale: nextScale,
        x: cursorX - (cursorX - currentTransform.x) * scaleRatio,
        y: cursorY - (cursorY - currentTransform.y) * scaleRatio,
      };
    });
  }, []);

  const resetMapTransform = useCallback(() => {
    setMapTransform(getCenteredMapTransform());
  }, [getCenteredMapTransform]);

  const saveGuestName = useCallback(
    (event) => {
      event.preventDefault();

      const trimmedName = nameInput.trim();

      if (!trimmedName) {
        setNameErrorMessage("Name is required before booking a bed.");
        return;
      }

      setGuestName(trimmedName);
      setNameErrorMessage("");
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
.App {
  min-height: 100vh;
  overflow: hidden;
}

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
      <div
        className="relative h-[calc(100vh-104px)] overflow-hidden bg-gray-50 touch-none"
        onPointerDown={startMapDrag}
        onPointerMove={moveMap}
        onPointerUp={stopMapDrag}
        onPointerCancel={stopMapDrag}
        onWheel={zoomMap}
        ref={mapViewportRef}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.scale})`,
          }}
        >
          <HisaSvg
            ref={svgRef}
            className="spinner"
            onClick={bookBed}
            style={{
              display: "block",
              height: `${MAP_HEIGHT}px`,
              width: `${MAP_WIDTH}px`,
            }}
          />
        </div>
        <button
          className="absolute bottom-4 right-4 rounded bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow"
          onClick={resetMapTransform}
          type="button"
        >
          Reset view
        </button>
      </div>
      {!guestName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <form
            className="w-full max-w-sm rounded bg-white p-5 text-left shadow-xl"
            onSubmit={saveGuestName}
          >
            <label
              className="mb-2 block text-sm font-semibold text-gray-700"
              htmlFor="guest-name"
            >
              Name
            </label>
            <input
              id="guest-name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-base outline-none focus:border-gray-600"
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value);
                setNameErrorMessage("");
              }}
              autoFocus
            />
            {nameErrorMessage && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {nameErrorMessage}
              </div>
            )}
            <button
              className="mt-4 w-full rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              type="submit"
            >
              Start
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
