"""Authenticated SSE endpoint kept outside DRF's synchronous view dispatch."""

from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import Http404, JsonResponse, StreamingHttpResponse
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied
from django.db.models import Q

from accounts.authentication import SessionVersionJWTAuthentication
from accounts.models import Doctor
from messaging.models import MessageThread
from messaging.realtime import stream_thread_events


@sync_to_async(thread_sensitive=True)
def _authenticate_and_authorize(request, thread_id):
    authentication = SessionVersionJWTAuthentication()
    result = authentication.authenticate(request)
    if result is None:
        raise AuthenticationFailed("Authentication credentials were not provided.")
    user, validated_token = result
    queryset = MessageThread.objects.filter(deleted_at__isnull=True)
    if user.is_admin_role:
        queryset = queryset.exclude(thread_type=MessageThread.ThreadType.DIRECT)
    else:
        queryset = queryset.filter(
            Q(participant_id=user.pk)
            | Q(direct_participant_one_id=user.pk)
            | Q(direct_participant_two_id=user.pk)
        )
    try:
        thread = queryset.only(
            "id",
            "participant_id",
            "direct_participant_one_id",
            "direct_participant_two_id",
        ).get(pk=thread_id)
    except MessageThread.DoesNotExist as exc:
        raise Http404 from exc
    if user.is_doctor_role and not Doctor.objects.filter(
        pk=user.pk,
        is_active=True,
        verification_status=Doctor.VerificationStatus.APPROVED,
    ).exists():
        raise PermissionDenied("Chat privileges are disabled.")
    return user, int(validated_token["exp"]), thread


async def thread_event_stream(request, pk):
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed."}, status=405)
    if not settings.REDIS_URL:
        return JsonResponse(
            {"detail": "Realtime delivery is not configured."},
            status=503,
        )
    try:
        user, token_expires_at, thread = await _authenticate_and_authorize(request, pk)
    except Http404:
        return JsonResponse({"detail": "Not found."}, status=404)
    except APIException as exc:
        return JsonResponse({"detail": str(exc.detail)}, status=exc.status_code)

    last_event_id = request.headers.get("Last-Event-ID") or request.GET.get(
        "last_event_id"
    )
    response = StreamingHttpResponse(
        stream_thread_events(
            thread_id=thread.pk,
            user_is_admin=user.is_admin_role,
            last_event_id=last_event_id,
            token_expires_at=token_expires_at,
        ),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache, no-store, must-revalidate, no-transform"
    response["X-Accel-Buffering"] = "no"
    response["Vary"] = "Authorization, Last-Event-ID"
    return response
