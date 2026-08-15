from rest_framework.pagination import PageNumberPagination


class BoundedPageNumberPagination(PageNumberPagination):
    """A stable page envelope with a client-controlled but bounded page size."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

