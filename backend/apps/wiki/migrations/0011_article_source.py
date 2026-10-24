from typing import Any

from django.db import migrations, models


def mark_authoring_articles(apps: Any, schema_editor: Any) -> None:
    """Articles created through the authoring API are recorded in its audit log."""
    article_model = apps.get_model("wiki", "Article")
    audit_model = apps.get_model("wiki", "AuthoringAuditLog")
    article_ids = audit_model.objects.filter(action="article.draft.create").values_list(
        "object_id", flat=True
    )
    article_model.objects.filter(id__in=list(article_ids)).update(source="authoring")


class Migration(migrations.Migration):
    dependencies = [
        ("wiki", "0010_authoring_audit_json_encoder"),
    ]

    operations = [
        migrations.AddField(
            model_name="article",
            name="source",
            field=models.CharField(
                choices=[("web", "Website"), ("authoring", "Authoring API")],
                db_index=True,
                default="web",
                max_length=20,
            ),
        ),
        migrations.RunPython(mark_authoring_articles, migrations.RunPython.noop),
    ]
