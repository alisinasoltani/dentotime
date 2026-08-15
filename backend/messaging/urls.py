from django.urls import path
from .realtime_views import thread_event_stream
from .views import ThreadListView, ThreadGetOrCreateView, MessageListCreateView, MessageDeltaView, ThreadMarkReadView, GuestMessageView

urlpatterns = [
    path("threads/", ThreadListView.as_view(), name="thread_list"),
    path("threads/get_or_create/", ThreadGetOrCreateView.as_view(), name="thread_get_or_create"),
    path("threads/<uuid:pk>/messages/", MessageListCreateView.as_view(), name="thread_messages"),
    path("threads/<uuid:pk>/messages/delta/", MessageDeltaView.as_view(), name="thread_message_delta"),
    path("threads/<uuid:pk>/events/", thread_event_stream, name="thread_events"),
    path("threads/<uuid:pk>/read/", ThreadMarkReadView.as_view(), name="thread_mark_read"),
    path("guest-message/", GuestMessageView.as_view(), name="guest_message"),
]
