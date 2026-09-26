import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { ArticleAd, EzoicAdsProvider } from "./Ezoic";
const config = jest.requireMock("./ezoic-config");

let mockPathname = "/articles/first";
const mockMount = jest.fn();
const mockUnmount = jest.fn();

jest.mock("next/navigation", () => ({
    usePathname: () => mockPathname,
}));
jest.mock("./ezoic-config", () => ({ EZOIC_ENABLED: true }));
jest.mock("next/script", () => ({
    __esModule: true,
    default: () => <div data-testid="adsense-script" />,
}));
jest.mock("@ezoic/react-sdk", () => {
    const React = jest.requireActual("react");
    return {
        EzoicProvider: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="ezoic-provider">{children}</div>
        ),
        EzoicAd: ({ location }: { location: string }) => {
            React.useEffect(() => {
                mockMount(location);
                return () => mockUnmount(location);
            }, [location]);
            return <div data-testid="ezoic-ad">{location}</div>;
        },
    };
});

beforeEach(() => {
    jest.replaceProperty(config, "EZOIC_ENABLED", true);
    mockPathname = "/articles/first";
    mockMount.mockClear();
    mockUnmount.mockClear();
});

afterEach(() => jest.restoreAllMocks());

test("disabled integration preserves content without loading the provider or ads", () => {
    jest.replaceProperty(config, "EZOIC_ENABLED", false);
    render(
        <EzoicAdsProvider>
            <p>Article content</p>
            <ArticleAd location="top_of_page" />
        </EzoicAdsProvider>,
    );
    expect(screen.getByText("Article content")).toBeInTheDocument();
    expect(screen.queryByTestId("ezoic-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ezoic-ad")).not.toBeInTheDocument();
});

test("navigation remounts placements once and normal rerenders do not", () => {
    const { rerender, unmount } = render(<ArticleAd location="top_of_page" />);
    expect(mockMount).toHaveBeenCalledTimes(1);
    rerender(<ArticleAd location="top_of_page" />);
    expect(mockMount).toHaveBeenCalledTimes(1);
    expect(mockUnmount).not.toHaveBeenCalled();

    mockPathname = "/articles/second";
    rerender(<ArticleAd location="top_of_page" />);
    expect(mockUnmount).toHaveBeenCalledTimes(1);
    expect(mockMount).toHaveBeenCalledTimes(2);
    unmount();
    expect(mockUnmount).toHaveBeenCalledTimes(2);
});

test("enabled integration renders both article placements under the provider", () => {
    render(
        <EzoicAdsProvider>
            <ArticleAd location="top_of_page" />
            <ArticleAd location="bottom_of_page" />
        </EzoicAdsProvider>,
    );
    expect(screen.getByTestId("ezoic-provider")).toBeInTheDocument();
    expect(
        screen.getAllByRole("complementary", { name: "Advertisement" }),
    ).toHaveLength(2);
    expect(mockMount.mock.calls).toEqual([["top_of_page"], ["bottom_of_page"]]);
});

test("Ezoic suppresses the direct AdSense script", () => {
    const previousClientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = "ca-pub-1234567890123456";
    try {
        jest.isolateModules(() => {
            const { GoogleAdSenseScript } = require("./AdSense");
            const { rerender } = render(<GoogleAdSenseScript />);
            expect(
                screen.queryByTestId("adsense-script"),
            ).not.toBeInTheDocument();
            jest.replaceProperty(config, "EZOIC_ENABLED", false);
            rerender(<GoogleAdSenseScript />);
            expect(screen.getByTestId("adsense-script")).toBeInTheDocument();
        });
    } finally {
        if (previousClientId === undefined) {
            delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
        } else {
            process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = previousClientId;
        }
    }
});
