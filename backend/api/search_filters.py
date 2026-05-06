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
from django.db.models import (
    Q, QuerySet, Case, When, Value, FloatField, Sum, Exists, OuterRef,
    Subquery,
)


# Search ordering weights (FR-17g / FR-SEA-01 / #306, #324).
# Title matches outrank tag matches outrank description-only matches.
# Social proximity is gated on FR-DIS-05 (social graph) -- placeholder until then.
TITLE_WEIGHT = 1.0
TAG_WEIGHT = 0.8
DESC_WEIGHT = 0.4
SOCIAL_PROXIMITY_WEIGHT = 0.0  # TODO: wire when social graph lands (FR-DIS-05)


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

    Supports hierarchical matching: a search for a parent tag QID will also
    find services tagged with child tags (via parent_qid).

    Parameters:
        - tags: List of tag IDs to filter by
        - tag: Single tag ID (alternative to tags list)
        - entity_type: Filter by broad entity type (e.g. 'technology', 'food')
    """

    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        # Support both 'tags' (list) and 'tag' (single) parameters
        tag_ids = params.get('tags', [])
        single_tag = params.get('tag')

        if single_tag and single_tag not in tag_ids:
            tag_ids = list(tag_ids) + [single_tag]

        if tag_ids:
            # Direct match OR parent_qid match (hierarchical traversal)
            queryset = queryset.filter(
                Q(tags__id__in=tag_ids) | Q(tags__parent_qid__in=tag_ids)
            ).distinct()

        # Entity type filtering
        entity_type = params.get('entity_type')
        if entity_type:
            queryset = queryset.filter(
                tags__entity_type=entity_type
            ).distinct()

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

        # Weighted scoring: title (1.0) > tag (0.8) > description (0.4).
        # Tie-break by hot_score so Phase 2 still matters on equal-quality matches.
        # FR-17g / FR-SEA-01 / #306, #324.
        queryset = queryset.annotate(
            _match_score=(
                Case(
                    When(title__icontains=search, then=Value(TITLE_WEIGHT)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
                + Case(
                    When(tags__name__icontains=search, then=Value(TAG_WEIGHT)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
                + Case(
                    When(description__icontains=search, then=Value(DESC_WEIGHT)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )
        ).filter(_match_score__gt=0).order_by('-_match_score', '-hot_score').distinct()

        return queryset


class TypeStrategy(SearchStrategy):
    """
    Filter services by type (Offer, Need, or Event).

    Parameters:
        - type: 'Offer', 'Need', or 'Event'
    """

    def apply(self, queryset: QuerySet, params: dict[str, Any]) -> QuerySet:
        service_type = params.get('type')

        if service_type and service_type in ['Offer', 'Need', 'Event']:
            queryset = queryset.filter(type=service_type)

        return queryset


class SearchEngine:
    """
    Composite search engine that applies multiple filter strategies.

    Uses the Strategy Pattern to combine location-based, tag-based,
    text-based, and type-based filtering into a unified search interface.

    After filtering, applies weighted scoring annotations when search
    or tag parameters are present (FR-SEA-01):
        - Title match: 1.0
        - Direct tag match: 0.8
        - Description match: 0.6
        - Parent tag match: 0.5
        - Tag name match: 0.3
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
        Apply all search strategies to the queryset, then annotate
        with relevance scores when search/tag parameters are present.

        Args:
            queryset: Base QuerySet to filter
            params: Dictionary containing all search parameters:
                - type: 'Offer' or 'Need'
                - tags: List of tag IDs
                - tag: Single tag ID
                - search: Text search query
                - entity_type: Broad entity type filter
                - lat: User latitude
                - lng: User longitude
                - distance: Max distance in km

        Returns:
            Filtered and potentially scored/ordered QuerySet
        """
        has_location = params.get('lat') is not None and params.get('lng') is not None

        for strategy in self.strategies:
            queryset = strategy.apply(queryset, params)

        # Apply scoring when search or tag params are present
        search_term = (params.get('search') or '').strip()
        tag_ids = list(params.get('tags', []))
        single_tag = params.get('tag')
        if single_tag and single_tag not in tag_ids:
            tag_ids.append(single_tag)

        if not search_term and not tag_ids:
            return queryset

        score_parts = []

        if search_term:
            # Title match -> 1.0
            score_parts.append(
                Case(
                    When(title__icontains=search_term, then=Value(1.0)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )
            # Description match -> 0.6
            score_parts.append(
                Case(
                    When(description__icontains=search_term, then=Value(0.6)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )
            # Tag name match -> 0.3
            score_parts.append(
                Case(
                    When(tags__name__icontains=search_term, then=Value(0.3)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )

        if tag_ids:
            # Direct tag match -> 0.8
            score_parts.append(
                Case(
                    When(tags__id__in=tag_ids, then=Value(0.8)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )
            # Parent tag match -> 0.5
            score_parts.append(
                Case(
                    When(tags__parent_qid__in=tag_ids, then=Value(0.5)),
                    default=Value(0.0),
                    output_field=FloatField(),
                )
            )

        if score_parts:
            total_score = score_parts[0]
            for part in score_parts[1:]:
                total_score = total_score + part

            queryset = queryset.annotate(
                search_score=total_score
            ).distinct()

            # Location ordering takes precedence
            if not has_location:
                queryset = queryset.order_by('-search_score')

        return queryset
