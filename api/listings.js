const cache = globalThis.__VERI_CACHE__ || { at: 0, listings: [] };
globalThis.__VERI_CACHE__ = cache;

function dedupeByLink(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.link || item.address;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeListing(item = {}, source = "unknown") {
  const address = item.address || item.fullAddress || item.streetAddress || item.location || "Unknown address";
  const city = item.city || (address.includes("Murrieta") ? "Murrieta" : address.includes("Menifee") ? "Menifee" : address.includes("Temecula") ? "Temecula" : "");
  const beds = item.bedrooms || item.beds || item.bed || item.num_bedrooms;
  const baths = item.bathrooms || item.baths || item.bath || item.num_bathrooms;
  const desc = [item.description, item.home_description, item.summary, item.remarks, item.features].filter(Boolean).join(" | ");
  const lower = desc.toLowerCase();

  let tub = "Unknown";
  if (/(soaking tub|jetted tub|bathtub|separate tub and shower)/i.test(desc)) tub = "Confirmed: bathtub clues in description";
  else if (/(full bath|full bathroom)/i.test(desc)) tub = "Full bathroom mentioned — tub possible";
  if (/(guest house|casita|adu|in-law|multigenerational|next gen|nextgen)/i.test(desc) && tub !== "Unknown") {
    tub += "; ADU/casita language present";
  }

  let entrance = "Unknown";
  if (/(separate entrance|private entrance)/i.test(desc)) entrance = "Separate/private entrance mentioned";
  else if (/(guest house|detached casita|detached guest house|adu)/i.test(desc)) entrance = "Detached guest house / ADU language";

  const solar = /(solar)/i.test(desc) ? "Solar mentioned" : (item.solar_status || "Unknown");

  return {
    listing_photo: item.image || item.photo || item.thumbnail || item.listing_photo || "",
    address,
    price: item.price || item.listPrice || item.formattedPrice || "See live listing",
    link: item.url || item.link || item.detailUrl || item.href || "",
    bed_bath: beds || baths ? `${beds || "?"} bed / ${baths || "?"} bath` : "See live listing",
    adu_tub_status: tub,
    hoa_costs: item.hoaFee || item.hoa || "Unknown",
    year_built: item.yearBuilt || item.year_built || "Unknown",
    solar_status: solar,
    stories: item.stories || item.levels || "Unknown",
    separate_entrance: entrance,
    city,
    notes: `Source: ${source}. Verify final tub placement from photos/details.`
  };
}

async function fetchHasData(url) {
  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) throw new Error("Missing HASDATA_API_KEY");
  const endpoint = process.env.HASDATA_ENDPOINT || "https://api.hasdata.com/scrape";
  const res = await fetch(endpoint + "?" + new URLSearchParams({ url }), {
    headers: { "x-api-key": apiKey }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HasData error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults) return payload.props.pageProps.searchPageState.cat1.searchResults.listResults;
  return [];
}

export default async function handler(req, res) {
  const limit = Math.min(parseInt(req.query.limit || "25", 10) || 25, 25);
  const cacheMs = parseInt(process.env.CACHE_TTL_MS || String(1000 * 60 * 60 * 12), 10); // 12h default

  if (Date.now() - cache.at < cacheMs && cache.listings.length) {
    return res.status(200).json({
      listings: cache.listings.slice(0, limit),
      cached: true,
      updatedAt: new Date(cache.at).toISOString()
    });
  }

  const urls = [
    "https://www.realtor.com/realestateandhomes-search/Temecula_CA/with_guesthouse",
    "https://www.realtor.com/realestateandhomes-search/Murrieta_CA/with_guesthouse",
    "https://www.realtor.com/realestateandhomes-search/Menifee_CA/with_guesthouse",
    "https://www.redfin.com/city/19701/CA/Temecula/amenity/separate+entrance",
    "https://www.redfin.com/city/12487/CA/Murrieta/amenity/separate+entrance",
    "https://www.redfin.com/city/33742/CA/Menifee/amenity/separate+entrance",
    "https://www.zillow.com/temecula-ca/full-guest-house_att/",
    "https://www.zillow.com/murrieta-ca/in-law-suite_att/",
    "https://www.zillow.com/menifee-ca/with-guest-house/"
  ];

  try {
    const responses = await Promise.allSettled(urls.map(fetchHasData));
    const normalized = [];

    responses.forEach((result, idx) => {
      if (result.status !== "fulfilled") return;
      const sourceUrl = urls[idx];
      const source = sourceUrl.includes("realtor") ? "Realtor" : sourceUrl.includes("redfin") ? "Redfin" : "Zillow";
      const items = extractItems(result.value);
      items.forEach((item) => normalized.push(normalizeListing(item, source)));
    });

    const cleaned = dedupeByLink(normalized)
      .filter(x => x.address && x.link)
      .filter(x => /Temecula|Murrieta|Menifee/i.test(x.address + " " + x.city + " " + x.notes))
      .slice(0, limit);

    cache.at = Date.now();
    cache.listings = cleaned;

    return res.status(200).json({
      listings: cleaned,
      cached: false,
      updatedAt: new Date(cache.at).toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}
