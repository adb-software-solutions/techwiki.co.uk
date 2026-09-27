# TechWiki

[![Backend CI](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/backend-ci.yml)
[![Website CI](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/website-ci.yml/badge.svg)](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/website-ci.yml)
[![Authentication CI](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/auth-frontend.yml/badge.svg)](https://github.com/adb-software-solutions/techwiki.co.uk/actions/workflows/auth-frontend.yml)

The source code behind [techwiki.co.uk](https://techwiki.co.uk) — a community-focused knowledge platform for technical documentation, tutorials, and articles.

TechWiki combines a server-rendered public website, a Django API, and a dedicated authentication application. It supports structured publishing workflows, contributor profiles, moderation, analytics, passkeys, and two-factor authentication.

It replaces MediaWiki with a modern, performant, and secure platform for technical content.

## Highlights

- Articles, tutorials, blogs, categories, tags, search, and author pages
- Markdown authoring with image uploads and previews
- Draft, review, publishing, moderation, and archive workflows
- Contributor, moderator, staff, and administrator roles
- Password, passkey/WebAuthn, TOTP, and recovery-code authentication
- Shared sessions across TechWiki applications
- Contributor, moderation, analytics, and administration dashboards
- Automated tests, type checks, container builds, and security scans

## Architecture

| Service          | Stack                                    |   Port | Responsibility                                          |
| ---------------- | ---------------------------------------- | -----: | ------------------------------------------------------- |
| `website/`       | Next.js, React, TypeScript, Tailwind CSS | `3000` | Public wiki, authoring, moderation, and dashboards      |
| `auth-frontend/` | React, Vite, TypeScript                  | `5173` | Login, registration, passkeys, and 2FA                  |
| `backend/`       | Django, Django Ninja, PostgreSQL, Redis  | `8000` | APIs, content, accounts, sessions, email, and analytics |

```text
Browser
   ├── website (Next.js) ───────┐
   └── auth-frontend (Vite) ────┼── backend (Django/Django Ninja)
                                ├── PostgreSQL
                                └── Redis
```

## Repository layout

```text
.
├── auth-frontend/       Authentication SPA
├── backend/             Django APIs, models, tests, and migrations
│   ├── apps/wiki/       Content, moderation, and contributor profiles
│   ├── apps/analytics/  Page-view and content analytics
│   └── authentication/  Accounts, sessions, passkeys, and two-factor auth
├── website/             Next.js App Router website
├── tools/               Shared lint, test, and repository utilities
├── .github/workflows/   CI, security scans, images, and deployment
└── Dockerfile.*         Production container definitions
```

## Local development

### Prerequisites

- Python 3.12
- Node.js 22
- pnpm 10
- PostgreSQL 14+
- Redis 7+

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate

python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements/dev.txt

pnpm install --frozen-lockfile
pnpm --dir website install --frozen-lockfile
pnpm --dir auth-frontend install --frozen-lockfile
```

### Backend

Start PostgreSQL and Redis, create a local database, then export:

```bash
export DEBUG=1
export SECRET_KEY='replace-with-a-local-development-key'
export SITE_DOMAIN=localhost
export FRONTEND_URL=http://localhost:3000
export AUTH_FRONTEND_URL=http://localhost:5173
export SQL_ENGINE=django.db.backends.postgresql
export SQL_DATABASE=techwiki_dev
export SQL_USER=techwiki
export SQL_PASSWORD=techwiki_dev_password
export SQL_HOST=localhost
export SQL_PORT=5432
export SESSION_BACKEND_URL=redis://localhost:6379/1
export CACHE_BACKEND_URL=redis://localhost:6379/2
```

```bash
cd backend
python manage.py migrate
python manage.py runserver 8000
```

### Frontends

Create `website/.env.local`:

```dotenv
SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_AUTH_URL=http://localhost:5173
```

Create `auth-frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:8000/api/v1/auth-service
VITE_APP_URL=http://localhost:3000
VITE_AUTH_URL=http://localhost:5173
```

Run each frontend in its own terminal:

```bash
pnpm --dir website dev
pnpm --dir auth-frontend dev
```

Visit [localhost:3000](http://localhost:3000) for the wiki and [localhost:5173](http://localhost:5173) for authentication.

### Analytics and advertising

Google Analytics and AdSense are optional. Configure public build-time values
in `website/.env.local` for development and in the website's Infisical application
environment for production. The website workflow exports them to
`website/.ci.env` before building the Docker image.

```dotenv
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-0000000000000000
```

The AdSense client ID enables its script, account metadata, and the local
`/ads.txt` seller entry. Rebuild the website image after changing these values.

The privacy policy is available at `/privacy` and is linked from website and
account-page footers. Review privacy and consent settings before enabling
analytics or advertising.

## Common commands

| Command                            | Description                                              |
| ---------------------------------- | -------------------------------------------------------- |
| `tools/lint`                       | Run repository-wide formatting, linting, and type checks |
| `tools/lint --fix`                 | Apply supported automatic fixes                          |
| `tools/test-all`                   | Run backend and website tests                            |
| `tools/test-backend`               | Run Django tests                                         |
| `tools/test-website`               | Run website tests                                        |
| `tools/test-auth-frontend`         | Run authentication frontend tests                        |
| `pnpm --dir website build`         | Build the production website                             |
| `pnpm --dir auth-frontend build`   | Type-check and build the authentication SPA              |
| `tools/update-locked-requirements` | Regenerate pinned Python dependencies                    |

## Containers

```bash
docker build -f Dockerfile.backend -t techwiki-backend .
docker build -f Dockerfile.website -t techwiki-website .
docker build -f Dockerfile.auth-frontend -t techwiki-auth-frontend .
```

The images expose ports `8000`, `3000`, and `80`. Supply secrets and infrastructure addresses through the deployment environment; never commit them.

## Quality and security

CI runs Django, Jest, and Vitest tests; Ruff, mypy, ESLint, Prettier, Stylelint, ShellCheck, and template checks; production builds; Trivy scans; coverage; and bundle analysis.

Before submitting a pull request:

```bash
tools/lint
tools/test-all
pnpm --dir auth-frontend test --run
pnpm --dir website build
pnpm --dir auth-frontend build
```

## Contributing

Bug reports, feature proposals, documentation improvements, and pull requests are welcome.

1. Open an issue before substantial changes.
2. Create a focused branch from `main`.
3. Add or update tests for behavior changes.
4. Run the checks above.
5. Explain the problem, solution, and deployment impact in the pull request.

Never include credentials, private keys, production data, or personal information in issues, commits, fixtures, or screenshots.

## Links

- [TechWiki](https://techwiki.co.uk)
- [ADB Software Solutions](https://github.com/adb-software-solutions)
- [Issue tracker](https://github.com/adb-software-solutions/techwiki.co.uk/issues)

## License

The source code is licensed under the [MIT License](LICENSE). Copyright © 2026
Adam Birds trading as ADB Software Solutions.

The software license does not grant rights to the TechWiki name, branding,
official website content, or the `techwiki.co.uk` domain. See the
[brand and content notice](BRAND.md) for details.
