"""
Search Filter Strategies for Service Discovery

This module implements the Strategy Pattern for multi-faceted search,
allowing users to find services by distance, semantic tags, and text.
"""

from abc import ABC, abstractmethod
from typing import Any
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Q, QuerySet


class SearchStrategy(ABC):
    """Abstract base class for search filter strategies"""
    
    @abstractmethod
    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        """
        Apply the search filter to the queryset.
        
        Args:
            queryset: The Django QuerySet to filter
            params: Dictionary of search parameters
            
        Returns:
            Filtered QuerySet
        """
        pass


class LocationStrategy(SearchStrategy):
    """
    Filter services by distance from user location using PostGIS.
    
    Parameters:
        - lat: User's latitude
        - lng: User's longitude  
        - distance: Maximum distance in kilometers (default: 10)
    """
    
    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        lat = params.get('lat')
        lng = params.get('lng')
        distance_km = params.get('distance', 10)
        
        # Only apply if both lat and lng are provided
        if lat is None or lng is None:
            return queryset
        
        try:
            lat = float(lat)
            lng = float(lng)
            distance_km = float(distance_km)
        except (ValueError, TypeError):
            return queryset
        
        # Create user location point (lng, lat order for PostGIS)
        user_location = Point(lng, lat, srid=4326)
        
        # Filter by distance and annotate with calculated distance
        # Only filter services that have a location set
        queryset = queryset.filter(
            location__isnull=False,
            location__distance_lte=(user_location, D(km=distance_km))
        ).annotate(
            distance=Distance('location', user_location)
        ).order_by('distance')
        
        return queryset


class TagStrategy(SearchStrategy):
    """
    Filter services by semantic tags (Wikidata IDs).
    
    Parameters:
        - tags: List of tag IDs to filter by
        - tag: Single tag ID (alternative to tags list)
    """
    
    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        # Support both 'tags' (list) and 'tag' (single) parameters
        tag_ids = params.get('tags', [])
        single_tag = params.get('tag')
        
        if single_tag and single_tag not in tag_ids:
            tag_ids = list(tag_ids) + [single_tag]
        
        if not tag_ids:
            return queryset
        
        # Filter services that have any of the specified tags
        queryset = queryset.filter(tags__id__in=tag_ids).distinct()
        
        return queryset


class TextStrategy(SearchStrategy):
    """
    Full-text search on service title, description, and tag names.
    
    Parameters:
        - search: Search query string
    """
    
    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        search = params.get('search', '')
        
        if not search or not isinstance(search, str):
            return queryset
        
        search = search.strip()
        if not search:
            return queryset
        
        # Search in title, description, and tag names
        queryset = queryset.filter(
            Q(title__icontains=search) |
            Q(description__icontains=search) |
            Q(tags__name__icontains=search)
        ).distinct()
        
        return queryset


class TypeStrategy(SearchStrategy):
    """
    Filter services by type (Offer or Need).
    
    Parameters:
        - type: 'Offer' or 'Need'
    """
    
    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        service_type = params.get('type')
        
        if service_type and service_type in ['Offer', 'Need']:
            queryset = queryset.filter(type=service_type)
        
        return queryset


class SearchEngine:
    """
    Composite search engine that applies multiple filter strategies.
    
    Uses the Strategy Pattern to combine location-based, tag-based,
    text-based, and type-based filtering into a unified search interface.
    """
    
    def __init__(self):
        """Initialize with default strategy order"""
        self.strategies: list[SearchStrategy] = [
            TypeStrategy(),      # Filter by type first (most selective)
            TagStrategy(),       # Then by tags
            TextStrategy(),      # Then by text search
            LocationStrategy(),  # Location last (adds ordering by distance)
        ]
    
    def search(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        """
        Apply all search strategies to the queryset.
        
        Args:
            queryset: Base QuerySet to filter
            params: Dictionary containing all search parameters:
                - type: 'Offer' or 'Need'
                - tags: List of tag IDs
                - tag: Single tag ID
                - search: Text search query
                - lat: User latitude
                - lng: User longitude
                - distance: Max distance in km
                
        Returns:
            Filtered and potentially ordered QuerySet
        """
        for strategy in self.strategies:
            queryset = strategy.apply(queryset, params)
        
        return queryset

