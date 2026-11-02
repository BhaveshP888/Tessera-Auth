export interface PageMetadata {
  url: string;
  title: string;
  description: string;
  faviconUrl: string;
  previewImageUrl: string;
}

/**
 * Normalizes input URL by trimming and prepending https:// if missing.
 */
export const normalizeUrl = (raw: string): string => {
  let trimmed = raw.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed;
};

/**
 * Strips tracking query parameters from URL.
 */
export const cleanTrackingParams = (rawUrl: string): string => {
  try {
    const normalized = normalizeUrl(rawUrl);
    const parsed = new URL(normalized);
    const trackingKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      'mc_cid',
      'mc_eid',
      'ref',
      'ref_src',
      'source',
    ];

    for (const key of trackingKeys) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return normalizeUrl(rawUrl);
  }
};

/**
 * Parses IPv4 address in decimal, hex, octal, or dot-decimal notation into 32-bit integer.
 */
export function parseIpv4ToNumber(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 4) {
    let num = 0;
    for (let i = 0; i < 4; i++) {
      const part = parts[i]!;
      let octet: number;
      if (/^0x[0-9a-f]+$/i.test(part)) {
        octet = parseInt(part, 16);
      } else if (/^0[0-7]+$/.test(part)) {
        octet = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        octet = parseInt(part, 10);
      } else {
        return null;
      }
      if (octet < 0 || octet > 255) return null;
      num = (num << 8) | octet;
    }
    return num >>> 0;
  }

  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^\d+$/.test(host)) {
    const n = parseInt(host, 10);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  return null;
}

/**
 * Checks if a 32-bit IPv4 integer is in a private, loopback, or reserved range.
 */
export function isPrivateOrReservedIpv4(ipNum: number): boolean {
  const b0 = (ipNum >>> 24) & 0xff;
  const b1 = (ipNum >>> 16) & 0xff;

  // 0.0.0.0/8 (This host)
  if (b0 === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure instance metadata)
  if (b0 === 169 && b1 === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Test-Net)
  if (b0 === 192 && b1 === 0 && ((ipNum >>> 8) & 0xff) === 2) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Validates whether a target URL is safe to fetch (blocks SSRF / private networks).
 */
export const isSafePublicUrl = (targetUrl: string): boolean => {
  try {
    const url = new URL(normalizeUrl(targetUrl));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    let host = url.hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    if (
      host === 'localhost' ||
      host === '::' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home.arpa')
    ) {
      return false;
    }

    // IPv6 private / link-local / loopback checks
    if (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:') ||
      host.startsWith('::ffff:')
    ) {
      if (host.startsWith('::ffff:')) {
        const mappedIp = host.slice(7);
        const mappedNum = parseIpv4ToNumber(mappedIp);
        if (mappedNum !== null && isPrivateOrReservedIpv4(mappedNum)) {
          return false;
        }
      }
      return false;
    }

    // IPv4 Checks
    const ipNum = parseIpv4ToNumber(host);
    if (ipNum !== null) {
      if (isPrivateOrReservedIpv4(ipNum)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Decodes basic HTML entities in extracted text.
 */
const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Robust regex helper to extract attribute content regardless of attribute order.
 */
const extractMetaTag = (html: string, nameOrProp: string): string => {
  const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches <meta ... property="xyz" ... content="abc" ...> or <meta ... content="abc" ... property="xyz" ...>
  const regex1 = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match1 = html.match(regex1);
  if (match1 && match1[1]) return decodeHtmlEntities(match1[1]);

  const regex2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["']`, 'i');
  const match2 = html.match(regex2);
  if (match2 && match2[1]) return decodeHtmlEntities(match2[1]);

  return '';
};

/**
 * Parses OpenGraph, Twitter, and HTML meta tags from HTML text.
 */
export const extractOpenGraphMetadata = (html: string, pageUrl: string): PageMetadata => {
  let hostname = '';
  let origin = '';
  try {
    const parsed = new URL(pageUrl);
    hostname = parsed.hostname.replace(/^www\./, '');
    origin = parsed.origin;
  } catch {
    hostname = pageUrl;
  }

  // 1. Extract Title
  let title =
    extractMetaTag(html, 'og:title') ||
    extractMetaTag(html, 'twitter:title') ||
    extractMetaTag(html, 'title');

  if (!title) {
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      title = decodeHtmlEntities(titleTagMatch[1]);
    }
  }

  if (!title) {
    title = hostname || pageUrl;
  }

  // 2. Extract Description
  const description =
    extractMetaTag(html, 'og:description') ||
    extractMetaTag(html, 'description') ||
    extractMetaTag(html, 'twitter:description');

  // 3. Extract Preview Image
  let previewImageUrl =
    extractMetaTag(html, 'og:image') ||
    extractMetaTag(html, 'twitter:image') ||
    extractMetaTag(html, 'image');

  // 4. Extract Favicon
  let faviconUrl = '';
  const iconMatch1 = html.match(/<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i);
  const iconMatch2 = html.match(/<link\s+[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  const iconHref = iconMatch1?.[1] || iconMatch2?.[1] || '';

  if (iconHref) {
    faviconUrl = iconHref;
  }

  // Resolve Relative URLs
  try {
    const base = new URL(pageUrl);
    if (previewImageUrl && !previewImageUrl.startsWith('http://') && !previewImageUrl.startsWith('https://')) {
      previewImageUrl = new URL(previewImageUrl, base).toString();
    }
    if (faviconUrl && !faviconUrl.startsWith('http://') && !faviconUrl.startsWith('https://')) {
      faviconUrl = new URL(faviconUrl, base).toString();
    }
  } catch {}

  // Fallback high-res favicon if none found in HTML
  if (!faviconUrl && origin) {
    faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  }

  return {
    url: pageUrl,
    title,
    description,
    faviconUrl,
    previewImageUrl,
  };
};

/**
 * Fetches page metadata preserving client privacy.
 */
export const fetchPrivacyReaderMetadata = async (
  rawUrl: string,
): Promise<{ data: PageMetadata | null; error: string | null }> => {
  let currentUrl = cleanTrackingParams(rawUrl);

  if (!isSafePublicUrl(currentUrl)) {
    return { data: null, error: 'Invalid or restricted URL' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    let response: Response | null = null;
    let redirectCount = 0;
    const maxRedirects = 3;

    while (redirectCount <= maxRedirects) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual',
      });

      // Check if redirect response (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) break;

        const nextUrl = new URL(location, currentUrl).toString();
        if (!isSafePublicUrl(nextUrl)) {
          clearTimeout(timeout);
          return { data: null, error: 'Restricted redirect destination' };
        }
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      break;
    }

    clearTimeout(timeout);

    if (!response || !response.ok) {
      // Return hostname fallback if upstream 403/404 or non-ok
      const parsed = new URL(currentUrl);
      return {
        data: {
          url: currentUrl,
          title: parsed.hostname.replace(/^www\./, ''),
          description: '',
          faviconUrl: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
          previewImageUrl: '',
        },
        error: null,
      };
    }

    const html = await response.text();
    const metadata = extractOpenGraphMetadata(html, currentUrl);
    return { data: metadata, error: null };
  } catch {
    // Network / timeout fallback: generate clean domain-level metadata
    try {
      const parsed = new URL(currentUrl);
      return {
        data: {
          url: currentUrl,
          title: parsed.hostname.replace(/^www\./, ''),
          description: '',
          faviconUrl: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
          previewImageUrl: '',
        },
        error: null,
      };
    } catch {
      return { data: null, error: 'Failed to parse or reach URL' };
    }
  }
};

export interface IUrlMetadataResolver {
  resolve(rawUrl: string): Promise<{ data: PageMetadata | null; error: string | null }>;
}

/**
 * Deep module encapsulating URL sanitization, SSRF protection,
 * and OpenGraph scraping behind a single resolve() seam.
 */
export class UrlMetadataResolver implements IUrlMetadataResolver {
  public async resolve(rawUrl: string): Promise<{ data: PageMetadata | null; error: string | null }> {
    return fetchPrivacyReaderMetadata(rawUrl);
  }
}

export const urlMetadataResolver = new UrlMetadataResolver();
