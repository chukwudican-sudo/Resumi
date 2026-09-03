# The LaTeX compiler, and nothing else.
#
# Two things here are load-bearing:
#
#   1. tectonic is pinned. A resume that compiled last month must compile the
#      same way today, and "latest" makes the output depend on when the image
#      happened to be built.
#
#   2. A dummy document is compiled at build time. tectonic fetches its package
#      bundle on first use, which takes 30-60 seconds over the network — doing
#      it here bakes the packages into the image, so the first real request on a
#      cold machine is about a second and needs no network at all.
FROM node:22-slim

ARG TECTONIC_VERSION=0.16.9

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
 && tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic \
 && rm /tmp/tectonic.tar.gz \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && tectonic --version

# Runs as a normal user. Nothing here needs root, and TeX is a language with
# filesystem access — the less it can reach, the less a bug in it is worth.
RUN useradd --create-home --shell /usr/sbin/nologin app
USER app
WORKDIR /home/app

# Warm the package bundle into the image, as the user that will use it —
# tectonic's cache is per-home, so doing this as root would leave it unused.
RUN mkdir -p /tmp/warm \
 && printf '%s\n' \
      '\documentclass[letterpaper,11pt]{article}' \
      '\usepackage{latexsym}\usepackage[empty]{fullpage}\usepackage{titlesec}' \
      '\usepackage{marvosym}\usepackage[usenames,dvipsnames]{color}' \
      '\usepackage{verbatim}\usepackage{enumitem}' \
      '\usepackage[hidelinks]{hyperref}\usepackage{fancyhdr}' \
      '\usepackage[english]{babel}\usepackage{tabularx}' \
      '\begin{document}\section{Warm}\href{https://example.com}{x}\end{document}' \
      > /tmp/warm/warm.tex \
 && tectonic -X compile /tmp/warm/warm.tex --outdir /tmp/warm --outfmt pdf \
 && rm -rf /tmp/warm

COPY --chown=app:app src/server.mjs ./server.mjs

ENV PORT=8080 NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.mjs"]
