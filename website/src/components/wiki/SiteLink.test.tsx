import { render, screen } from "@testing-library/react";
import { navigateToSite, SiteLink } from "./SiteLink";

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ href, children }: { href: string; children: string }) => (
        <a href={href} data-client-navigation="true">
            {children}
        </a>
    ),
}));

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe("SiteLink", () => {
    it("loads a new document when AdSense is enabled", () => {
        process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = "ca-pub-test";
        render(<SiteLink href="/linux/example">Example</SiteLink>);
        const link = screen.getByRole("link", { name: "Example" });
        expect(link).toHaveAttribute("href", "/linux/example");
        expect(link).not.toHaveAttribute("data-client-navigation");
    });

    it("keeps client navigation without AdSense", () => {
        delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
        render(<SiteLink href="/linux/example">Example</SiteLink>);
        expect(screen.getByRole("link", { name: "Example" })).toHaveAttribute(
            "data-client-navigation",
            "true",
        );
    });
});

describe("navigateToSite", () => {
    it("uses the router without AdSense", () => {
        delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
        const push = jest.fn();
        navigateToSite("/search?q=docker", push);
        expect(push).toHaveBeenCalledWith("/search?q=docker");
    });
});
