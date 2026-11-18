import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url: string };
    if (!url?.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http")) targetUrl = `https://${targetUrl}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(targetUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LOTUSBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return NextResponse.json({ error: "site inacessível" }, { status: 400 });

    const html = await res.text();
    const base = new URL(res.url);

    // Extract all image src and og:image
    const rawSrcs: string[] = [];

    // <img src="...">
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(html)) !== null) rawSrcs.push(m[1]);

    // <meta property="og:image" content="...">
    const ogRegex = /<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/gi;
    while ((m = ogRegex.exec(html)) !== null) rawSrcs.push(m[1] ?? m[2]);

    // CSS background-image: url('...')
    const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((m = bgRegex.exec(html)) !== null) rawSrcs.push(m[1]);

    // Normalize to absolute URLs and filter
    const seen = new Set<string>();
    const images: { url: string; type: "img" | "og" | "bg" }[] = [];

    for (const src of rawSrcs) {
      if (!src || src.startsWith("data:")) continue;
      try {
        const abs = new URL(src, base).href;
        if (seen.has(abs)) continue;
        seen.add(abs);
        // Only include image-like URLs
        if (!/\.(jpe?g|png|webp|gif|svg|avif)(\?|$)/i.test(abs) && !abs.includes("image") && !abs.includes("photo") && !abs.includes("foto")) continue;
        const type = images.length < rawSrcs.indexOf(src) ? "img" : "og";
        images.push({ url: abs, type: "img" });
      } catch {}
    }

    // Deduplicate and return max 30
    return NextResponse.json({ images: images.slice(0, 30), siteUrl: res.url, total: images.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
