from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wiki", "0008_authoringoauthclient_authoringoauthcode_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="authoringapitoken",
            name="resource",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="authoringoauthcode",
            name="resource",
            field=models.URLField(default="https://api.techwiki.co.uk/admin-mcp", max_length=500),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="authoringoauthrefreshtoken",
            name="resource",
            field=models.URLField(default="https://api.techwiki.co.uk/admin-mcp", max_length=500),
            preserve_default=False,
        ),
    ]
