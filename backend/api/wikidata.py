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
    if not wikidata_id or not wikidata_id.startswith('Q'):
        return None
    
    try:
        params = {
            'action': 'wbgetentities',
            'ids': wikidata_id,
            'props': 'labels|descriptions|aliases',
            'languages': 'en',
            'format': 'json'
        }
        
        response = requests.get(WIKIDATA_API_URL, params=params, timeout=5)
        response.raise_for_status()
        
        data = response.json()
        entities = data.get('entities', {})
        entity = entities.get(wikidata_id)
        
        if not entity:
            return None
        
        labels = entity.get('labels', {})
        descriptions = entity.get('descriptions', {})
        aliases = entity.get('aliases', {})
        
        return {
            'id': wikidata_id,
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

