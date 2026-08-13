from django.urls import path
from .views import ThreadListView, ThreadGetOrCreateView, MessageListCreateView, ThreadMarkReadView, GuestMessageView

urlpatterns = [
    path("threads/", ThreadListView.as_view(), name="thread_list"),
    path("threads/get_or_create/", ThreadGetOrCreateView.as_view(), name="thread_get_or_create"),
    path("threads/<uuid:pk>/messages/", MessageListCreateView.as_view(), name="thread_messages"),
    path("threads/<uuid:pk>/read/", ThreadMarkReadView.as_view(), name="thread_mark_read"),
    path("guest-message/", GuestMessageView.as_view(), name="guest_message"),
]