import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FromAppProvider } from "./providers/FromAppProvider";
import App from "./App";
import ApiUtils from "./api/apiUtils";

jest.mock("./navigation/LoginStack", () => ({
  __esModule: true,
  LoginStackName: "/LoginStack",
  default: function LoginStackMock() {
    return <div>LoginStack</div>;
  },
}));

jest.mock("./navigation/AdminStack", () => ({
  __esModule: true,
  AdminStackName: "/AdminStack",
  default: function AdminStackMock() {
    return <div>AdminStack</div>;
  },
}));

jest.mock("./navigation/ClientStack", () => ({
  __esModule: true,
  ClientStackName: "/ClientStack",
  default: function ClientStackMock() {
    return <div>ClientStack</div>;
  },
}));

jest.mock("./screens/otpScreen/OtpScreen.js/LoginOtpScreen", () => ({
  __esModule: true,
  AppRoles: { Admin: "Admin", Customer: "Customer" },
}));

jest.mock("./screens/mainScreen/MainScreen", () => ({
  __esModule: true,
  MainScreenName: "/MainScreen",
}));

jest.mock("./screens/client/clientMainScreen/ClientMainScreen", () => ({
  __esModule: true,
  ClientMainScreenName: "/ClientMainScreen",
}));

test("renders App routes without crashing", async () => {
  jest.spyOn(ApiUtils, "get").mockResolvedValue({ data: {} });
  render(
    <FromAppProvider>
      <MemoryRouter initialEntries={["/LoginStack"]}>
        <App />
      </MemoryRouter>
    </FromAppProvider>
  );

  expect(await screen.findByText("LoginStack")).toBeInTheDocument();
});
