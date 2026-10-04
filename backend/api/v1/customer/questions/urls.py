from __future__ import annotations

from django.urls import path

from .views import CustomerQuestionCreateView, CustomerQuestionListView

app_name = "customer_questions"

urlpatterns = [
    path("", CustomerQuestionListView.as_view(), name="question-list"),
    path(
        "products/<uuid:product_id>/",
        CustomerQuestionCreateView.as_view(),
        name="question-create",
    ),
]
