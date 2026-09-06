import {render, waitFor} from "@testing-library/react";
import {BrowserRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import App from "./App";

const {getCurrentUser, ensureCsrfToken} = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    ensureCsrfToken: vi.fn(),
}));

vi.mock("@/utils/api", () => ({
    ensureCsrfToken,
    authApi: {
        getCurrentUser,
        login: vi.fn(),
        beginDiscoverableAuth: vi.fn(),
        completeDiscoverableAuth: vi.fn(),
        verify2FA: vi.fn(),
        logout: vi.fn(),
    },
}));

describe("App", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureCsrfToken.mockResolvedValue(undefined);
        getCurrentUser.mockResolvedValue({success: false});
    });

    it("renders without crashing", async () => {
        const {container} = render(
            <BrowserRouter>
                <App />
            </BrowserRouter>,
        );

        await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
        expect(container).toBeTruthy();
    });

    it("has valid document structure", async () => {
        const {container} = render(
            <BrowserRouter>
                <App />
            </BrowserRouter>,
        );

        await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));
        expect(container.firstChild).toBeTruthy();
    });
});
