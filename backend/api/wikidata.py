"""
Wikidata API integration for tag enrichment
"""
import requests
import logging
from typing import Optional, Dict, List


logger = logging.getLogger(__name__)
WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"


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
    """
    if not query or not query.strip():
        return []
    
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
        return formatted_results
        
    except requests.Timeout:
        logger.error(f"Wikidata API timeout for query '{query}'")
        return []
    except requests.RequestException as e:
        logger.error(f"Wikidata API request error for query '{query}': {str(e)}")
        return []
    except KeyError as e:
        logger.error(f"Wikidata API response parsing error for query '{query}': {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error searching Wikidata for query '{query}': {str(e)}", exc_info=True)
        return []


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


def fetch_wikidata_claims(qid: str) -> Optional[Dict]:
    """
    Fetch P31 (instance of) and P279 (subclass of) claims for a WikiData entity.

    Returns:
        Dict with 'instance_of' and 'subclass_of' lists of QIDs, or None on failure.
    """
    if not qid:
        return None

    normalized = str(qid).strip().upper()
    if not normalized.startswith('Q'):
        return None

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


def classify_and_filter_results(results: List[Dict]) -> List[Dict]:
    """
    Classify WikiData search results by entity type and filter out
    disallowed types (places, people, countries, etc.).

    Results whose P31 cannot be determined (API failure) are kept
    (fail open for UX).

    Returns:
        Filtered list with 'entity_type' added to each result.
    """
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

