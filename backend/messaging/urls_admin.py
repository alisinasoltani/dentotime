from django.urls import path
from .views import (
    AdminConversationHistoryDetailView,
    AdminConversationHistoryListView,
    AdminThreadUpdateView,
)

urlpatterns = [
    path("history/", AdminConversationHistoryListView.as_view(), name="admin_chat_history"),
    path(
        "history/<uuid:pk>/",
        AdminConversationHistoryDetailView.as_view(),
        name="admin_chat_history_detail",
    ),
    path("threads/<uuid:pk>/", AdminThreadUpdateView.as_view(), name="admin_thread_update"),
]
