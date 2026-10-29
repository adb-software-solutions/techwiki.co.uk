# Use Ubuntu as base image for consistency with your existing setup
FROM ubuntu:24.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=development

# Install system packages
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y \
    # Python dependencies
    python3.12 \
    python3-pip \
    python3.12-venv \
    python3.12-dev \
    build-essential \
    bash-completion \
    libpq-dev \
    gcc \
    # Node.js dependencies
    curl \
    wget \
    # General development tools
    bubblewrap \
    git \
    vim \
    htop \
    procps \
    # Additional dependencies
    autoconf \
    automake \
    pkg-config \
    libtool \
    libffi-dev \
    libcairo2 \
    libcairo2-dev \
    fontconfig \
    sudo \
    # For frontend development
    libnss3-dev \
    libatk-bridge2.0-dev \
    libdrm2 \
    libxkbcommon-dev \
    libgtk-3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y locales \
    && locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Corepack: activate pnpm only (no Yarn)
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable \
    && corepack prepare pnpm@10.15.0 --activate

# Install Starship prompt
RUN curl -fsSL https://starship.rs/install.sh | sh -s -- -y -b /usr/local/bin

# Copy and run your existing setup scripts for shellcheck and shfmt
COPY tools/setup/install-shellcheck /tmp/install-shellcheck
COPY tools/setup/install-shfmt /tmp/install-shfmt
RUN chmod +x /tmp/install-shellcheck /tmp/install-shfmt \
    && /tmp/install-shellcheck \
    && /tmp/install-shfmt \
    && rm /tmp/install-shellcheck /tmp/install-shfmt

# Global npm tools (keep minimal; pnpm handled by corepack)
RUN npm install -g --no-audit --no-fund \
    typescript \
    ts-node

# Copy font files
COPY backend/static/Inter-SemiBold.woff2 /usr/share/fonts/Inter-SemiBold.woff2
RUN fc-cache -f -v

# Create Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# Install Python dependencies
COPY backend/requirements/dev.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

# Set working directory
WORKDIR /workspace

# Copy development scripts
COPY .devcontainer/scripts/ /usr/local/bin/

# Make scripts executable
RUN chmod +x /usr/local/bin/*

# Keep container running
CMD ["sleep", "infinity"]
