import django.core.serializers.json
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wiki", "0009_bind_authoring_oauth_resource"),
    ]

    operations = [
        migrations.AlterField(
            model_name="authoringauditlog",
            name="before",
            field=models.JSONField(
                blank=True,
                encoder=django.core.serializers.json.DjangoJSONEncoder,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="authoringauditlog",
            name="after",
            field=models.JSONField(
                blank=True,
                encoder=django.core.serializers.json.DjangoJSONEncoder,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="authoringauditlog",
            name="metadata",
            field=models.JSONField(
                blank=True,
                default=dict,
                encoder=django.core.serializers.json.DjangoJSONEncoder,
            ),
        ),
    ]
