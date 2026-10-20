/** @jest-environment node */

import { getArticleByPath } from "@/lib/wiki/api";
import { NextRequest } from "next/server";

import { GET as byPath } from "./[...path]/route";
import { GET as byQuery } from "./route";

jest.mock("@/lib/wiki/api", () => ({ getArticleByPath: jest.fn() }));

const lookup = getArticleByPath as jest.MockedFunction<typeof getArticleByPath>;

const article = {
    title: "Wordpress Nginx Config",
    full_url: "/linux/wordpress-nginx-config",
    author: { first_name: "Adam", last_name: "Birds" },
    article_type: "documentation",
    published_at: "2026-08-10T23:29:58.499Z",
    updated_at: "2026-08-11T00:00:00.000Z",
    categories: [{ name: "Linux" }],
    tags: [{ name: "nginx" }],
    content: "# Config\n",
};

beforeEach(() => {
    lookup.mockReset();
    lookup.mockResolvedValue({ success: true, article } as never);
});

test("the /<category>/<slug>.md rewrite's path segments find the article", async () => {
    const response = await byPath(new Request("http://localhost/"), {
        params: Promise.resolve({ path: ["linux", "wordpress-nginx-config"] }),
    });
    expect(lookup).toHaveBeenCalledWith("linux/wordpress-nginx-config");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
        "text/markdown; charset=utf-8",
    );
    const text = await response.text();
    expect(text).toContain(
        'canonical: "https://techwiki.co.uk/linux/wordpress-nginx-config"',
    );
    expect(text.endsWith("# Config\n")).toBe(true);
});

test("the query string still works when called directly", async () => {
    const request = new NextRequest(
        "http://localhost/api/content/v1/markdown?path=/parent/linux/nginx",
    );
    expect((await byQuery(request)).status).toBe(200);
    expect(lookup).toHaveBeenCalledWith("parent/linux/nginx");
});

test("no path is a 400 and an unknown article a 404", async () => {
    const empty = new NextRequest("http://localhost/api/content/v1/markdown");
    expect((await byQuery(empty)).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();

    lookup.mockResolvedValue({ success: false } as never);
    const response = await byPath(new Request("http://localhost/"), {
        params: Promise.resolve({ path: ["linux", "missing"] }),
    });
    expect(response.status).toBe(404);
});
