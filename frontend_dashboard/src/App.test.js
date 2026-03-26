import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Energy Insights platform banner", () => {
  render(<App />);
  // Query a unique element: the sidebar brand banner has an accessible label.
  const banner = screen.getByRole("banner", { name: /Energy Insights Platform/i });
  expect(banner).toBeInTheDocument();
});
