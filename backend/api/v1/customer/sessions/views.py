from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors.sessions import active_sessions_for_user
from apps.accounts.services.sessions import revoke_other_sessions, revoke_session
from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception

from .serializers import RevokeOtherSessionsSerializer, SessionSerializer


@extend_schema(tags=["Sessions"])
class SessionListView(APIView):
    serializer_class = SessionSerializer
    """Lists the current user's active sessions (outstanding, non-revoked
    refresh tokens) -- e.g. for a "manage your devices" screen."""

    permission_classes: ClassVar[list] = [IsAuthenticated]

    def get(self, request) -> Response:
        sessions = active_sessions_for_user(request.user)
        return Response({"data": SessionSerializer(sessions, many=True).data, "message": "Success"})


@extend_schema(tags=["Sessions"])
class SessionRevokeView(APIView):
    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request, session_id: int) -> Response:
        try:
            revoke_session(user=request.user, session_id=session_id)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["Sessions"])
class RevokeOtherSessionsView(APIView):
    serializer_class = RevokeOtherSessionsSerializer
    """Logs the user out of every other device, keeping the session tied to
    the refresh token supplied in the request body."""

    permission_classes: ClassVar[list] = [IsAuthenticated]

    @extend_schema(
        request=RevokeOtherSessionsSerializer,
        examples=[
            OpenApiExample(
                "Revoke other sessions response",
                value={"data": {"revoked": 2}, "message": "Success"},
                response_only=True,
            ),
        ],
    )
    def post(self, request) -> Response:
        serializer = RevokeOtherSessionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            revoked = revoke_other_sessions(
                user=request.user,
                current_refresh_token=serializer.validated_data["refresh"],
            )
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": {"revoked": revoked}, "message": "Success"})
