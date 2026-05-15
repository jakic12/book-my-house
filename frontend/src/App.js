import logo from "./logo.svg";
import "./App.css";
import { ReactComponent as HisaSvg } from "./hisa.svg";
import { useEffect, useRef, useState } from "react";
import { FaLongArrowAltDown, FaLongArrowAltUp } from "react-icons/fa";
import classNames from "classnames";

function App() {
  const [floor, setFloor] = useState(1);
  const svgRef = useRef(null);
  const show_beds = [`bed-dominik-1`, `bed-dominik-0`];

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

      bed.appendChild(rect);
    });
  }, []);

  return (
    <div className="App">
      <style>{`
.lvl-2 {
  ${floor == 2 ? "" : "display: none;"}
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

${show_beds.map((x) => `#${x} use`).join(", ")} {
  opacity: 1 !important;
  display:block !important;
}
${show_beds.map((x) => `#${x} .bed-border`).join(", ")} {
  display:none !important;
}
      `}</style>
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm rounded-b-lg">
        <div className="text-lg font-semibold text-gray-700">Nadstropje:</div>

        <div className="flex items-center gap-4 bg-gray-100 px-4 py-2 rounded-full">
          <button
            className={classNames("text-gray-600 transition", {
              "text-gray-200": floor == 1,
              "hover:text-black": floor != 1,
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
              "text-gray-200": floor == 2,
              "hover:text-black": floor != 2,
            })}
            disabled={floor == 2}
          >
            <FaLongArrowAltUp
              onClick={() => setFloor(Math.min(floor + 1, 2))}
            />
          </button>
        </div>
      </header>
      <HisaSvg ref={svgRef} className="spinner" />
    </div>
  );
}

export default App;
