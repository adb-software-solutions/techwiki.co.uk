/** @jest-environment node */

const originalEnv = { ...process.env };

function getResponse() {
    let response!: Response;
    jest.isolateModules(() => {
        const { GET } = require("./route");
        response = GET();
    });
    return response;
}

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_EZOIC_ADS_TXT_ENABLED;
    delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
});

afterEach(() => {
    process.env = { ...originalEnv };
});

test("managed ads.txt can be enabled independently of ad serving", () => {
    process.env.NEXT_PUBLIC_EZOIC_ENABLED = "false";
    process.env.NEXT_PUBLIC_EZOIC_ADS_TXT_ENABLED = "true";
    const response = getResponse();
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
        "https://srv.adstxtmanager.com/19390/techwiki.co.uk",
    );
});

test("preserves the AdSense seller record until the managed redirect is enabled", async () => {
    process.env.NEXT_PUBLIC_EZOIC_ENABLED = "true";
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = "ca-pub-1234567890123456";
    const response = getResponse();
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toBe(
        "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n",
    );
});

test("does not publish an invalid seller ID", async () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID = "invalid";
    expect(await getResponse().text()).toBe("");
});
