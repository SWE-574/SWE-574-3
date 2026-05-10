"""
Wikidata API integration for tag enrichment
"""
import requests
import logging
from typing import Optional, Dict, List

from django.core.cache import cache


logger = logging.getLogger(__name__)
WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"

# Per-query cache window. Tag autocomplete results are stable enough that a
# 1-hour window is a strict win for typical browsing patterns -- the same
# query repeats many times across one session of editing services.
_SEARCH_CACHE_TTL_SECONDS = 60 * 60
# When the local Tag table already contains this many matches for the prefix,
# skip Wikidata entirely. The autocomplete is most useful for discovering
# brand-new tags; for repeat searches the local catalog already covers it.
_LOCAL_HIT_THRESHOLD = 5


def _local_tag_search(query: str, limit: int) -> List[Dict]:
    """Search the local Tag table by name prefix/substring.

    Returns up to ``limit`` matches in the same shape as the Wikidata
    response so callers can short-circuit the live API. Results are sorted
    by service-count desc so the most-used tags surface first.
    """
    from .models import Tag
    from django.db.models import Count

    rows = (
        Tag.objects.filter(name__icontains=query.strip())
        .annotate(c=Count('service'))
        .order_by('-c', 'name')
        .values('id', 'name')[:limit]
    )
    return [
        {'id': row['id'], 'label': row['name'], 'description': None}
        for row in rows
        if row['id'] and row['name']
    ]


def _search_cache_key(query: str, limit: int) -> str:
    return f'wikidata:search:{limit}:{query.strip().lower()}'


def fetch_wikidata_item(wikidata_id: str) -> Optional[Dict]:
    """
    Fetch information about a Wikidata item by its ID (e.g., "Q8476").
    
    Returns:
        Dictionary with label, description, and aliases, or None if not found
    """
    if not wikidata_id:
        return None

    normalized_id = str(wikidata_id).strip().upper()
    if not normalized_id.startswith('Q'):
        return None
    
    try:
        params = {
            'action': 'wbgetentities',
            'ids': normalized_id,
            'props': 'labels|descriptions|aliases',
            'languages': 'en',
            'format': 'json'
        }

        headers = {
            'User-Agent': 'TheHive/0.9 (https://github.com/yusufizzetmuratSWE-573)'
        }

        response = requests.get(WIKIDATA_API_URL, params=params, timeout=5, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        entities = data.get('entities', {})
        entity = entities.get(normalized_id)
        
        if not entity:
            return None
        
        labels = entity.get('labels', {})
        descriptions = entity.get('descriptions', {})
        aliases = entity.get('aliases', {})
        
        return {
            'id': normalized_id,
            'label': labels.get('en', {}).get('value') if labels.get('en') else None,
            'description': descriptions.get('en', {}).get('value') if descriptions.get('en') else None,
            'aliases': [alias.get('value') for alias in aliases.get('en', [])] if aliases.get('en') else []
        }
    except (requests.RequestException, KeyError, ValueError):
        return None


def search_wikidata_items(query: str, limit: int = 10) -> List[Dict]:
    """
    Search for Wikidata items by name.

    Returns:
        List of dictionaries with id, label, and description

    Latency: typing one character used to fire a fresh ~5s round-trip to
    wikidata.org on every keystroke. Two short-circuits land before the
    network call now:

      1. Per-query Django cache (1h TTL). The same prefix typed twice
         returns instantly the second time.
      2. Local Tag DB lookup. If the platform already has >= 5 matches
         for this prefix, return them and skip Wikidata altogether --
         the autocomplete only needs the live API for *new* topics, not
         the long tail of established platform tags.
    """
    if not query or not query.strip():
        return []

    cache_key = _search_cache_key(query, limit)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    local_matches = _local_tag_search(query, limit)
    if len(local_matches) >= _LOCAL_HIT_THRESHOLD:
        cache.set(cache_key, local_matches, _SEARCH_CACHE_TTL_SECONDS)
        return local_matches

    try:
        params = {
            'action': 'wbsearchentities',
            'search': query.strip(),
            'language': 'en',
            'limit': limit,
            'format': 'json',
            'uselang': 'en'
        }
        
        # Add User-Agent header to avoid potential blocking
        headers = {
            'User-Agent': 'TheHive/0.9 (https://github.com/yusufizzetmuratSWE-573)'
        }
        response = requests.get(WIKIDATA_API_URL, params=params, timeout=10, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        # Check for API errors in response
        if 'error' in data:
            error_info = data.get('error', {})
            logger.error(f"Wikidata API error for query '{query}': {error_info}")
            return []
        
        # Check if search was successful
        if data.get('success') == 0:
            logger.warning(f"Wikidata API returned success=0 for query '{query}'")
            return []
        
        results = data.get('search', [])
        
        if not results:
            logger.debug(f"No Wikidata results found for query '{query}'. Response keys: {list(data.keys())}")
            return []
        
        formatted_results = []
        for item in results:
            item_id = item.get('id')
            item_label = item.get('label')
            item_description = item.get('description')
            
            # Only include items with required fields
            if item_id and item_label:
                formatted_results.append({
                    'id': item_id,
                    'label': item_label,
                    'description': item_description if item_description else None
                })
        
        logger.info(f"Found {len(formatted_results)} Wikidata results for query '{query}' (from {len(results)} raw results)")
        # Merge any local matches that didn't make the wikidata results so the
        # final list isn't strictly smaller after our DB-first attempt.
        if local_matches:
            seen = {item['id'] for item in formatted_results}
            for item in local_matches:
                if item['id'] not in seen:
                    formatted_results.append(item)
                    if len(formatted_results) >= limit:
                        break
        cache.set(cache_key, formatted_results, _SEARCH_CACHE_TTL_SECONDS)
        return formatted_results

    except requests.Timeout:
        logger.error(f"Wikidata API timeout for query '{query}'")
        return local_matches
    except requests.RequestException as e:
        logger.error(f"Wikidata API request error for query '{query}': {str(e)}")
        return local_matches
    except KeyError as e:
        logger.error(f"Wikidata API response parsing error for query '{query}': {str(e)}")
        return local_matches
    except Exception as e:
        logger.error(f"Unexpected error searching Wikidata for query '{query}': {str(e)}", exc_info=True)
        return local_matches


def enrich_tag_with_wikidata(tag_id: str) -> Optional[Dict]:
    """
    Enrich a tag with Wikidata information.
    Useful for getting descriptions and related information.
    """
    return fetch_wikidata_item(tag_id)


# ---------------------------------------------------------------------------
# WikiData hierarchy: P31 (instance of) / P279 (subclass of) resolution
# ---------------------------------------------------------------------------

ENTITY_TYPE_MAP = {
    'Q21198': 'technology',      # computer science
    'Q9143': 'technology',       # programming language
    'Q7397': 'technology',       # software
    'Q11016': 'technology',      # technology
    'Q1668024': 'technology',    # web application
    'Q11862829': 'education',    # academic discipline
    'Q12737077': 'education',    # occupation
    'Q349': 'sports',            # sport
    'Q1914636': 'activity',      # activity
    'Q735': 'arts',              # art
    'Q337060': 'arts',           # art form
    'Q2095': 'food',             # food
    'Q12140': 'health',          # medicine
    'Q205961': 'activity',       # skill
    'Q336': 'science',           # science
    'Q34770': 'language',        # language
    'Q28640': 'craft',           # profession
    'Q11023': 'technology',      # engineering
    'Q420': 'science',           # biology
    'Q413': 'science',           # physics
    'Q395': 'science',           # mathematics
    'Q2329': 'science',          # chemistry
    'Q11190': 'health',          # medicine (alt)
    'Q31629': 'activity',        # type of sport
    'Q515': 'other',             # city (block)
    'Q5': 'other',               # human (block)
    'Q6256': 'other',            # country (block)
}


def _wikidata_get(params: dict) -> Optional[dict]:
    """Shared HTTP helper for WikiData API calls."""
    headers = {
        'User-Agent': 'TheHive/0.9 (https://github.com/yusufizzetmuratSWE-573)'
    }
    try:
        response = requests.get(
            WIKIDATA_API_URL, params=params, timeout=5, headers=headers
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as e:
        logger.error(f"WikiData API error: {e}")
        return None


_CLAIMS_CACHE_TTL_SECONDS = 24 * 60 * 60


def fetch_wikidata_claims(qid: str) -> Optional[Dict]:
    """
    Fetch P31 (instance of) and P279 (subclass of) claims for a WikiData entity.

    Returns:
        Dict with 'instance_of' and 'subclass_of' lists of QIDs, or None on failure.

    Per-QID cache (24h) -- claims rarely change. Without it, every search
    result triggered a fresh 5s-timeout round-trip; a typical 10-result
    search added up to 50s on top of the wbsearchentities call.
    """
    if not qid:
        return None

    normalized = str(qid).strip().upper()
    if not normalized.startswith('Q'):
        return None

    cache_key = f'wikidata:claims:{normalized}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    data = _wikidata_get({
        'action': 'wbgetentities',
        'ids': normalized,
        'props': 'claims',
        'format': 'json',
    })

    if data is None:
        return None

    entity = data.get('entities', {}).get(normalized)
    if not entity:
        return None

    claims = entity.get('claims', {})
    result: Dict[str, List] = {'instance_of': [], 'subclass_of': []}

    for prop, key in [('P31', 'instance_of'), ('P279', 'subclass_of')]:
        for claim in claims.get(prop, []):
            try:
                value = claim['mainsnak']['datavalue']['value']
                target_id = value.get('id')
                if target_id:
                    result[key].append(target_id)
            except (KeyError, TypeError):
                continue

    cache.set(cache_key, result, _CLAIMS_CACHE_TTL_SECONDS)
    return result


def resolve_entity_type(qid: str, max_depth: int = 3) -> str:
    """
    Resolve a WikiData entity to a broad entity type by walking P31/P279 chain.

    Checks the QID itself against ENTITY_TYPE_MAP first, then traverses parents.

    Returns:
        Entity type string (e.g. 'technology', 'arts') or 'other'.
    """
    if not qid:
        return 'other'

    normalized = str(qid).strip().upper()

    # Direct match in map
    if normalized in ENTITY_TYPE_MAP:
        return ENTITY_TYPE_MAP[normalized]

    # Traverse parent chain
    visited = set()
    to_visit = [normalized]

    for _ in range(max_depth + 1):
        if not to_visit:
            break

        current = to_visit.pop(0)
        if current in visited:
            continue
        visited.add(current)

        claims = fetch_wikidata_claims(current)
        if claims is None:
            continue

        parents = claims.get('instance_of', []) + claims.get('subclass_of', [])
        for parent_qid in parents:
            if parent_qid in ENTITY_TYPE_MAP:
                return ENTITY_TYPE_MAP[parent_qid]
            if parent_qid not in visited:
                to_visit.append(parent_qid)

    return 'other'


# QIDs whose entities should be blocked from tag autocomplete
BLOCKED_ENTITY_QIDS = frozenset({
    'Q515',    # city
    'Q5',      # human
    'Q6256',   # country
    'Q3624078',  # sovereign state
    'Q486972',   # human settlement
    'Q13418847', # historical event
    'Q4167410',  # disambiguation page
    'Q17362920', # Wikipedia duplicated page
    'Q13442814', # scholarly article
    'Q732577',   # publication
})


def fetch_wikidata_claims_batch(qids: List[str]) -> Dict[str, Optional[Dict]]:
    """
    Resolve P31 / P279 claims for many QIDs in a single ``wbgetentities``
    call instead of one HTTP round-trip per id.

    Issue #525: typing into the tag picker fanned out N upstream calls per
    keystroke (one per autocomplete row) the first time a query was typed,
    which compounded the wbsearchentities call and pushed total response
    time well past the 1 s budget. The MediaWiki API accepts up to 50
    pipe-separated ids on ``wbgetentities``, so the cold-cache cost is
    one round-trip regardless of result count.

    Returns a ``{qid: claims-dict-or-None}`` mapping. Only inputs that
    normalise to a ``Q...`` identifier appear in the output — falsy and
    non-``Q`` inputs are dropped before the upstream call. Already-cached
    entries are taken from the local cache and the cache is populated for
    any QID resolved through the upstream call. Resolved QIDs that the
    upstream call cannot answer map to ``None`` so callers can fail-open
    the same way the per-id helper does.
    """
    if not qids:
        return {}

    # Keep insertion order while removing dupes; normalise upper-case so
    # the cache key matches the per-id helper.
    seen: Dict[str, None] = {}
    for raw in qids:
        if not raw:
            continue
        norm = str(raw).strip().upper()
        if norm.startswith('Q') and norm not in seen:
            seen[norm] = None

    out: Dict[str, Optional[Dict]] = {q: None for q in seen}

    # Pull from cache first. Anything still missing goes upstream in one
    # shot, batched up to the wbgetentities 50-id ceiling.
    missing: List[str] = []
    for qid in seen:
        cached = cache.get(f'wikidata:claims:{qid}')
        if cached is not None:
            out[qid] = cached
        else:
            missing.append(qid)

    BATCH_SIZE = 50
    for chunk_start in range(0, len(missing), BATCH_SIZE):
        chunk = missing[chunk_start:chunk_start + BATCH_SIZE]
        data = _wikidata_get({
            'action': 'wbgetentities',
            'ids': '|'.join(chunk),
            'props': 'claims',
            'format': 'json',
        })
        if data is None:
            # Upstream failed for this chunk -- caller will get None for
            # each id and fail-open downstream.
            continue

        entities = data.get('entities', {}) or {}
        for qid in chunk:
            entity = entities.get(qid)
            if not entity:
                continue
            claims = entity.get('claims', {}) or {}
            result: Dict[str, List] = {'instance_of': [], 'subclass_of': []}
            for prop, key in [('P31', 'instance_of'), ('P279', 'subclass_of')]:
                for claim in claims.get(prop, []):
                    try:
                        value = claim['mainsnak']['datavalue']['value']
                        target_id = value.get('id')
                        if target_id:
                            result[key].append(target_id)
                    except (KeyError, TypeError):
                        continue
            cache.set(
                f'wikidata:claims:{qid}', result, _CLAIMS_CACHE_TTL_SECONDS
            )
            out[qid] = result

    return out


def classify_and_filter_results(results: List[Dict]) -> List[Dict]:
    """
    Classify WikiData search results by entity type and filter out
    disallowed types (places, people, countries, etc.).

    Results whose P31 cannot be determined (API failure) are kept
    (fail open for UX).

    Returns:
        Filtered list with 'entity_type' added to each result.
    """
    # #525: warm the per-QID claim cache in a single round-trip so the
    # per-row fetch_wikidata_claims calls below collapse to cache hits.
    # Done as a side-effect (rather than swapping out the per-id helper)
    # so existing callers and tests that mock fetch_wikidata_claims keep
    # observing the same surface.
    qids = [item.get('id') for item in results if item.get('id')]
    if qids:
        try:
            fetch_wikidata_claims_batch(qids)
        except Exception:
            # Batched warm-up is an optimisation, not a correctness path.
            pass

    filtered = []
    for item in results:
        qid = item.get('id')
        if not qid:
            continue

        claims = fetch_wikidata_claims(qid)
        if claims is None:
            # Fail open: can't classify, include without entity_type
            filtered.append(item)
            continue

        p31_ids = claims.get('instance_of', [])

        # Check if any P31 is a blocked type
        if any(pid in BLOCKED_ENTITY_QIDS for pid in p31_ids):
            continue

        # Resolve entity type
        entity_type = None
        for pid in p31_ids:
            if pid in ENTITY_TYPE_MAP:
                entity_type = ENTITY_TYPE_MAP[pid]
                break

        if entity_type is None:
            # Check P279 too
            p279_ids = claims.get('subclass_of', [])
            for pid in p279_ids:
                if pid in ENTITY_TYPE_MAP:
                    entity_type = ENTITY_TYPE_MAP[pid]
                    break

        result = {**item}
        if entity_type:
            result['entity_type'] = entity_type
        else:
            result['entity_type'] = None

        filtered.append(result)

    return filtered

