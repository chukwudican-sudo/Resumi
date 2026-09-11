# Compile service

Turns LaTeX into a PDF. That is the whole job.

## Why it exists

`tectonic` has to run somewhere, and it cannot run on Vercel — the app's
serverless functions have no TeX installation and no way to get one. Without
this, a deployed Resumi9 cannot produce a PDF for anybody.

## What it is allowed to know

Nothing. No database, no user rows, no API keys, no outbound network during a
compile. It receives LaTeX, returns bytes, and forgets. That is the point: TeX
is a full programming language with filesystem access, so the container is kept
worth as little as possible to whoever might reach it.

The LaTeX it receives is always produced by the app's own renderer from a
stored resume. Nothing a browser sends reaches TeX — see `app/api/compile`.

## Deploying

    fly launch --no-deploy          # once; creates the app from fly.toml
    fly secrets set COMPILE_TOKEN="$(openssl rand -hex 32)"
    fly deploy

Then put the same values in the Next app's environment:

    COMPILE_SERVICE_URL=https://resumi-compile.fly.dev
    COMPILE_TOKEN=<the same token>

With those unset, the app compiles locally instead, which is what makes
development work without any of this.
