from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from PIL import Image

from apps.accounts.constants import UserRole
from apps.accounts.tests.helpers import create_user
from apps.catalog.factories import ProductFactory, ProductReviewFactory, ProductVariantFactory
from apps.catalog.models import ProductReview, ProductReviewImage
from apps.orders.factories import SalesOrderFactory, SalesOrderLineFactory
from apps.orders.models import SalesOrder

pytestmark = pytest.mark.django_db


def _delivered_purchase(customer, product):
    variant = ProductVariantFactory(product=product)
    order = SalesOrderFactory(customer=customer, status=SalesOrder.Status.DELIVERED)
    SalesOrderLineFactory(order=order, variant=variant)
    return variant


def test_customer_with_delivered_order_can_review_product(api_client):
    customer = create_user(email="review-buyer@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 5, "comment": "Loved it"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["is_verified_purchase"] is True


def test_review_without_purchase_is_rejected(api_client):
    customer = create_user(email="review-no-purchase@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    ProductVariantFactory(product=product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 4, "comment": "Never bought it"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "purchase_required"


def test_duplicate_review_is_rejected(api_client):
    customer = create_user(email="review-dup@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)
    ProductReviewFactory(customer=customer, product=product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 3, "comment": "Again"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_reviewed"


def test_rating_out_of_range_is_rejected(api_client):
    customer = create_user(email="review-badrating@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 7, "comment": "Too high"},
        format="json",
    )

    assert response.status_code == 400


def test_customer_can_edit_and_delete_own_review(api_client):
    customer = create_user(email="review-owner@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    review = ProductReviewFactory(customer=customer, product=product, rating=3)

    patch_response = api_client.patch(
        f"/api/v1/customer/reviews/{review.id}/", {"rating": 5}, format="json"
    )
    assert patch_response.status_code == 200
    assert patch_response.data["data"]["rating"] == 5

    delete_response = api_client.delete(f"/api/v1/customer/reviews/{review.id}/")
    assert delete_response.status_code == 204


def test_customer_cannot_edit_another_customers_review(api_client):
    owner = create_user(email="review-owner2@example.com")
    intruder = create_user(email="review-intruder@example.com")
    review = ProductReviewFactory(customer=owner)

    api_client.force_authenticate(user=intruder)
    response = api_client.patch(
        f"/api/v1/customer/reviews/{review.id}/", {"rating": 1}, format="json"
    )

    assert response.status_code == 404


def test_admin_can_moderate_delete_any_review(api_client):
    admin = create_user(email="review-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    review = ProductReviewFactory()

    response = api_client.delete(f"/api/v1/admin/catalog/reviews/{review.id}/")

    assert response.status_code == 204


def test_public_can_list_product_reviews_with_summary(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product)
    ProductReviewFactory(product=product, rating=4)
    ProductReviewFactory(product=product, rating=2)

    response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 2
    assert response.data["data"]["review_count"] == 2
    assert response.data["data"]["average_rating"] == 3.0
    assert response.data["data"]["rating_counts"] == {"5": 0, "4": 1, "3": 0, "2": 1, "1": 0}


def test_product_review_list_query_count_does_not_grow_with_reviews(api_client):
    product = ProductFactory()
    ProductVariantFactory(product=product)
    ProductReviewFactory(product=product)
    with CaptureQueriesContext(connection) as small:
        assert (
            api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/").status_code
            == 200
        )

    for _ in range(5):
        ProductReviewFactory(product=product)
    with CaptureQueriesContext(connection) as large:
        assert (
            api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/").status_code
            == 200
        )

    assert len(large) == len(small)


def picture(name: str = "photo.png", image_format: str = "PNG") -> SimpleUploadedFile:
    """A fresh file per call — an upload consumes the pointer, so a shared one
    would post an empty body to every test after the first."""
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(buffer, format=image_format)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _buyer(api_client, email: str):
    """An authenticated customer and a product they have received."""
    customer = create_user(email=email)
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    _delivered_purchase(customer, product)
    return customer, product


def _post_review(api_client, product, images, **fields):
    return api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 5, "comment": "With pictures", "images": images, **fields},
        format="multipart",
    )


def _stored_files(tmp_path) -> list:
    return [path for path in tmp_path.rglob("*") if path.is_file()]


def test_review_without_pictures_returns_an_empty_images_list(api_client):
    _, product = _buyer(api_client, "review-nopics@example.com")

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/", {"rating": 5}, format="json"
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["images"] == []


def test_review_can_be_submitted_with_a_picture(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-onepic@example.com")

    response = _post_review(api_client, product, [picture()])

    assert response.status_code == 201, response.data
    assert response.data["data"]["rating"] == 5
    assert response.data["data"]["is_verified_purchase"] is True
    (url,) = response.data["data"]["images"]
    assert url.startswith("/media/reviews/") and url.endswith(".png")
    stored = ProductReviewImage.objects.get(review_id=response.data["data"]["id"])
    assert (tmp_path / stored.image.name).is_file()


def test_review_pictures_keep_their_order_and_show_on_the_public_list(
    api_client, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-manypics@example.com")

    response = _post_review(
        api_client, product, [picture("a.png"), picture("b.jpg", "JPEG"), picture("c.png")]
    )

    assert response.status_code == 201, response.data
    urls = response.data["data"]["images"]
    assert [url.rsplit(".", 1)[1] for url in urls] == ["png", "jpg", "png"]
    assert len(set(urls)) == 3

    api_client.force_authenticate(user=None)
    listing = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/")
    assert listing.status_code == 200
    assert listing.data["data"]["results"][0]["images"] == urls


def test_review_picture_extension_comes_from_the_bytes_not_the_name(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-misnamed@example.com")

    response = _post_review(api_client, product, [picture("shell.php")])

    assert response.status_code == 201, response.data
    assert response.data["data"]["images"][0].endswith(".png")


@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("payload.png", b"<script>alert(1)</script>", "invalid_image"),
        ("notes.txt", b"hello", "invalid_image"),
        (
            "logo.svg",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "invalid_image",
        ),
        ("photo.bmp", None, "unsupported_media_type"),
    ],
)
def test_review_with_a_bad_picture_is_rejected_whole(
    api_client, settings, tmp_path, name, content, code
):
    """One bad file fails the submission: no review, and the good picture sent
    alongside it never reaches storage."""
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-badpic@example.com")
    if content is None:
        content = picture(image_format="BMP").read()
    bad = SimpleUploadedFile(name, content, content_type="image/png")

    response = _post_review(api_client, product, [picture(), bad])

    assert response.status_code == 400
    assert response.data["error"]["code"] == code
    assert not ProductReview.objects.filter(product=product).exists()
    assert _stored_files(tmp_path) == []


def test_review_with_an_oversized_picture_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    upload = picture()
    settings.MAX_UPLOAD_SIZE = upload.size - 1
    _, product = _buyer(api_client, "review-bigpic@example.com")

    response = _post_review(api_client, product, [upload])

    assert response.status_code == 400
    assert response.data["error"]["code"] == "file_too_large"
    assert not ProductReview.objects.filter(product=product).exists()
    assert _stored_files(tmp_path) == []


def test_review_with_too_many_pictures_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-toomany@example.com")

    response = _post_review(api_client, product, [picture() for _ in range(6)])

    assert response.status_code == 400
    assert response.data["error"]["code"] == "too_many_images"
    assert _stored_files(tmp_path) == []


def test_review_images_must_be_files(api_client):
    _, product = _buyer(api_client, "review-notfile@example.com")

    response = api_client.post(
        f"/api/v1/customer/reviews/products/{product.id}/",
        {"rating": 5, "images": ["https://example.com/a.png"]},
        format="json",
    )

    assert response.status_code == 400
    assert not ProductReview.objects.filter(product=product).exists()


def test_anonymous_review_with_a_picture_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    product = ProductFactory()

    response = _post_review(api_client, product, [picture()])

    assert response.status_code == 401
    assert _stored_files(tmp_path) == []


def test_staff_cannot_submit_a_review_with_a_picture(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin = create_user(email="review-pic-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    product = ProductFactory()

    response = _post_review(api_client, product, [picture()])

    assert response.status_code == 403
    assert _stored_files(tmp_path) == []


def test_review_with_a_picture_still_needs_a_purchase(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    customer = create_user(email="review-pic-nopurchase@example.com")
    api_client.force_authenticate(user=customer)
    product = ProductFactory()
    ProductVariantFactory(product=product)

    response = _post_review(api_client, product, [picture()])

    assert response.status_code == 400
    assert response.data["error"]["code"] == "purchase_required"
    assert _stored_files(tmp_path) == []


def test_duplicate_review_with_a_picture_is_rejected(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    customer, product = _buyer(api_client, "review-pic-dup@example.com")
    ProductReviewFactory(customer=customer, product=product)

    response = _post_review(api_client, product, [picture()])

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_reviewed"
    assert _stored_files(tmp_path) == []


def test_rating_is_still_validated_on_a_multipart_review(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    _, product = _buyer(api_client, "review-pic-badrating@example.com")

    response = _post_review(api_client, product, [picture()], rating=7)

    assert response.status_code == 400
    assert _stored_files(tmp_path) == []


def test_product_review_list_query_count_does_not_grow_with_review_pictures(
    api_client, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    product = ProductFactory()
    ProductVariantFactory(product=product)

    def add_review_with_pictures():
        review = ProductReviewFactory(product=product)
        for sort_order in range(2):
            ProductReviewImage.objects.create(review=review, image=picture(), sort_order=sort_order)

    add_review_with_pictures()
    with CaptureQueriesContext(connection) as small:
        response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/")
    assert len(response.data["data"]["results"][0]["images"]) == 2

    for _ in range(5):
        add_review_with_pictures()
    with CaptureQueriesContext(connection) as large:
        response = api_client.get(f"/api/v1/public/catalog/products/{product.slug}/reviews/")

    assert all(len(row["images"]) == 2 for row in response.data["data"]["results"])
    assert len(large) == len(small)


def test_admin_review_list_shows_review_pictures(api_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    review = ProductReviewFactory()
    for sort_order in range(2):
        ProductReviewImage.objects.create(review=review, image=picture(), sort_order=sort_order)
    ProductReviewFactory()
    admin = create_user(email="review-pics-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/catalog/reviews/")

    assert response.status_code == 200
    images = {row["id"]: row["images"] for row in response.data["data"]["results"]}
    assert len(images) == 2
    urls = images[str(review.id)]
    assert len(urls) == 2
    assert all(url.startswith("http://testserver/media/reviews/") for url in urls)
    assert sum(len(urls) for urls in images.values()) == 2


def test_admin_review_list_query_count_does_not_grow_with_review_pictures(
    api_client, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    admin = create_user(email="review-pics-admin-n1@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    def add_review_with_picture():
        ProductReviewImage.objects.create(review=ProductReviewFactory(), image=picture())

    add_review_with_picture()
    with CaptureQueriesContext(connection) as small:
        assert api_client.get("/api/v1/admin/catalog/reviews/").status_code == 200

    for _ in range(5):
        add_review_with_picture()
    with CaptureQueriesContext(connection) as large:
        assert api_client.get("/api/v1/admin/catalog/reviews/").status_code == 200

    assert len(large) == len(small)


@pytest.mark.parametrize("as_admin", [False, True])
def test_deleting_a_review_removes_its_picture_files(
    api_client, settings, tmp_path, django_capture_on_commit_callbacks, as_admin
):
    settings.MEDIA_ROOT = tmp_path
    customer = create_user(email="review-pic-delete@example.com")
    review = ProductReviewFactory(customer=customer)
    for sort_order in range(2):
        ProductReviewImage.objects.create(review=review, image=picture(), sort_order=sort_order)
    assert len(_stored_files(tmp_path)) == 2

    if as_admin:
        user = create_user(email="review-pic-delete-admin@example.com", role=UserRole.ADMIN)
        url = f"/api/v1/admin/catalog/reviews/{review.id}/"
    else:
        user, url = customer, f"/api/v1/customer/reviews/{review.id}/"
    api_client.force_authenticate(user=user)
    with django_capture_on_commit_callbacks(execute=True):
        response = api_client.delete(url)

    assert response.status_code == 204
    assert not ProductReviewImage.objects.exists()
    assert _stored_files(tmp_path) == []
