import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./hisa.svg", () => ({
  ReactComponent: () => <svg data-testid="house-map" />,
}));

test("renders floor controls", () => {
  render(<App />);
  expect(screen.getByText(/nadstropje/i)).toBeInTheDocument();
});
