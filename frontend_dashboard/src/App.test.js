import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Energy Insights title", () => {
  render(<App />);
  const title = screen.getByText(/Energy Insights/i);
  expect(title).toBeInTheDocument();
});
