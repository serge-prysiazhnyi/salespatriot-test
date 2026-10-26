// Talks to DIBBS: keeps cookies per host, follows redirects by hand,
// and clicks through the DoD "Warning and Consent" banner when it shows up.

export const START_URL = "https://www.dibbs.bsm.dla.mil/rfq/";
export const RECENT_URL = "https://www.dibbs.bsm.dla.mil/Rfq/RfqDates.aspx?category=recent";

const cookieJar: Record<string, Record<string, string>> = {};

function rememberCookies(url: string, res: Response) {
  const jar = (cookieJar[new URL(url).host] ??= {});
  for (const line of res.headers.getSetCookie()) {
    const [nameValue] = line.split(";");
    const eq = nameValue.indexOf("=");
    jar[nameValue.slice(0, eq).trim()] = nameValue.slice(eq + 1).trim();
  }
}

function cookieHeader(url: string) {
  const jar = cookieJar[new URL(url).host] ?? {};
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

type Page = { url: string; text: string; status: number };

// The consent cookie is set on a redirect response, so redirects are followed manually.
async function request(url: string, method = "GET", body?: string): Promise<Page> {
  for (let hop = 0; hop < 10; hop++) {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (rfq-browser prototype)",
      Cookie: cookieHeader(url),
    };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    const res = await fetch(url, { method, headers, body, redirect: "manual" });
    rememberCookies(url, res);
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).href;
      method = "GET";
      body = undefined;
      continue;
    }
    // DIBBS serves ISO-8859-1.
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    return { url, text, status: res.status };
  }
  throw new Error("Too many redirects: " + url);
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const isConsentPage = (text: string) => text.includes("Warning and Consent");

// GET a page; if DIBBS shows the consent banner, press OK (post the form back) and return the real page.
export async function getPage(url: string): Promise<Page> {
  let page = await request(url);
  if (isConsentPage(page.text)) {
    const form = new URLSearchParams();
    for (const tag of page.text.match(/<input[^>]*>/g) ?? []) {
      const name = tag.match(/name="([^"]*)"/);
      const value = tag.match(/value="([^"]*)"/);
      if (name) form.append(name[1], decodeHtml(value ? value[1] : ""));
    }
    const action = page.text.match(/<form[^>]*action="([^"]*)"/);
    if (!action) throw new Error("Consent form not found on " + page.url);
    page = await request(new URL(decodeHtml(action[1]), page.url).href, "POST", form.toString());
    if (isConsentPage(page.text)) throw new Error("Consent page shown again for " + url);
  }
  if (page.status !== 200) throw new Error(`HTTP ${page.status} for ${url}`);
  return page;
}

// Links to the daily index files, e.g. .../Archive/in261023.txt, oldest first.
export async function listIndexFiles(): Promise<string[]> {
  await getPage(START_URL);
  const recent = await getPage(RECENT_URL);
  const links = recent.text.match(/https:\/\/dibbs2\.bsm\.dla\.mil\/Downloads\/RFQ\/Archive\/in\d{6}\.txt/gi) ?? [];
  return [...new Set(links)].sort();
}
